import Models = require("../generated");
import AutoCollectPreAggregatedMetrics = require("../AutoCollection/PreAggregatedMetrics");
import * as TelemetryType from "../Declarations/Contracts";
import {
    MetricDependencyDimensions,
    MetricExceptionDimensions,
    MetricRequestDimensions,
    MetricTraceDimensions
} from "../Declarations/Metrics/AggregatedMetricDimensions";
import Context = require("../Library/Context");

export function preAggregatedMetricsTelemetryProcessor(envelope: Models.TelemetryItem, context: Context): boolean {
    if (AutoCollectPreAggregatedMetrics.isEnabled()) {
        // Increment rate counters
        switch (envelope.data.baseType) {
            case TelemetryType.TelemetryTypeString.Exception:
                const exceptionData: Models.TelemetryExceptionData = (envelope.data as any).baseData;
                exceptionData.properties = {
                    ...exceptionData.properties,
                    "_MS.ProcessedByMetricExtractors": "(Name:'Exceptions', Ver:'1.1')"
                }
                let exceptionDimensions: MetricExceptionDimensions = {
                    cloudRoleInstance: envelope.tags[context.keys.cloudRoleInstance],
                    cloudRoleName: envelope.tags[context.keys.cloudRole],
                };
                AutoCollectPreAggregatedMetrics.countException(exceptionDimensions);
                break;
            case TelemetryType.TelemetryTypeString.Trace:
                const traceData: Models.MessageData = (envelope.data as any).baseData;
                traceData.properties = {
                    ...traceData.properties,
                    "_MS.ProcessedByMetricExtractors": "(Name:'Traces', Ver:'1.1')"
                }
                let traceDimensions: MetricTraceDimensions = {
                    cloudRoleInstance: envelope.tags[context.keys.cloudRoleInstance],
                    cloudRoleName: envelope.tags[context.keys.cloudRole],
                    traceSeverityLevel: traceData.severity,
                };
                AutoCollectPreAggregatedMetrics.countTrace(traceDimensions);
                break;
            case TelemetryType.TelemetryTypeString.Request:
                const requestData: Models.RequestData = (envelope.data as any).baseData;
                requestData.properties = {
                    ...requestData.properties,
                    "_MS.ProcessedByMetricExtractors": "(Name:'Requests', Ver:'1.1')"
                }
                let requestDimensions: MetricRequestDimensions = {
                    cloudRoleInstance: envelope.tags[context.keys.cloudRoleInstance],
                    cloudRoleName: envelope.tags[context.keys.cloudRole],
                    operationSynthetic: envelope.tags[context.keys.operationSyntheticSource],
                    requestSuccess: requestData.success,
                    requestResultCode: requestData.responseCode,
                };
                AutoCollectPreAggregatedMetrics.countRequest(requestData.duration, requestDimensions);
                break;
            case TelemetryType.TelemetryTypeString.Dependency:
                const remoteDependencyData: Models.RemoteDependencyData = (envelope.data as any).baseData;
                remoteDependencyData.properties = {
                    ...remoteDependencyData.properties,
                    "_MS.ProcessedByMetricExtractors": "(Name:'Dependencies', Ver:'1.1')"
                }
                let dependencyDimensions: MetricDependencyDimensions = {
                    cloudRoleInstance: envelope.tags[context.keys.cloudRoleInstance],
                    cloudRoleName: envelope.tags[context.keys.cloudRole],
                    operationSynthetic: envelope.tags[context.keys.operationSyntheticSource],
                    dependencySuccess: remoteDependencyData.success,
                    dependencyType: remoteDependencyData.type,
                    dependencyTarget: remoteDependencyData.target,
                    dependencyResultCode: remoteDependencyData.resultCode,
                };
                AutoCollectPreAggregatedMetrics.countDependency(remoteDependencyData.duration, dependencyDimensions);
                break;
        }
    }
    return true;
}
