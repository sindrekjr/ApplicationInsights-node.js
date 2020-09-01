import assert = require("assert");
import sinon = require("sinon");

import Channel = require("../../Library/Channel");
import Contracts = require("../../Declarations/Contracts");

class ChannelMock extends Channel {
    public getBuffer() {
        return this._buffer;
    }

    public getTimeoutHandle() {
        return this._timeoutHandle;
    }
}

describe("Library/Channel", () => {
    const testEnvelope = new Contracts.Envelope();
    const sender = {
        saveOnCrash: <(s: string) => void>((str) => null),
        send: <(b: Buffer) => void>((buffer) => null),
    };

    const sendSpy = sinon.spy(sender, "send");
    const saveSpy = sinon.spy(sender, "saveOnCrash");

    let channel: ChannelMock;
    let config: any;
    let clock: any;
    before(() => (clock = sinon.useFakeTimers()));
    after(() => clock.restore());

    beforeEach(() => {
        config = {
            isDisabled: false,
            batchSize: 3,
            batchInterval: 10,
        };

        channel = new ChannelMock(
            () => config.isDisabled,
            () => config.batchSize,
            () => config.batchInterval,
            <any>sender
        );
    });

    afterEach(() => {
        sendSpy.resetHistory();
        saveSpy.resetHistory();
    });

    describe("#send(envelope)", () => {
        it("should enqueue telemetry", () => {
            channel.send(testEnvelope);
            clock.tick(config.batchInterval);
            assert.ok(sendSpy.calledOnce);
            assert.equal(sendSpy.firstCall.args[0].toString(), JSON.stringify(testEnvelope));
        });

        it("should do nothing if disabled", () => {
            config.isDisabled = true;
            channel.send(testEnvelope);
            clock.tick(config.batchInterval);
            assert.ok(sendSpy.notCalled);
        });

        it("should log warning if invalid input is passed", () => {
            const warnStub = sinon.stub(console, "warn");
            channel.send(undefined);
            channel.send(null);
            channel.send(<any>"");
            assert.ok(warnStub.calledThrice);
            warnStub.restore();
        });

        it("should not crash JSON.stringify", () => {
            const a = <any>{ b: null };
            a.b = a;

            const warnStub = sinon.stub(console, "warn");
            assert.doesNotThrow(() => channel.send(a));
            assert.ok(warnStub.calledOnce);
            warnStub.restore();
        });

        it("should flush the buffer when full", () => {
            for (let i = 0; i < config.batchSize; i++) {
                channel.send(testEnvelope);
            }

            assert.ok(sendSpy.calledOnce);
            assert.ok(channel.getBuffer().length === 0);
        });

        it("should add the payload to the buffer", () => {
            channel.send(testEnvelope);
            assert.ok(channel.getBuffer().length === 1);
            assert.ok(channel.getBuffer()[0] === JSON.stringify(testEnvelope));
        });

        it("should start the timer if not started", () => {
            assert.ok(!channel.getTimeoutHandle());
            channel.send(testEnvelope);
            assert.ok(channel.getTimeoutHandle());
        });

        it("should clear timeout handle after flushing", () => {
            for (let i = 0; i < config.batchSize; i++) {
                channel.send(testEnvelope);
            }

            assert.ok(!channel.getTimeoutHandle(), "cleared after buffer full");

            channel.send(testEnvelope);
            clock.tick(config.batchInterval);
            assert.ok(!channel.getTimeoutHandle(), "cleared after batch interval");
        });
    });

    describe("#triggerSend(isCrash)", () => {
        it("should clear timeout handle", () => {
            channel.send(testEnvelope);
            channel.triggerSend(false);
            assert.ok(sendSpy.calledOnce);
            assert.ok(saveSpy.notCalled);
            assert.ok(channel.getBuffer().length === 0);
            assert.ok(!channel.getTimeoutHandle());
        });

        it("should save to disk if crashing", () => {
            channel.send(testEnvelope);
            channel.triggerSend(true);
            assert.ok(sendSpy.notCalled);
            assert.ok(saveSpy.calledOnce);
            assert.ok(channel.getBuffer().length === 0);
            assert.ok(!channel.getTimeoutHandle());
        });

        it("should format X-JSON by default", () => {
            const first: any = { first: true };
            const second: any = { second: true };
            channel.send(first);
            channel.send(second);
            channel.triggerSend(true);
            assert.ok(sendSpy.notCalled);
            assert.ok(saveSpy.calledOnce);
            assert.ok(saveSpy.calledWith(JSON.stringify(first) + "\n" + JSON.stringify(second)));
        });

        it("should not send if empty", () => {
            channel.triggerSend(false);
            assert.ok(sendSpy.notCalled);
            assert.ok(saveSpy.notCalled);
        });

        it("should call callback when empty", () => {
            const callback = sinon.spy();
            channel.triggerSend(false, callback);
            assert.ok(callback.calledOnce);
        });

        it("should call callback when crashing", () => {
            channel.send(testEnvelope);
            const callback = sinon.spy();
            channel.triggerSend(true, callback);
            assert.ok(callback.calledOnce);
        });
    });
});
