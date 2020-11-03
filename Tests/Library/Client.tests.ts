import assert = require("assert");
import sinon = require("sinon");

import Client = require("../../Library/TelemetryClient");
import Contracts = require("../../Declarations/Contracts");
import EnvelopeFactory = require("../../Library/EnvelopeFactory");
import { SpanProcessor, ReadableSpan } from "@opentelemetry/tracing";
import Provider from "../../Library/Provider";
import { timeInputToHrTime, hrTimeToMilliseconds } from "@opentelemetry/core";
import type { HrTime } from "@opentelemetry/api";
import * as conventions from "@opentelemetry/semantic-conventions";

const NANOSECOND_DIGITS = 9;
const SECOND_TO_NANOSECONDS = Math.pow(10, NANOSECOND_DIGITS);

function numberToHrtime(epochMillis: number): HrTime {
    const epochSeconds = epochMillis / 1000;
    // Decimals only.
    const seconds = Math.trunc(epochSeconds);
    // Round sub-nanosecond accuracy to nanosecond.
    const nanos =
        Number((epochSeconds - seconds).toFixed(NANOSECOND_DIGITS)) * SECOND_TO_NANOSECONDS;
    return [seconds, nanos];
}

class TestSpanProcessor implements SpanProcessor {
    exportedSpans: ReadableSpan[] = [];

    forceFlush(): Promise<void> {
        return new Promise((resolve) => {
            resolve();
        });
    }
    onStart(span: ReadableSpan): void {
        // no op
    }
    onEnd(span: ReadableSpan): void {
        this.exportedSpans.push(span);
    }
    shutdown(): Promise<void> {
        this.exportedSpans = [];
        return new Promise((resolve) => {
            resolve();
        });
    }
}

describe("Library/TelemetryClient", () => {
    const iKey = "1aa11111-bbbb-1ccc-8ddd-eeeeffff3333";
    const appId = "Application-Key-12345-6789A";
    const name = "name";
    const value = 3;
    const startTime = new Date();
    const memoryExporter = new TestSpanProcessor();
    const testEventTelemetry = <Contracts.EventTelemetry>{ name: "testEvent" };
    const properties: { [key: string]: string } = { p1: "p1", p2: "p2", common: "commonArg" };
    const failedProperties: { [key: string]: string } = {
        p1: "p1",
        p2: "p2",
        common: "commonArg",
        errorProp: "errorVal",
    };
    const measurements: { [key: string]: number } = { m1: 1, m2: 2 };
    let client: Client;
    let trackStub: sinon.SinonStub;
    let triggerStub: sinon.SinonStub;
    let sendStub: sinon.SinonStub;
    let saveOnCrashStub: sinon.SinonStub;
    let getSpanProcessorStub: sinon.SinonStub;

    beforeEach(() => {
        client = new Client(iKey);
        client.config.correlationId = `cid-v1:${appId}`;
        getSpanProcessorStub = sinon
            .stub(Provider.tracer, "getActiveSpanProcessor")
            .returns(memoryExporter);
        trackStub = sinon.stub(client, "track");
        triggerStub = sinon.stub(client.channel, "triggerSend");
        sendStub = sinon.stub(client.channel, "send");
        saveOnCrashStub = sinon.stub(client.channel._sender, "saveOnCrash");
    });

    afterEach(() => {
        client.clearTelemetryProcessors();
        getSpanProcessorStub.restore();
        trackStub.restore();
        triggerStub.restore();
        sendStub.restore();
        saveOnCrashStub.restore();
        Provider.dispose();
        memoryExporter.shutdown(); // reset
    });

    const invalidInputHelper = (name: string) => {
        assert.doesNotThrow(() => (<any>client)[name](null, null), "#1");
        assert.doesNotThrow(() => (<any>client)[name](<any>undefined, <any>undefined), "#2");
        assert.doesNotThrow(() => (<any>client)[name](<any>{}, <any>{}), "#3");
        assert.doesNotThrow(() => (<any>client)[name](<any>[], <any>[]), "#4");
        assert.doesNotThrow(() => (<any>client)[name](<any>"", <any>""), "#5");
        assert.doesNotThrow(() => (<any>client)[name](<any>1, <any>1), "#6");
        assert.doesNotThrow(() => (<any>client)[name](<any>true, <any>true), "#7");
    };

    describe("#constructor()", () => {
        it("should initialize config", () => {
            const client = new Client("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333");
            assert.ok(client.config);
            assert.ok(client.config.instrumentationKey);
        });

        it("should initialize context", () => {
            const client = new Client("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333");
            assert.ok(client.context);
            assert.ok(client.context.tags);
        });

        it("should initialize common properties", () => {
            const client = new Client("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333");
            assert.ok(client.commonProperties);
        });

        it("should initialize channel", () => {
            const client = new Client("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333");
            assert.ok(client.channel);
        });
    });

    describe("#trackEvent()", () => {
        it("should track Event with correct data", () => {
            trackStub.reset();
            client.trackEvent({ name: name });
            client.trackEvent({ name: name, properties });
            client.trackEvent({ name: name, properties, measurements });

            assert.ok(trackStub.calledThrice);

            const eventTelemetry1 = <Contracts.EventTelemetry>trackStub.firstCall.args[0];
            const eventTelemetry2 = <Contracts.EventTelemetry>trackStub.secondCall.args[0];
            const eventTelemetry3 = <Contracts.EventTelemetry>trackStub.thirdCall.args[0];

            assert.equal(eventTelemetry1.name, name);
            assert.equal(eventTelemetry2.name, name);
            assert.deepEqual(eventTelemetry2.properties, properties);
            assert.equal(eventTelemetry3.name, name);
            assert.deepEqual(eventTelemetry3.properties, properties);
            assert.equal(eventTelemetry3.measurements, measurements);
        });

        it("should not crash with invalid input", () => {
            invalidInputHelper("trackEvent");
        });
    });

    describe("#trackPageView()", () => {
        it("should track Page View with correct data", () => {
            trackStub.reset();
            client.trackPageView({ name: name });
            client.trackPageView({ name: name, properties, measurements });
            client.trackPageView({ name: name, url: "https://www.test.com", duration: 100 });

            assert.ok(trackStub.calledThrice);

            const eventTelemetry1 = <Contracts.PageViewTelemetry>trackStub.firstCall.args[0];
            const eventTelemetry2 = <Contracts.PageViewTelemetry>trackStub.secondCall.args[0];
            const eventTelemetry3 = <Contracts.PageViewTelemetry>trackStub.thirdCall.args[0];

            assert.equal(eventTelemetry1.name, name);
            assert.equal(eventTelemetry2.name, name);
            assert.deepEqual(eventTelemetry2.properties, properties);
            assert.deepEqual(eventTelemetry2.measurements, measurements);
            assert.equal(eventTelemetry3.name, name);
            assert.equal(eventTelemetry3.url, "https://www.test.com");
            assert.equal(eventTelemetry3.duration, 100);
        });

        it("should not crash with invalid input", () => {
            invalidInputHelper("trackPageView");
        });
    });

    describe("#trackTrace()", () => {
        it("should track Trace with correct data", () => {
            trackStub.reset();
            client.trackTrace({ message: name });
            client.trackTrace({ message: name, severity: 0 });
            client.trackTrace({ message: name, severity: 0, properties: properties });

            assert.ok(trackStub.calledThrice);

            const traceTelemetry1 = <Contracts.TraceTelemetry>trackStub.firstCall.args[0];
            const traceTelemetry2 = <Contracts.TraceTelemetry>trackStub.secondCall.args[0];
            const traceTelemetry3 = <Contracts.TraceTelemetry>trackStub.thirdCall.args[0];

            assert.equal(traceTelemetry1.message, name);
            assert.equal(traceTelemetry2.message, name);
            assert.deepEqual(traceTelemetry2.severity, 0);
            assert.equal(traceTelemetry3.message, name);
            assert.deepEqual(traceTelemetry3.severity, 0);
            assert.equal(traceTelemetry3.properties, properties);
        });

        it("should not crash with invalid input", () => {
            invalidInputHelper("trackTrace");
        });
    });

    describe("#trackAvailability()", () => {
        it("should track availability with correct data", () => {
            trackStub.reset();
            const expectedTelemetryData: Contracts.AvailabilityTelemetry = {
                duration: 100,
                id: "id1",
                message: "message1",
                success: true,
                name: "name1",
                runLocation: "east us",
            };

            client.trackAvailability(expectedTelemetryData);

            assert.ok(trackStub.calledOnce);

            const availabilityTelemetry = <Contracts.AvailabilityTelemetry>(
                trackStub.firstCall.args[0]
            );

            assert.equal(availabilityTelemetry.message, expectedTelemetryData.message);
            assert.equal(availabilityTelemetry.name, expectedTelemetryData.name);
            assert.equal(availabilityTelemetry.runLocation, expectedTelemetryData.runLocation);
        });

        it("should not crash with invalid input", () => {
            invalidInputHelper("trackAvailability");
        });
    });

    describe("#trackException()", () => {
        it("should track Exception with correct data - Error only", () => {
            trackStub.reset();
            client.trackException({ exception: new Error(name) });

            assert.ok(trackStub.calledOnce);

            const exceptionTelemetry = <Contracts.ExceptionTelemetry>trackStub.firstCall.args[0];

            assert.equal(exceptionTelemetry.exception.message, name);
        });

        it("should track Exception with correct data - Error and properties", () => {
            trackStub.reset();
            client.trackException({ exception: new Error(name), properties: properties });

            assert.ok(trackStub.calledOnce);

            const exceptionTelemetry = <Contracts.ExceptionTelemetry>trackStub.firstCall.args[0];
            assert.equal(exceptionTelemetry.exception.message, name);
            assert.deepEqual(exceptionTelemetry.properties, properties);
        });

        it("should track Exception with correct data - Error, properties and measurements", () => {
            trackStub.reset();
            client.trackException({
                exception: new Error(name),
                properties: properties,
                measurements: measurements,
            });

            assert.ok(trackStub.calledOnce);

            const exceptionTelemetry = <Contracts.ExceptionTelemetry>trackStub.firstCall.args[0];

            assert.equal(exceptionTelemetry.exception.message, name);
            assert.deepEqual(exceptionTelemetry.properties, properties);
            assert.deepEqual(exceptionTelemetry.measurements, measurements);
        });

        it("should not crash with invalid input", () => {
            invalidInputHelper("trackException");
        });
    });

    describe("#trackMetric()", () => {
        it("should track Metric with correct data", () => {
            trackStub.reset();
            const count = 1;
            const min = 0;
            const max = 0;
            const stdev = 0;
            client.trackMetric({ name: name, value: value });
            client.trackMetric({
                name: name,
                value: value,
                count: count,
                min: min,
                max: max,
                stdDev: stdev,
                properties: properties,
            });

            assert.ok(trackStub.calledTwice);

            const metricTelemetry1 = <Contracts.MetricTelemetry>trackStub.firstCall.args[0];
            const metricTelemetry2 = <Contracts.MetricTelemetry>trackStub.secondCall.args[0];

            assert.equal(metricTelemetry1.name, name);
            assert.equal(metricTelemetry1.value, value);

            assert.equal(metricTelemetry2.name, name);
            assert.equal(metricTelemetry2.value, value);
            assert.equal(metricTelemetry2.count, count);
            assert.equal(metricTelemetry2.min, min);
            assert.equal(metricTelemetry2.max, max);
            assert.equal(metricTelemetry2.stdDev, stdev);
            assert.deepEqual(metricTelemetry2.properties, properties);
        });

        it("should not crash with invalid input", () => {
            invalidInputHelper("trackMetric");
        });
    });

    describe("#trackDependency()", () => {
        it("should create span with correct properties", () => {
            const data = "http://bing.com/search?q=test";
            const dependencyTypeName = "dependencyTypeName";
            client.trackDependency({
                name: name,
                data: data,
                duration: value,
                success: true,
                resultCode: 200,
                dependencyTypeName: dependencyTypeName,
                properties: properties,
                time: startTime,
            });
            assert.strictEqual(memoryExporter.exportedSpans.length, 1);

            const span = memoryExporter.exportedSpans[0];

            assert.strictEqual(span.name, name);
            assert.deepStrictEqual(hrTimeToMilliseconds(span.duration), value);
            assert.deepStrictEqual(span.startTime, timeInputToHrTime(startTime.getTime()));
            assert.deepStrictEqual(span.endTime, numberToHrtime(startTime.getTime() + value));
            assert.deepStrictEqual(span.ended, true);

            assert.deepStrictEqual(span.attributes, {
                ...properties,
                [conventions.GeneralAttribute.NET_PEER_ADDRESS]: data,
                [conventions.HttpAttribute.HTTP_STATUS_CODE]: 200,
            });
        });
    });

    describe("#trackRequest()", () => {
        it("should pass along client.commonProperties to the span", () => {
            const url = "http://bing.com/search?q=test";
            const commonProperties = { foo: "bar" };
            client.commonProperties = commonProperties;
            client.trackRequest({
                url: url,
                source: "source",
                name: name,
                duration: value,
                success: true,
                resultCode: 200,
                properties: properties,
                time: startTime,
            });

            assert.strictEqual(memoryExporter.exportedSpans.length, 1);

            const span = memoryExporter.exportedSpans[0];

            assert.strictEqual(span.name, name);
            assert.deepStrictEqual(hrTimeToMilliseconds(span.duration), value);
            assert.deepStrictEqual(span.startTime, timeInputToHrTime(startTime.getTime()));
            assert.deepStrictEqual(span.endTime, numberToHrtime(startTime.getTime() + value));
            assert.deepStrictEqual(span.ended, true);

            assert.deepStrictEqual(span.attributes, {
                ...properties,
                [conventions.GeneralAttribute.NET_PEER_ADDRESS]: url,
                [conventions.HttpAttribute.HTTP_STATUS_CODE]: 200,
                ...commonProperties,
            });
        });

        it("should pass along context.tags to the span", () => {
            const url = "http://bing.com/search?q=test";
            const sessionId = "abc";
            client.context.tags[client.context.keys.sessionId] = "abc";
            client.trackRequest({
                url: url,
                source: "source",
                name: name,
                duration: value,
                success: true,
                resultCode: 200,
                properties: properties,
                time: startTime,
            });

            assert.strictEqual(memoryExporter.exportedSpans.length, 1);

            const span = memoryExporter.exportedSpans[0];

            assert.strictEqual(span.name, name);
            assert.deepStrictEqual(hrTimeToMilliseconds(span.duration), value);
            assert.deepStrictEqual(span.startTime, timeInputToHrTime(startTime.getTime()));
            assert.deepStrictEqual(span.endTime, numberToHrtime(startTime.getTime() + value));
            assert.deepStrictEqual(span.ended, true);

            assert.deepStrictEqual(span.attributes, {
                ...properties,
                [conventions.GeneralAttribute.NET_PEER_ADDRESS]: url,
                [conventions.HttpAttribute.HTTP_STATUS_CODE]: 200,
            });
        });

        it("should create span with correct properties", () => {
            const url = "http://bing.com/search?q=test";
            client.trackRequest({
                url: url,
                source: "source",
                name: name,
                duration: value,
                success: true,
                resultCode: 200,
                properties: properties,
                time: startTime,
            });
            assert.strictEqual(memoryExporter.exportedSpans.length, 1);

            const span = memoryExporter.exportedSpans[0];

            assert.strictEqual(span.name, name);
            assert.deepStrictEqual(hrTimeToMilliseconds(span.duration), value);
            assert.deepStrictEqual(span.startTime, timeInputToHrTime(startTime.getTime()));
            assert.deepStrictEqual(span.endTime, numberToHrtime(startTime.getTime() + value));
            assert.deepStrictEqual(span.ended, true);

            assert.deepStrictEqual(span.attributes, {
                ...properties,
                [conventions.GeneralAttribute.NET_PEER_ADDRESS]: url,
                [conventions.HttpAttribute.HTTP_STATUS_CODE]: 200,
            });
        });
    });

    describe("#flush()", () => {
        afterEach(() => {
            client.clearTelemetryProcessors();
            saveOnCrashStub.reset();
            sendStub.restore();
            sendStub = sinon.stub(client.channel, "send");
            triggerStub.restore();
            triggerStub = sinon.stub(client.channel, "triggerSend");
            Provider.dispose();
        });

        it("(OpenTelemetry) should invoke forceFlush", () => {
            Provider.start();
            const flushStub = sinon
                .stub(Provider["_instance"]!.activeSpanProcessor, "forceFlush")
                .callsFake(() => new Promise((resolve) => resolve()));

            client.flush();
            assert.strictEqual(flushStub.callCount, 1);

            flushStub.restore();
        });

        it("should invoke the sender", () => {
            triggerStub.reset();
            client.flush();
            assert.ok(triggerStub.calledOnce);
        });

        it("should accept a callback", () => {
            triggerStub.reset();
            const callback = sinon.spy();
            client.flush({ callback: callback });
            assert.strictEqual(triggerStub.firstCall.args[0], false);
            assert.strictEqual(triggerStub.firstCall.args[1], callback);
        });

        it("should save on disk when isAppCrashing option is set to true", () => {
            sendStub.reset();
            client.flush({ isAppCrashing: true });
            assert.ok(sendStub.notCalled, "saveOnCrash should be called, not send");
            saveOnCrashStub.reset();

            // temporarily restore send and trigger stubs to allow saveOnCrash to be called
            sendStub.restore();
            triggerStub.restore();

            // fake something in the buffer
            client.channel._buffer.push("");
            client.flush({ isAppCrashing: true });

            assert.ok(saveOnCrashStub.calledOnce);
            saveOnCrashStub.restore();
        });
    });

    describe("#track()", () => {
        it("should pass data to the channel", () => {
            sendStub.reset();

            trackStub.restore();
            client.track(testEventTelemetry, Contracts.TelemetryType.Event);
            trackStub = sinon.stub(client, "track");

            assert.ok(sendStub.calledOnce);
        });

        it("should send the envelope that was created", () => {
            sendStub.reset();
            const createEnvelopeSpy = sinon.spy(EnvelopeFactory, "createEnvelope");
            trackStub.restore();
            client.track(testEventTelemetry, Contracts.TelemetryType.Event);
            trackStub = sinon.stub(client, "track");

            const expected = createEnvelopeSpy.firstCall.returnValue;
            const actual = sendStub.firstCall.args[0];
            createEnvelopeSpy.restore();

            assert.deepEqual(actual, expected);
        });

        it("should use timestamp if it was set", () => {
            const timestamp = new Date("Mon Aug 28 2017 11:44:17");
            const createEnvelopeSpy = sinon.spy(EnvelopeFactory, "createEnvelope");
            trackStub.restore();
            client.trackEvent({ name: "eventName", time: timestamp });
            trackStub = sinon.stub(client, "track");
            const envelope = createEnvelopeSpy.firstCall.returnValue;
            createEnvelopeSpy.restore();
            assert.equal(envelope.time, timestamp.toISOString());
        });

        it("telemetry processor can change the envelope", () => {
            trackStub.restore();
            const expectedName = "I was here";

            client.addTelemetryProcessor((env) => {
                env.name = expectedName;
                return true;
            });

            client.track(testEventTelemetry, Contracts.TelemetryType.Event);

            assert.equal(sendStub.callCount, 1, "send called once");

            const actualData = sendStub.firstCall.args[0] as Contracts.Envelope;
            assert.equal(
                actualData.name,
                expectedName,
                "envelope name should be changed by the processor"
            );
        });

        it("telemetry processor can access the context object", () => {
            trackStub.restore();
            const expectedName = "I was here";

            client.addTelemetryProcessor((env, contextObjects) => {
                assert.ok(contextObjects && contextObjects["name"]);
                env.name = contextObjects["name"];
                return true;
            });
            testEventTelemetry.contextObjects = { name: expectedName };

            client.track(testEventTelemetry, Contracts.TelemetryType.Event);
            testEventTelemetry.contextObjects = undefined;

            assert.equal(sendStub.callCount, 1, "send called once");

            const actualData = sendStub.firstCall.args[0] as Contracts.Envelope;
            assert.equal(
                actualData.name,
                expectedName,
                "envelope name should be changed by the processor"
            );
        });

        it("telemetry processors are executed in a right order", () => {
            trackStub.restore();

            client.addTelemetryProcessor((env) => {
                env.name = "First";
                return true;
            });

            client.addTelemetryProcessor((env) => {
                env.name += ", Second";
                return true;
            });

            client.addTelemetryProcessor((env) => {
                env.name += ", Third";
                return true;
            });
            client.track(testEventTelemetry, Contracts.TelemetryType.Event);
            assert.equal(sendStub.callCount, 1, "send called once");

            const actualData = sendStub.firstCall.args[0] as Contracts.Envelope;
            assert.equal(
                actualData.name,
                "First, Second, Third",
                "processors should executed in the right order"
            );
        });

        it("envelope rejected by the telemetry processor will not be sent", () => {
            trackStub.restore();

            client.addTelemetryProcessor((env) => {
                return false;
            });

            client.track(testEventTelemetry, Contracts.TelemetryType.Event);

            assert.ok(sendStub.notCalled, "send should not be called");
        });

        it("envelope is sent when processor throws exception", () => {
            trackStub.restore();

            client.addTelemetryProcessor((env): boolean => {
                throw "telemetry processor failed";
            });

            client.addTelemetryProcessor((env): boolean => {
                env.name = "more data";
                return true;
            });

            client.track(testEventTelemetry, Contracts.TelemetryType.Event);

            assert.ok(sendStub.called, "send should be called despite telemetry processor failure");
            const actualData = sendStub.firstCall.args[0] as Contracts.Envelope;
            assert.equal(
                actualData.name,
                "more data",
                "more data is added as part of telemetry processor"
            );
        });
    });

    describe("#addTelemetryProcessor()", () => {
        it("adds telemetry processor to the queue", () => {
            trackStub.restore();
            let processorExecuted = false;

            client.addTelemetryProcessor((env) => {
                processorExecuted = true;
                return true;
            });

            client.track(testEventTelemetry, Contracts.TelemetryType.Event);

            assert.ok(processorExecuted, "telemetry processor should be executed");
        });
    });

    describe("#clearTelemetryProcessors()", () => {
        it("removes all processors from the telemetry processors list", () => {
            trackStub.restore();
            let processorExecuted = false;

            client.addTelemetryProcessor((env) => {
                processorExecuted = true;
                return true;
            });

            client.clearTelemetryProcessors();
            client.track(testEventTelemetry, Contracts.TelemetryType.Event);

            assert.ok(!processorExecuted, "telemetry processor should NOT be executed");
        });
    });
});
