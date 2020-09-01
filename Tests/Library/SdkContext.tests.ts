import assert = require("assert");
import sinon = require("sinon");
import os = require("os");

import Context = require("../../Library/SdkContext");

describe("Library/SdkContext", () => {
    describe("#constructor()", () => {
        let stubs: Array<any> = [];
        beforeEach(() => {
            stubs = [
                sinon.stub(os, "hostname").callsFake(() => "host"),
                sinon.stub(os, "type").callsFake(() => "type"),
                sinon.stub(os, "arch").callsFake(() => "arch"),
                sinon.stub(os, "release").callsFake(() => "release"),
                sinon.stub(os, "platform").callsFake(() => "platform" as any),
            ];
        });

        afterEach(() => {
            stubs.forEach((s) => s.restore());
        });

        it("should initialize default context", () => {
            const context = new Context();
            const defaultkeys = [
                context.keys.cloudRoleInstance,
                context.keys.deviceOSVersion,
                context.keys.internalSdkVersion,
                context.keys.cloudRole,
            ];

            for (let i = 0; i < defaultkeys.length; i++) {
                let key = defaultkeys[i];
                assert.ok(!!context.tags[key], (key = " is set"));
            }
        });

        it("should set internalSdkVersion to 'node:<version>'", () => {
            const context = new Context();
            // todo: make this less fragile (will need updating on each minor version change)
            assert.equal(
                context.tags[context.keys.internalSdkVersion].substring(0, 9),
                "node:2.0."
            );
        });

        it("should correctly set device context", () => {
            const context = new Context();
            assert.equal(context.tags[context.keys.cloudRoleInstance], "host");
            assert.equal(context.tags[context.keys.deviceOSVersion], "type release");
            assert.equal(context.tags[context.keys.cloudRole], Context.DefaultRoleName);

            assert.equal(context.tags["ai.device.osArchitecture"], "arch");
            assert.equal(context.tags["ai.device.osPlatform"], "platform");
        });
    });
});
