import assert = require("assert");
import sinon = require("sinon");
import Client = require("../../Library/TelemetryClient");
import TelemetryProcessor = require("../../TelemetryProcessors/PreAggregatedMetricsTelemetryProcessor");
import AutoCollectPreAggregatedMetrics = require("../../AutoCollection/PreAggregatedMetrics");
import { Contracts, Models } from "../../applicationinsights";

describe("TelemetryProcessors/PreAggregatedMetricsTelemetryProcessor", () => {

    var envelope: Models.TelemetryItem = {
        version: 2,
        name: "name",
        data: {
            baseType: "SomeData"
        },
        instrumentationKey: ikey,
        sampleRate: 100,
        sequence: "",
        time: new Date(),
        tags: {}
    };
    var ikey = "1aa11111-bbbb-1ccc-8ddd-eeeeffff3333";
    var client = new Client(ikey);
    var preAggregated: AutoCollectPreAggregatedMetrics = null;


    describe("#preAggregatedMetricsTelemetryProcessor()", () => {

        before(function () {
            preAggregated = new AutoCollectPreAggregatedMetrics(client);
            preAggregated.enable(true);
        });

        it("Exception telemetry", () => {
            var pgSpy = sinon.spy(AutoCollectPreAggregatedMetrics, "countException");
            var exception: Models.TelemetryExceptionData = {
                version: 1,
                exceptions: []
            };
            var data: Models.MonitorBase = {
                baseData: exception,
                baseType: "ExceptionData"
            };

            envelope.data = data;
            var res = TelemetryProcessor.preAggregatedMetricsTelemetryProcessor(envelope, client.context);
            var testEnv = <any>envelope;
            assert.equal(testEnv.data.baseData.properties["_MS.ProcessedByMetricExtractors"], "(Name:'Exceptions', Ver:'1.1')");
            assert.ok(pgSpy.calledOnce);
            pgSpy.restore();
        });

        it("Trace telemetry", () => {
            var pgSpy = sinon.spy(AutoCollectPreAggregatedMetrics, "countTrace");
            var trace: Models.MessageData = { version: 1, message: "" };
            var data: Models.MonitorBase = {
                baseData: trace,
                baseType: "MessageData"
            };
            envelope.data = data;
            var res = TelemetryProcessor.preAggregatedMetricsTelemetryProcessor(envelope, client.context);
            var testEnv = <any>envelope;
            assert.equal(testEnv.data.baseData.properties["_MS.ProcessedByMetricExtractors"], "(Name:'Traces', Ver:'1.1')");
            assert.ok(pgSpy.calledOnce);
            pgSpy.restore();
        });

        it("Dependency telemetry", () => {
            var pgSpy = sinon.spy(AutoCollectPreAggregatedMetrics, "countDependency");
            var dependency: Models.RemoteDependencyData = { version: 1, name: "", dependencyTypeName: "", data: "", duration: "", resultCode: "", success: false };
            var data: Models.MonitorBase = {
                baseData: dependency,
                baseType: "RemoteDependencyData"
            };
            envelope.data = data;
            var res = TelemetryProcessor.preAggregatedMetricsTelemetryProcessor(envelope, client.context);
            var testEnv = <any>envelope;
            assert.equal(testEnv.data.baseData.properties["_MS.ProcessedByMetricExtractors"], "(Name:'Dependencies', Ver:'1.1')");
            assert.ok(pgSpy.calledOnce);
            pgSpy.restore();
        });

        it("Request telemetry", () => {
            var pgSpy = sinon.spy(AutoCollectPreAggregatedMetrics, "countRequest");
            var request: Models.RequestData = { version: 1, name: "", url: "", duration: "1", resultCode: "", success: false, id: "", responseCode: "" };
            var data: Models.MonitorBase = {
                baseData: request,
                baseType: "RequestData"
            };
            envelope.data = data;
            var res = TelemetryProcessor.preAggregatedMetricsTelemetryProcessor(envelope, client.context);
            var testEnv = <any>envelope;
            assert.equal(testEnv.data.baseData.properties["_MS.ProcessedByMetricExtractors"], "(Name:'Requests', Ver:'1.1')");
            assert.ok(pgSpy.calledOnce);
            pgSpy.restore();
        });
    });
});
