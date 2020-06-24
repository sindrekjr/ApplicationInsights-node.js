import assert = require("assert");
import sinon = require("sinon");
import { DistributedTracingModes } from "../applicationinsights";

describe("ApplicationInsights", () => {

    describe("#setup()", () => {
        var AppInsights = require("../applicationinsights");
        var Console = require("../AutoCollection/Console");
        var Exceptions = require("../AutoCollection/Exceptions");
        var Performance = require("../AutoCollection/Performance");
        beforeEach(() => {
            Console.INSTANCE = undefined;
            Exceptions.INSTANCE = undefined;
            Performance.INSTANCE = undefined;
            AppInsights.dispose();
        });

        it("should not warn if setup is called once", () => {
            var warnStub = sinon.spy(console, "warn");
            AppInsights.defaultClient = undefined;
            AppInsights.setup("key");
            assert.ok(warnStub.notCalled, "warning was not raised");
            warnStub.restore();
        });

        it("should warn if setup is called twice", () => {
            var warnStub = sinon.spy(console, "warn");
            AppInsights.defaultClient = undefined;
            AppInsights.setup("key");
            AppInsights.setup("key");
            assert.ok(warnStub.calledOn, "warning was raised");
            warnStub.restore();
        });

        it("should not overwrite default client if called more than once", () => {
            var warnStub = sinon.stub(console, "warn");
            AppInsights.defaultClient = undefined;
            AppInsights.setup("key");
            var client = AppInsights.defaultClient;
            AppInsights.setup("key");
            AppInsights.setup("key");
            AppInsights.setup("key");
            assert.ok(client === AppInsights.defaultClient, "client is not overwritten");
            warnStub.restore();
        });
    });

    describe("#start()", () => {
        var AppInsights = require("../applicationinsights");
        var Console = require("../AutoCollection/Console");
        var Exceptions = require("../AutoCollection/Exceptions");
        var Performance = require("../AutoCollection/Performance");

        beforeEach(() => {
            Console.INSTANCE = undefined;
            Exceptions.INSTANCE = undefined;
            Performance.INSTANCE = undefined;
        });

        afterEach(() => AppInsights.defaultClient = undefined);

        it("should warn if start is called before setup", () => {
            var warnStub = sinon.stub(console, "warn");
            AppInsights.start();
            assert.ok(warnStub.calledOn, "warning was raised");
            warnStub.restore();
        });

        it("should not warn if start is called after setup", () => {
            var warnStub = sinon.stub(console, "warn");
            AppInsights.setup("key").start();
            assert.ok(warnStub.notCalled, "warning was not raised");
            warnStub.restore();
        });

        it("should not start live metrics", () => {
            AppInsights.setup("key").start();
            assert.equal(AppInsights.liveMetricsClient, undefined, "live metrics client is not defined");
        });

        it("should not start live metrics", () => {
            AppInsights.setup("key").setSendLiveMetrics(false).start();
            assert.equal(AppInsights.liveMetricsClient, undefined, "live metrics client is not defined");
        });
    });

    describe("#setDistributedTracingMode", () => {
        var AppInsights = require("../applicationinsights");
        var CorrelationIdManager = require("../Library/CorrelationIdManager");

        beforeEach(() => {
            AppInsights.dispose();
        });
        afterEach(() => {
            AppInsights.dispose();
        })

        it("should enable W3C tracing mode by default", () => {
            AppInsights.setup("key").start();
            assert.equal(CorrelationIdManager.w3cEnabled, true);
        });

        it("(backcompat) (no-op) should be able to enable W3C tracing mode via enum", () => {
            assert.doesNotThrow(() => {
                AppInsights.setup("key").setDistributedTracingMode(DistributedTracingModes.AI_AND_W3C).start();
            });
        });
    });

    describe("#setAutoCollect", () => {
        var AppInsights = require("../applicationinsights");
        var Console = require("../AutoCollection/Console");
        var Exceptions = require("../AutoCollection/Exceptions");
        var Performance = require("../AutoCollection/Performance");

        beforeEach(() => {
            AppInsights.defaultClient = undefined;
            Console.INSTANCE = undefined;
            Exceptions.INSTANCE = undefined;
            Performance.INSTANCE = undefined;
        });

        it("auto-collection is initialized by default", () => {
            AppInsights.setup("key").start();

            //assert.ok(Console.INSTANCE.isInitialized());
            assert.ok(Exceptions.INSTANCE.isInitialized());
            assert.ok(Performance.INSTANCE.isInitialized());
        });

        it("auto-collection is not initialized if disabled before 'start'", () => {
            AppInsights.setup("key")
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
        var AppInsights = require("../applicationinsights");
        var Contracts = require("../Declarations/Contracts");

        it("should provide access to severity levels", () => {
            assert.equal(AppInsights.Contracts.SeverityLevel.Information, Contracts.SeverityLevel.Information);
        });
    });
});
