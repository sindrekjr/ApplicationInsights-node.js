import {
    AvailabilityData,
    TelemetryItem,
    TelemetryEventData,
    TelemetryExceptionData,
    TelemetryExceptionDetails,
    DataPointType,
    MessageData,
    MetricsData,
    MetricDataPoint,
    RemoteDependencyData,
    RequestData,
    MonitorBase,
    PageViewData,
} from "../generated";
import Contracts = require("../Declarations/Contracts")
import Util = require("./Util")
import Config = require("./Config");
import Context = require("./Context");
import { CorrelationContextManager } from "../AutoCollection/CorrelationContextManager";


/**
 * Manages the logic of creating envelopes from Telemetry objects
 */
class EnvelopeFactory {


    /**
     * Creates envelope ready to be sent by Channel
     * @param telemetry Telemetry data
     * @param telemetryType Type of telemetry
     * @param commonProperties Bag of custom common properties to be added to the envelope
     * @param context Client context
     * @param config Client configuration
     */
    public static createEnvelope(
        telemetry: Contracts.Telemetry,
        telemetryType: Contracts.TelemetryType,
        commonProperties?: { [key: string]: string; },
        context?: Context,
        config?: Config): TelemetryItem {

        var data: MonitorBase = {};
        switch (telemetryType) {
            case Contracts.TelemetryType.Trace:
                data.baseData = EnvelopeFactory.createTraceData(<MessageData>telemetry);
                data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Trace);
                break;
            case Contracts.TelemetryType.Dependency:
                data.baseData = EnvelopeFactory.createDependencyData(<Contracts.DependencyTelemetry>telemetry);
                data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Dependency);
                break;
            case Contracts.TelemetryType.Event:
                data.baseData = EnvelopeFactory.createEventData(<Contracts.EventTelemetry>telemetry);
                data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Event);
                break;
            case Contracts.TelemetryType.Exception:
                data.baseData = EnvelopeFactory.createExceptionData(<Contracts.ExceptionTelemetry>telemetry);
                data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Exception);
                break;
            case Contracts.TelemetryType.Request:
                data.baseData = EnvelopeFactory.createRequestData(<Contracts.RequestTelemetry>telemetry);
                data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Request);
                break;
            case Contracts.TelemetryType.Metric:
                data.baseData = EnvelopeFactory.createMetricData(<Contracts.MetricTelemetry>telemetry);
                data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Metric);
                break;
            case Contracts.TelemetryType.Availability:
                data.baseData = EnvelopeFactory.createAvailabilityData(<Contracts.AvailabilityTelemetry>telemetry);
                data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Availability);
                break;
            case Contracts.TelemetryType.PageView:
                data.baseData = EnvelopeFactory.createPageViewData(<Contracts.PageViewTelemetry>telemetry);
                data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.PageView);
                break;
        }

        if (commonProperties) {
            if (data && data.baseData) {
                // if no properties are specified just add the common ones
                if (!data.baseData.properties) {
                    data.baseData.properties = commonProperties;
                } else {
                    // otherwise, check each of the common ones
                    for (var name in commonProperties) {
                        // only override if the property `name` has not been set on this item
                        if (!data.baseData.properties[name]) {
                            data.baseData.properties[name] = commonProperties[name];
                        }
                    }
                }
            }

            // sanitize properties
            data.baseData.properties = Util.validateStringMap(data.baseData.properties);
        }

        var iKey = config ? config.instrumentationKey || "" : "";
        var envelope: TelemetryItem = {
            // this is kind of a hack, but the envelope name is always the same as the data name sans the chars "data"
            name: "Microsoft.ApplicationInsights." +
                iKey.replace(/-/g, "") +
                "." +
                data.baseType.substr(0, data.baseType.length - 4),
            time: new Date(),
        };
        envelope.data = {
            baseType: data.baseType,
            baseData: data.baseData
        };
        envelope.instrumentationKey = iKey;
        envelope.tags = this.getTags(context, telemetry.tagOverrides);
        envelope.version = 1;
        envelope.sampleRate = config ? config.samplingPercentage : 100;

        // Exclude metrics from sampling by default
        if (telemetryType === Contracts.TelemetryType.Metric) {
            envelope.sampleRate = 100;
        }

        return envelope;
    }

    private static createTraceData(telemetry: Contracts.TraceTelemetry): MessageData {
        var trace: MessageData = {
            version: 1,
            message: telemetry.message,
            properties: telemetry.properties
        };
        if (!isNaN(telemetry.severity)) {
            trace.severityLevel = telemetry.severity.toString();
        } else {
            trace.severityLevel = Contracts.SeverityLevel.Information.toString();
        }
        return trace;
    }

    private static createDependencyData(telemetry: Contracts.DependencyTelemetry & Contracts.Identified): RemoteDependencyData {
        var remoteDependency: RemoteDependencyData = {
            version: 1,
            name: telemetry.name && telemetry.name.length > 1024 ? telemetry.name.slice(0, 1021) + '...' : telemetry.name,
            duration: Util.msToTimeSpan(telemetry.duration)
        };

        remoteDependency.data = telemetry.data;
        remoteDependency.target = telemetry.target;
        remoteDependency.success = telemetry.success;
        remoteDependency.type = telemetry.dependencyTypeName;
        remoteDependency.properties = telemetry.properties;
        remoteDependency.resultCode = (telemetry.resultCode ? telemetry.resultCode + '' : '');

        if (telemetry.id) {
            remoteDependency.id = telemetry.id;
        }
        else {
            remoteDependency.id = Util.w3cTraceId();
        }
        return remoteDependency;
    }

    private static createEventData(telemetry: Contracts.EventTelemetry): TelemetryEventData {
        var event: TelemetryEventData = {
            version: 1,
            name: telemetry.name,
            properties: telemetry.properties,
            measurements: telemetry.measurements
        };
        event.properties = telemetry.properties;
        event.measurements = telemetry.measurements;
        return event;
    }

    private static createExceptionData(telemetry: Contracts.ExceptionTelemetry): TelemetryExceptionData {
        var exception: TelemetryExceptionData = {
            version: 1,
            exceptions: []
        };
        exception.properties = telemetry.properties;
        if (!isNaN(telemetry.severity)) {
            exception.severityLevel = telemetry.severity.toString();
        } else {
            exception.severityLevel = Contracts.SeverityLevel.Error.toString();
        }
        exception.measurements = telemetry.measurements;

        var stack = telemetry.exception["stack"];
        var exceptionDetails: TelemetryExceptionDetails = {
            message: telemetry.exception.message,
            typeName: telemetry.exception.name,
            parsedStack: this.parseStack(stack)
        };
        exceptionDetails.hasFullStack = Util.isArray(exceptionDetails.parsedStack) && exceptionDetails.parsedStack.length > 0;
        exception.exceptions.push(exceptionDetails);
        return exception;
    }

    private static createRequestData(telemetry: Contracts.RequestTelemetry & Contracts.Identified): RequestData {
        var requestData: RequestData = {
            version: 1,
            name: telemetry.name,
            url: telemetry.url,
            id: telemetry.id ? telemetry.id : Util.w3cTraceId(),
            source: telemetry.source,
            duration: Util.msToTimeSpan(telemetry.duration),
            responseCode: (telemetry.resultCode ? telemetry.resultCode + '' : ''),
            success: telemetry.success,
            properties: telemetry.properties
        };
        return requestData;
    }

    private static createMetricData(telemetry: Contracts.MetricTelemetry): MetricsData {
        var metricDataPoints: MetricDataPoint[] = [];

        var metricDataPoint: MetricDataPoint = {
            name: telemetry.name,
            value: telemetry.value,
            count: !isNaN(telemetry.count) ? telemetry.count : 1,
            dataPointType: "Aggregation" as DataPointType,
            max: !isNaN(telemetry.max) ? telemetry.max : telemetry.value,
            min: !isNaN(telemetry.min) ? telemetry.min : telemetry.value,
            stdDev: !isNaN(telemetry.stdDev) ? telemetry.stdDev : 0,
        };

        metricDataPoints.push(metricDataPoint);
        var metricsData: MetricsData = {
            version: 1,
            metrics: metricDataPoints,
            properties: telemetry.properties
        }; // todo: enable client-batching of these

        return metricsData;
    }

    private static createAvailabilityData(
        telemetry: Contracts.AvailabilityTelemetry & Contracts.Identified,
    ): AvailabilityData {
        let availabilityData: AvailabilityData = {
            version: 1,
            id: telemetry.id ? telemetry.id : Util.w3cTraceId(),
            name: telemetry.name,
            duration: Util.msToTimeSpan(telemetry.duration),
            success: telemetry.success,
            runLocation: telemetry.runLocation,
            message: telemetry.message,
            measurements: telemetry.measurements,
            properties: telemetry.properties
        };
        return availabilityData;
    }

    private static createPageViewData(
        telemetry: Contracts.PageViewTelemetry & Contracts.Identified,
    ): PageViewData {
        let pageViewData: PageViewData = {
            version: 1,
            id: telemetry.id ? telemetry.id : Util.w3cTraceId(),
            name: telemetry.name,
            duration: Util.msToTimeSpan(telemetry.duration),
            url: telemetry.url,
            measurements: telemetry.measurements,
            properties: telemetry.properties
        };
        return pageViewData;
    }

    private static getTags(context: Context, tagOverrides?: { [key: string]: string; }) {
        var correlationContext = CorrelationContextManager.getCurrentContext();

        // Make a copy of context tags so we don't alter the actual object
        // Also perform tag overriding
        var newTags = <{ [key: string]: string }>{};

        if (context && context.tags) {
            for (var key in context.tags) {
                newTags[key] = context.tags[key];
            }
        }
        if (tagOverrides) {
            for (var key in tagOverrides) {
                newTags[key] = tagOverrides[key];
            }
        }

        // Fill in internally-populated values if not already set
        if (correlationContext) {
            newTags[context.keys.operationId] = newTags[context.keys.operationId] || correlationContext.operation.id;
            newTags[context.keys.operationName] = newTags[context.keys.operationName] || correlationContext.operation.name;
            newTags[context.keys.operationParentId] = newTags[context.keys.operationParentId] || correlationContext.operation.parentId;
        }

        return newTags;
    }


    private static parseStack(stack: any): _StackFrame[] {
        var parsedStack: _StackFrame[] = undefined;
        if (typeof stack === "string") {
            var frames = stack.split("\n");
            parsedStack = [];
            var level = 0;

            var totalSizeInBytes = 0;
            for (var i = 0; i <= frames.length; i++) {
                var frame = frames[i];
                if (_StackFrame.regex.test(frame)) {
                    var parsedFrame = new _StackFrame(frames[i], level++);
                    totalSizeInBytes += parsedFrame.sizeInBytes;
                    parsedStack.push(parsedFrame);
                }
            }

            // DP Constraint - exception parsed stack must be < 32KB
            // remove frames from the middle to meet the threshold
            var exceptionParsedStackThreshold = 32 * 1024;
            if (totalSizeInBytes > exceptionParsedStackThreshold) {
                var left = 0;
                var right = parsedStack.length - 1;
                var size = 0;
                var acceptedLeft = left;
                var acceptedRight = right;

                while (left < right) {
                    // check size
                    var lSize = parsedStack[left].sizeInBytes;
                    var rSize = parsedStack[right].sizeInBytes;
                    size += lSize + rSize;

                    if (size > exceptionParsedStackThreshold) {

                        // remove extra frames from the middle
                        var howMany = acceptedRight - acceptedLeft + 1;
                        parsedStack.splice(acceptedLeft, howMany);
                        break;
                    }

                    // update pointers
                    acceptedLeft = left;
                    acceptedRight = right;

                    left++;
                    right--;
                }
            }
        }

        return parsedStack;
    }

}

class _StackFrame {

    // regex to match stack frames from ie/chrome/ff
    // methodName=$2, fileName=$4, lineNo=$5, column=$6
    public static regex = /^(\s+at)?(.*?)(\@|\s\(|\s)([^\(\n]+):(\d+):(\d+)(\)?)$/;
    public static baseSize = 58; //'{"method":"","level":,"assembly":"","fileName":"","line":}'.length
    public sizeInBytes = 0;
    public level: number;
    public method: string;
    public assembly: string;
    public fileName: string;
    public line: number;

    constructor(frame: string, level: number) {
        this.level = level;
        this.method = "<no_method>";
        this.assembly = Util.trim(frame);
        var matches = frame.match(_StackFrame.regex);
        if (matches && matches.length >= 5) {
            this.method = Util.trim(matches[2]) || this.method;
            this.fileName = Util.trim(matches[4]) || "<no_filename>";
            this.line = parseInt(matches[5]) || 0;
        }

        this.sizeInBytes += this.method.length;
        this.sizeInBytes += this.fileName.length;
        this.sizeInBytes += this.assembly.length;

        // todo: these might need to be removed depending on how the back-end settles on their size calculation
        this.sizeInBytes += _StackFrame.baseSize;
        this.sizeInBytes += this.level.toString().length;
        this.sizeInBytes += this.line.toString().length;
    }
}

export = EnvelopeFactory;
