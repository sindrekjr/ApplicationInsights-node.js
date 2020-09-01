import assert = require("assert");
import sinon = require("sinon");
import { DistributedTracingModes } from "../applicationinsights";
import appInsights = require("../Bootstrap/Oryx");
import TelemetryClient = require("../Library/TelemetryClient");

describe("ApplicationInsights", () => {
    let setupSpanExporterStub: sinon.SinonStub;

    before(() => {
        setupSpanExporterStub = sinon.stub(TelemetryClient.prototype, "setupSpanExporter");
    });

    after(() => {
        setupSpanExporterStub.restore();
    });

    describe("#setup()", () => {
        const AppInsights = require("../applicationinsights");
        const Console = require("../AutoCollection/Console");
        const Exceptions = require("../AutoCollection/Exceptions");
        const Performance = require("../AutoCollection/Performance");
        beforeEach(() => {
            Console.INSTANCE = undefined;
            Exceptions.INSTANCE = undefined;
            Performance.INSTANCE = undefined;
            AppInsights.dispose();
        });

        it("should not warn if setup is called once", () => {
            const warnStub = sinon.spy(console, "warn");
            AppInsights.defaultClient = undefined;
            AppInsights.setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333");
            assert.ok(warnStub.notCalled, "warning was not raised");
            warnStub.restore();
        });

        it("should warn if setup is called twice", () => {
            const warnStub = sinon.spy(console, "warn");
            AppInsights.defaultClient = undefined;
            AppInsights.setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333");
            AppInsights.setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333");
            assert.ok(warnStub.calledOn, "warning was raised");
            warnStub.restore();
        });

        it("should not overwrite default client if called more than once", () => {
            const warnStub = sinon.stub(console, "warn");
            AppInsights.defaultClient = undefined;
            AppInsights.setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333");
            const client = AppInsights.defaultClient;
            AppInsights.setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333");
            AppInsights.setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333");
            AppInsights.setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333");
            assert.ok(client === AppInsights.defaultClient, "client is not overwritten");
            warnStub.restore();
        });
    });

    describe("#start()", () => {
        const AppInsights = require("../applicationinsights");
        const Console = require("../AutoCollection/Console");
        const Exceptions = require("../AutoCollection/Exceptions");
        const Performance = require("../AutoCollection/Performance");

        beforeEach(() => {
            Console.INSTANCE = undefined;
            Exceptions.INSTANCE = undefined;
            Performance.INSTANCE = undefined;
        });

        afterEach(() => (AppInsights.defaultClient = undefined));

        it("should warn if start is called before setup", () => {
            const warnStub = sinon.stub(console, "warn");
            AppInsights.start();
            assert.ok(warnStub.calledOn, "warning was raised");
            warnStub.restore();
        });

        it("should not warn if start is called after setup", () => {
            const warnStub = sinon.stub(console, "warn");
            AppInsights.setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333").start();
            assert.ok(warnStub.notCalled, "warning was not raised");
            warnStub.restore();
        });

        it("should not start live metrics", () => {
            AppInsights.setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333").start();
            assert.equal(
                AppInsights.liveMetricsClient,
                undefined,
                "live metrics client is not defined"
            );
        });

        it("should not start live metrics", () => {
            AppInsights.setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333")
                .setSendLiveMetrics(false)
                .start();
            assert.equal(
                AppInsights.liveMetricsClient,
                undefined,
                "live metrics client is not defined"
            );
        });
    });

    describe("#setDistributedTracingMode", () => {
        const AppInsights = require("../applicationinsights");
        const CorrelationIdManager = require("../Library/CorrelationIdManager");

        beforeEach(() => {
            AppInsights.dispose();
        });
        afterEach(() => {
            AppInsights.dispose();
        });

        it("should enable W3C tracing mode by default", () => {
            AppInsights.setup("aa11111-bbbb-1ccc-8ddd-eeeeffff3333").start();
            assert.equal(CorrelationIdManager.w3cEnabled, true);
        });

        it("(backcompat) (no-op) should be able to enable W3C tracing mode via enum", () => {
            assert.doesNotThrow(() => {
                AppInsights.setup("aa11111-bbbb-1ccc-8ddd-eeeeffff3333")
                    .setDistributedTracingMode(DistributedTracingModes.AI_AND_W3C)
                    .start();
            });
        });
    });

    describe("#setAutoCollect", () => {
        const AppInsights = require("../applicationinsights");
        const Console = require("../AutoCollection/Console");
        const Exceptions = require("../AutoCollection/Exceptions");
        const Performance = require("../AutoCollection/Performance");

        beforeEach(() => {
            AppInsights.defaultClient = undefined;
            Console.INSTANCE = undefined;
            Exceptions.INSTANCE = undefined;
            Performance.INSTANCE = undefined;
        });

        it("auto-collection is initialized by default", () => {
            AppInsights.setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333").start();

            //assert.ok(Console.INSTANCE.isInitialized());
            assert.ok(Exceptions.INSTANCE.isInitialized());
            assert.ok(Performance.INSTANCE.isInitialized());
        });

        it("auto-collection is not initialized if disabled before 'start'", () => {
            AppInsights.setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333")
                .setAutoCollectConsole(false)
                .setAutoCollectExceptions(false)
                .setAutoCollectPerformance(false)
                .setAutoCollectRequests(false)
                .setAutoCollectDependencies(false)
                .setAutoDependencyCorrelation(false)
                .start();

            assert.ok(!Console.INSTANCE.isInitialized());
            assert.ok(!Exceptions.INSTANCE.isInitialized());
            assert.ok(!Performance.INSTANCE.isInitialized());
        });
    });

    describe("#Provide access to contracts", () => {
        const AppInsights = require("../applicationinsights");
        const Contracts = require("../Declarations/Contracts");

        it("should provide access to severity levels", () => {
            assert.equal(
                AppInsights.Contracts.SeverityLevel.Information,
                Contracts.SeverityLevel.Information
            );
        });
    });
});
