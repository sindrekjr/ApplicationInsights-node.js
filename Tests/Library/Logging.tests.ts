import assert = require("assert");
import sinon = require("sinon");

import Logging = require("../../Library/Logging");

describe("Library/Logging", () => {

    describe("#info(message, ...optionalParams: any)", () => {
        var infoStub: sinon.SinonStub;

        afterEach(() => {
            infoStub.restore();
        });

        it("should do nothing if disabled", () => {
            var originalSetting = Logging.enableDebug;
            Logging.enableDebug = false;
            infoStub = sinon.stub(console, "info");
            Logging.info("test");
            assert.ok(infoStub.notCalled);
            Logging.enableDebug = originalSetting;
        });

        it("should log 'info' if enabled", () => {
            var originalSetting = Logging.enableDebug;
            Logging.enableDebug = true;
            infoStub = sinon.stub(console, "info");
            Logging.info("test");
            assert.ok(infoStub.calledOnce);
            Logging.enableDebug = originalSetting;
        });
    });

    describe("#warn(message, ...optionalParams: any)", () => {
        var warnStub: sinon.SinonStub;
        afterEach(() => {
            warnStub.restore();
        });

        it("should do nothing if disabled", () => {
            var originalSetting = Logging.enableDebug;
            Logging.enableDebug = false;
            warnStub = sinon.stub(console, "warn");
            Logging.info("test");
            assert.ok(warnStub.notCalled);
            Logging.enableDebug = originalSetting;
        });

        it("should log 'warn' if enabled", () => {
            var originalSetting = Logging.enableDebug;
            Logging.enableDebug = true;
            warnStub = sinon.stub(console, "warn");
            Logging.warn("test");
            assert.ok(warnStub.calledOnce);
            Logging.enableDebug = originalSetting;
        });
    });
});
