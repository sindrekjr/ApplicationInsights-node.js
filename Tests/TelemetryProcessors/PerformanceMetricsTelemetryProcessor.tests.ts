import assert = require("assert");
import sinon = require("sinon");

import QuickPulse = require("../../TelemetryProcessors/PerformanceMetricsTelemetryProcessor");
import QuickPulseStateManager = require("../../Library/QuickPulseStateManager");
import { Contracts } from "../../applicationinsights";

describe("TelemetryProcessors/PerformanceMetricsTelemetryProcessor", () => {
    describe("#PerformanceMetricsTelemetryProcessor()", () => {
        const ikey = "1aa11111-bbbb-1ccc-8ddd-eeeeffff3333";
        const envelope: Contracts.Envelope = {
            ver: 2,
            name: "name",
            data: {
                baseType: "SomeData",
            },
            iKey: ikey,
            sampleRate: 100,
            seq: "",
            time: "",
            tags: [],
        };

        it("should return true if no client provided", () => {
            const qpSpy = sinon.spy(QuickPulse, "performanceMetricsTelemetryProcessor");

            const res = QuickPulse.performanceMetricsTelemetryProcessor(envelope);
            assert.ok(qpSpy.calledOnce);
            assert.equal(res, true, "returns true");

            qpSpy.restore();
        });

        it("should add document to the provided client", () => {
            const qpSpy = sinon.spy(QuickPulse, "performanceMetricsTelemetryProcessor");
            const client: QuickPulseStateManager = new QuickPulseStateManager(ikey);
            const addDocumentStub = sinon.stub(client, "addDocument");

            // Act
            const res = QuickPulse.performanceMetricsTelemetryProcessor(envelope, client);

            // Test
            assert.ok(qpSpy.calledOnce);
            assert.equal(res, true);
            assert.ok(addDocumentStub.calledOnce);

            qpSpy.restore();
            addDocumentStub.restore();
        });
    });
});
