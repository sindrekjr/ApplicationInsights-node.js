import Contracts = require("../Declarations/Contracts");
import Util = require("./Util");
import Config = require("./Config");
import Context = require("./SdkContext");
import * as opentelemetry from "@opentelemetry/api";

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
        commonProperties?: { [key: string]: string },
        context?: Context,
        config?: Config
    ): Contracts.Envelope {
        let data = null;

        switch (telemetryType) {
            case Contracts.TelemetryType.Trace:
                data = EnvelopeFactory.createTraceData(<Contracts.TraceTelemetry>telemetry);
                break;
            case Contracts.TelemetryType.Dependency:
                data = EnvelopeFactory.createDependencyData(
                    <Contracts.DependencyTelemetry>telemetry
                );
                break;
            case Contracts.TelemetryType.Event:
                data = EnvelopeFactory.createEventData(<Contracts.EventTelemetry>telemetry);
                break;
            case Contracts.TelemetryType.Exception:
                data = EnvelopeFactory.createExceptionData(<Contracts.ExceptionTelemetry>telemetry);
                break;
            case Contracts.TelemetryType.Request:
                data = EnvelopeFactory.createRequestData(<Contracts.RequestTelemetry>telemetry);
                break;
            case Contracts.TelemetryType.Metric:
                data = EnvelopeFactory.createMetricData(<Contracts.MetricTelemetry>telemetry);
                break;
            case Contracts.TelemetryType.Availability:
                data = EnvelopeFactory.createAvailabilityData(
                    <Contracts.AvailabilityTelemetry>telemetry
                );
                break;
            case Contracts.TelemetryType.PageView:
                data = EnvelopeFactory.createPageViewData(<Contracts.PageViewTelemetry>telemetry);
                break;
        }

        if (commonProperties && Contracts.domainSupportsProperties(data.baseData)) {
            // Do instanceof check. TS will automatically cast and allow the properties property
            if (data && data.baseData) {
                // if no properties are specified just add the common ones
                if (!data.baseData.properties) {
                    data.baseData.properties = commonProperties;
                } else {
                    // otherwise, check each of the common ones
                    for (const name in commonProperties) {
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

        const iKey = config ? config.instrumentationKey || "" : "";
        const envelope = new Contracts.Envelope();
        envelope.data = data;
        envelope.iKey = iKey;

        // this is kind of a hack, but the envelope name is always the same as the data name sans the chars "data"
        envelope.name =
            "Microsoft.ApplicationInsights." +
            iKey.replace(/-/g, "") +
            "." +
            data.baseType.substr(0, data.baseType.length - 4);
        envelope.tags = this.getTags(context, telemetry.tagOverrides);
        envelope.time = new Date().toISOString();
        envelope.ver = 1;
        envelope.sampleRate = config ? config.samplingPercentage : 100;

        // Exclude metrics from sampling by default
        if (telemetryType === Contracts.TelemetryType.Metric) {
            envelope.sampleRate = 100;
        }

        return envelope;
    }

    private static createTraceData(
        telemetry: Contracts.TraceTelemetry
    ): Contracts.Data<Contracts.MessageData> {
        const trace = new Contracts.MessageData();
        trace.message = telemetry.message;
        trace.properties = telemetry.properties;
        if (typeof telemetry.severity !== "undefined" && !isNaN(telemetry.severity)) {
            trace.severityLevel = telemetry.severity;
        } else {
            trace.severityLevel = Contracts.SeverityLevel.Information;
        }

        const data = new Contracts.Data<Contracts.MessageData>();
        data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Trace);
        data.baseData = trace;
        return data;
    }

    private static createDependencyData(
        telemetry: Contracts.DependencyTelemetry & Contracts.Identified
    ): Contracts.Data<Contracts.RemoteDependencyData> {
        const remoteDependency = new Contracts.RemoteDependencyData();
        if (typeof telemetry.name === "string") {
            remoteDependency.name =
                telemetry.name.length > 1024
                    ? telemetry.name.slice(0, 1021) + "..."
                    : telemetry.name;
        }
        remoteDependency.data = telemetry.data;
        remoteDependency.target = telemetry.target ?? "";
        remoteDependency.duration = Util.msToTimeSpan(telemetry.duration);
        remoteDependency.success = telemetry.success;
        remoteDependency.type = telemetry.dependencyTypeName;
        remoteDependency.properties = telemetry.properties;
        remoteDependency.resultCode = telemetry.resultCode ? telemetry.resultCode + "" : "";

        if (telemetry.id) {
            remoteDependency.id = telemetry.id;
        } else {
            remoteDependency.id = Util.w3cTraceId();
        }

        const data = new Contracts.Data<Contracts.RemoteDependencyData>();
        data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Dependency);
        data.baseData = remoteDependency;
        return data;
    }

    private static createEventData(
        telemetry: Contracts.EventTelemetry
    ): Contracts.Data<Contracts.EventData> {
        const event = new Contracts.EventData();
        event.name = telemetry.name;
        event.properties = telemetry.properties;
        event.measurements = telemetry.measurements;

        const data = new Contracts.Data<Contracts.EventData>();
        data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Event);
        data.baseData = event;
        return data;
    }

    private static createExceptionData(
        telemetry: Contracts.ExceptionTelemetry
    ): Contracts.Data<Contracts.ExceptionData> {
        const exception = new Contracts.ExceptionData();
        exception.properties = telemetry.properties;
        if (typeof telemetry.severity !== "undefined" && !isNaN(telemetry.severity)) {
            exception.severityLevel = telemetry.severity;
        } else {
            exception.severityLevel = Contracts.SeverityLevel.Error;
        }
        exception.measurements = telemetry.measurements;
        exception.exceptions = [];

        const stack = telemetry.exception["stack"];
        const exceptionDetails = new Contracts.ExceptionDetails();
        exceptionDetails.message = telemetry.exception.message;
        exceptionDetails.typeName = telemetry.exception.name;
        exceptionDetails.parsedStack = this.parseStack(stack);
        exceptionDetails.hasFullStack =
            Util.isArray(exceptionDetails.parsedStack) && exceptionDetails.parsedStack.length > 0;
        exception.exceptions.push(exceptionDetails);

        const data = new Contracts.Data<Contracts.ExceptionData>();
        data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Exception);
        data.baseData = exception;
        return data;
    }

    private static createRequestData(
        telemetry: Contracts.RequestTelemetry & Contracts.Identified
    ): Contracts.Data<Contracts.RequestData> {
        const requestData = new Contracts.RequestData();
        if (telemetry.id) {
            requestData.id = telemetry.id;
        } else {
            requestData.id = Util.w3cTraceId();
        }
        requestData.name = telemetry.name;
        requestData.url = telemetry.url;
        requestData.source = telemetry.source ?? "";
        requestData.duration = Util.msToTimeSpan(telemetry.duration);
        requestData.responseCode = telemetry.resultCode ? telemetry.resultCode + "" : "";
        requestData.success = telemetry.success;
        requestData.properties = telemetry.properties;

        const data = new Contracts.Data<Contracts.RequestData>();
        data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Request);
        data.baseData = requestData;
        return data;
    }

    private static createMetricData(
        telemetry: Contracts.MetricTelemetry
    ): Contracts.Data<Contracts.MetricData> {
        const metrics = new Contracts.MetricData(); // todo: enable client-batching of these
        metrics.metrics = [];

        const metric = new Contracts.DataPoint();
        metric.count =
            typeof telemetry.count !== "undefined" && !isNaN(telemetry.count) ? telemetry.count : 1;
        metric.kind = Contracts.DataPointType.Aggregation;
        metric.max =
            typeof telemetry.max !== "undefined" && !isNaN(telemetry.max)
                ? telemetry.max
                : telemetry.value;
        metric.min =
            typeof telemetry.min !== "undefined" && !isNaN(telemetry.min)
                ? telemetry.min
                : telemetry.value;
        metric.name = telemetry.name;
        metric.stdDev =
            typeof telemetry.stdDev !== "undefined" && !isNaN(telemetry.stdDev)
                ? telemetry.stdDev
                : 0;
        metric.value = telemetry.value;

        metrics.metrics.push(metric);

        metrics.properties = telemetry.properties;

        const data = new Contracts.Data<Contracts.MetricData>();
        data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Metric);
        data.baseData = metrics;
        return data;
    }

    private static createAvailabilityData(
        telemetry: Contracts.AvailabilityTelemetry & Contracts.Identified
    ): Contracts.Data<Contracts.AvailabilityData> {
        const availabilityData = new Contracts.AvailabilityData();

        if (telemetry.id) {
            availabilityData.id = telemetry.id;
        } else {
            availabilityData.id = Util.w3cTraceId();
        }
        availabilityData.name = telemetry.name;
        availabilityData.duration = Util.msToTimeSpan(telemetry.duration);
        availabilityData.success = telemetry.success;
        availabilityData.runLocation = telemetry.runLocation;
        availabilityData.message = telemetry.message;
        availabilityData.measurements = telemetry.measurements;
        availabilityData.properties = telemetry.properties;

        const data = new Contracts.Data<Contracts.AvailabilityData>();
        data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.Availability);
        data.baseData = availabilityData;

        return data;
    }

    private static createPageViewData(
        telemetry: Contracts.PageViewTelemetry & Contracts.Identified
    ): Contracts.Data<Contracts.PageViewData> {
        const pageViewData = new Contracts.PageViewData();

        pageViewData.name = telemetry.name ?? "";
        pageViewData.duration = Util.msToTimeSpan(telemetry.duration ?? 0);
        pageViewData.url = telemetry.url ?? "";
        pageViewData.measurements = telemetry.measurements;
        pageViewData.properties = telemetry.properties;

        const data = new Contracts.Data<Contracts.PageViewData>();
        data.baseType = Contracts.telemetryTypeToBaseType(Contracts.TelemetryType.PageView);
        data.baseData = pageViewData;

        return data;
    }

    private static getTags(context?: Context, tagOverrides?: { [key: string]: string }) {
        const correlationContext = opentelemetry.trace
            .getTracer("applicationinsights")
            .getCurrentSpan()
            ?.context();

        // Make a copy of context tags so we don't alter the actual object
        // Also perform tag overriding
        const newTags = <{ [key: string]: string }>{};

        if (context && context.tags) {
            for (const key in context.tags) {
                newTags[key] = context.tags[key];
            }
        }
        if (tagOverrides) {
            for (const key in tagOverrides) {
                newTags[key] = tagOverrides[key];
            }
        }

        // Fill in internally-populated values if not already set
        if (correlationContext && context) {
            newTags[context.keys.operationId] =
                newTags[context.keys.operationId] || correlationContext.traceId;

            newTags[context.keys.operationName] =
                newTags[context.keys.operationName] || correlationContext.traceId;

            newTags[context.keys.operationParentId] =
                newTags[context.keys.operationParentId] || correlationContext.spanId;
        }

        return newTags;
    }

    private static parseStack(stack: any): _StackFrame[] {
        const parsedStack: _StackFrame[] = [];
        if (typeof stack === "string") {
            const frames = stack.split("\n");
            let level = 0;

            let totalSizeInBytes = 0;
            for (let i = 0; i <= frames.length; i++) {
                const frame = frames[i];
                if (_StackFrame.regex.test(frame)) {
                    const parsedFrame = new _StackFrame(frames[i], level++);
                    totalSizeInBytes += parsedFrame.sizeInBytes;
                    parsedStack.push(parsedFrame);
                }
            }

            // DP Constraint - exception parsed stack must be < 32KB
            // remove frames from the middle to meet the threshold
            const exceptionParsedStackThreshold = 32 * 1024;
            if (totalSizeInBytes > exceptionParsedStackThreshold) {
                let left = 0;
                let right = parsedStack.length - 1;
                let size = 0;
                let acceptedLeft = left;
                let acceptedRight = right;

                while (left < right) {
                    // check size
                    const lSize = parsedStack[left].sizeInBytes;
                    const rSize = parsedStack[right].sizeInBytes;
                    size += lSize + rSize;

                    if (size > exceptionParsedStackThreshold) {
                        // remove extra frames from the middle
                        const howMany = acceptedRight - acceptedLeft + 1;
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
    public static regex = /^([\s]+at)?(.*?)(\@|\s\(|\s)([^\(\@\n]+):([0-9]+):([0-9]+)(\)?)$/;
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
        const matches = new RegExp(_StackFrame.regex).exec(frame);
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
