import https = require("https");
import assert = require("assert");
import path = require("path")
import os = require("os")
import fs = require('fs');
import nock = require("nock");
import sinon = require("sinon");
import child_process = require("child_process");
import AppInsights = require("../applicationinsights");
import Sender = require("../Library/Sender");
import { TelemetryItem } from "../generated";
import { DEFAULT_BREEZE_ENDPOINT } from "../Declarations/Constants";


describe("RetryEndToEnd", () => {
    let ingest: TelemetryItem[] = [];
    nock(DEFAULT_BREEZE_ENDPOINT)
        .post("/v2/track", (body: TelemetryItem[]) => {
            ingest.push(...body);
            return true;
        })
        .reply(408, { // Timeout
            itemsAccepted: 0,
            itemsReceived: 1,
            errors: []
        })
        .persist();

    beforeEach(() => {
        AppInsights.defaultClient = undefined;
    });

    after(() => {
        nock.cleanAll();
    });

    describe("Disk retry mode", () => {
        var CorrelationIdManager = require("../Library/CorrelationIdManager");
        var cidStub: sinon.SinonStub = null;
        var writeFile: sinon.SinonStub;
        var writeFileSync: sinon.SinonStub;
        var readFile: sinon.SinonStub;
        var lstat: sinon.SinonStub;
        var mkdir: sinon.SinonStub;
        var exists: sinon.SinonStub;
        var existsSync: sinon.SinonStub;
        var readdir: sinon.SinonStub;
        var readdirSync: sinon.SinonStub;
        var stat: sinon.SinonStub;
        var statSync: sinon.SinonStub;
        var mkdirSync: sinon.SinonStub;
        var spawn: sinon.SinonStub;
        var spawnSync: sinon.SinonStub;

        beforeEach(() => {
            cidStub = sinon.stub(CorrelationIdManager, 'queryCorrelationId'); // TODO: Fix method of stubbing requests to allow CID to be part of E2E tests
            writeFile = sinon.stub(fs, 'writeFile');
            writeFileSync = sinon.stub(fs, 'writeFileSync');
            exists = sinon.stub(fs, 'exists').yields(true);
            existsSync = sinon.stub(fs, 'existsSync').returns(true);
            readdir = sinon.stub(fs, 'readdir').yields(null, ['1.ai.json']);
            readdirSync = sinon.stub(fs, 'readdirSync').returns(['1.ai.json']);
            stat = sinon.stub(fs, 'stat').yields(null, { isFile: () => true, size: 8000 });
            statSync = sinon.stub(fs, 'statSync').returns({ isFile: () => true, size: 8000 });
            lstat = sinon.stub(fs, 'lstat').yields(null, { isDirectory: () => true });
            mkdir = sinon.stub(fs, 'mkdir').yields(null);
            mkdirSync = sinon.stub(fs, 'mkdirSync').returns(null);
            readFile = sinon.stub(fs, 'readFile').yields(null, '');
            spawn = sinon.stub(child_process, 'spawn').returns({
                on: (type: string, cb: any) => {
                    if (type === 'close') {
                        cb(0);
                    }
                },
                stdout: {
                    on: (type: string, cb: any) => {
                        if (type === 'data') {
                            cb('stdoutmock');
                        }
                    }
                }
            });
            if (child_process.spawnSync) {
                spawnSync = sinon.stub(child_process, 'spawnSync').returns({ status: 0, stdout: 'stdoutmock' });
            }
        });

        afterEach(() => {
            cidStub.restore();
            writeFile.restore();
            exists.restore();
            readdir.restore();
            readFile.restore();
            writeFileSync.restore();
            existsSync.restore();
            stat.restore();
            lstat.restore();
            mkdir.restore();
            mkdirSync.restore();
            readdirSync.restore();
            statSync.restore();
            spawn.restore();
            if (child_process.spawnSync) {
                spawnSync.restore();
            }
        });

        // it("disabled by default for new clients", (done) => {
        //     var client = new AppInsights.TelemetryClient("key");

        //     client.trackEvent({ name: "test event" });

        //     setImmediate(() => {
        //         client.flush({
        //             callback: (response: any) => {
        //                 // yield for the caching behavior
        //                 setImmediate(() => {
        //                     assert(writeFile.callCount === 0);
        //                     done();
        //                 });
        //             }
        //         });
        //     });
        // });

        it("enabled by default for default client", (done) => {
            AppInsights
                .setup("1aa11111-bbbb-1ccc-8ddd-eeeeffff3333")
                .setUseDiskRetryCaching(true)
                .setAutoCollectRequests(false)
                .setAutoCollectDependencies(false)
                .start();

            var client = AppInsights.defaultClient;

            //client.trackEvent({ name: "test event" });
            client.trackMetric({ name: "test metric", value: 3 });

            setImmediate(() => {
                client.flush({
                    callback: (response: any) => {
                        // yield for the caching behavior
                        setImmediate(() => {
                            assert.equal(writeFile.callCount, 1);
                            assert.equal(spawn.callCount, os.type() === "Windows_NT" ? 2 : 0);
                            done();
                        });
                    }
                });
            })
        });

        it("stores data to disk when enabled", (done) => {
            var client = new AppInsights.TelemetryClient("key");
            client.channel.setUseDiskRetryCaching(true);

            client.trackEvent({ name: "test event" });

            client.flush({
                callback: (response: any) => {
                    // yield for the caching behavior
                    setImmediate(() => {
                        assert(writeFile.callCount === 1);
                        assert.equal(
                            path.dirname(writeFile.firstCall.args[0]),
                            path.join(os.tmpdir(), Sender.TEMPDIR_PREFIX + "key"));
                        assert.equal(writeFile.firstCall.args[2].mode, 0o600, "File must not have weak permissions");
                        assert.equal(spawn.callCount, 0); // Should always be 0 because of caching after first call to ICACLS
                        done();
                    });
                }
            });
        });

        it("uses WindowsIdentity to get the identity for ICACLS", (done) => {
            var client = new AppInsights.TelemetryClient("uniquekey");
            client.channel.setUseDiskRetryCaching(true);
            var origICACLS = (<any>client.channel._sender.constructor).USE_ICACLS;
            (<any>client.channel._sender.constructor).USE_ICACLS = true; // Simulate ICACLS environment even on *nix

            // Clear ICACLS caches for test purposes
            (<any>client.channel._sender.constructor).ACL_IDENTITY = null;
            (<any>client.channel._sender.constructor).ACLED_DIRECTORIES = {};

            client.trackEvent({ name: "test event" });

            client.flush({
                callback: (response: any) => {
                    // yield for the caching behavior
                    setImmediate(() => {
                        assert.equal(writeFile.callCount, 1);
                        assert.equal(spawn.callCount, 2);

                        // First external call should be to powershell to query WindowsIdentity
                        assert(spawn.firstCall.args[0].indexOf('powershell.exe'));
                        assert.equal(spawn.firstCall.args[1][0], "-Command");
                        assert.equal(spawn.firstCall.args[1][1], "[System.Security.Principal.WindowsIdentity]::GetCurrent().Name");
                        assert.equal((<any>client.channel._sender.constructor).ACL_IDENTITY, 'stdoutmock');

                        // Next call should be to ICACLS (with the acquired identity)
                        assert(spawn.lastCall.args[0].indexOf('icacls.exe'));
                        assert.equal(spawn.lastCall.args[1][3], "/grant");
                        assert.equal(spawn.lastCall.args[1][4], "stdoutmock:(OI)(CI)F");

                        (<any>client.channel._sender.constructor).USE_ICACLS = origICACLS;
                        done();
                    });
                }
            });
        });

        it("refuses to store data if ACL identity fails", (done) => {
            spawn.restore();
            var tempSpawn = sinon.stub(child_process, 'spawn').returns({
                on: (type: string, cb: any) => {
                    if (type == 'close') {
                        cb(2000); // return non-zero status code
                    }
                },
                stdout: {
                    on: (type: string, cb: any) => {
                        return; // do nothing
                    }
                }
            });

            var client = new AppInsights.TelemetryClient("uniquekey");
            client.channel.setUseDiskRetryCaching(true);
            var origICACLS = (<any>client.channel._sender.constructor).USE_ICACLS;
            (<any>client.channel._sender.constructor).USE_ICACLS = true; // Simulate ICACLS environment even on *nix

            // Set ICACLS caches for test purposes
            (<any>client.channel._sender.constructor).ACL_IDENTITY = null;
            (<any>client.channel._sender.constructor).ACLED_DIRECTORIES = {};

            client.trackEvent({ name: "test event" });

            client.flush({
                callback: (response: any) => {
                    // yield for the caching behavior
                    setImmediate(() => {
                        assert(writeFile.callCount === 0);
                        assert.equal(tempSpawn.callCount, 1);

                        tempSpawn.restore();
                        (<any>client.channel._sender.constructor).USE_ICACLS = origICACLS;
                        done();
                    });
                }
            });
        });

        it("refuses to query for ACL identity twice", (done) => {
            spawn.restore();
            var tempSpawn = sinon.stub(child_process, 'spawn').returns({
                on: (type: string, cb: any) => {
                    if (type == 'close') {
                        cb(2000); // return non-zero status code
                    }
                },
                stdout: {
                    on: (type: string, cb: any) => {
                        return; // do nothing
                    }
                }
            });

            var client = new AppInsights.TelemetryClient("uniquekey");
            client.channel.setUseDiskRetryCaching(true);
            var origICACLS = (<any>client.channel._sender.constructor).USE_ICACLS;
            (<any>client.channel._sender.constructor).USE_ICACLS = true; // Simulate ICACLS environment even on *nix

            // Set ICACLS caches for test purposes
            (<any>client.channel._sender.constructor).ACL_IDENTITY = null;
            (<any>client.channel._sender.constructor).ACLED_DIRECTORIES = {};

            client.trackEvent({ name: "test event" });

            client.flush({
                callback: (response: any) => {
                    // yield for the caching behavior
                    setImmediate(() => {
                        assert(writeFile.callCount === 0);
                        assert.equal(tempSpawn.callCount, 1);

                        client.trackEvent({ name: "test event" });

                        client.flush({
                            callback: (response: any) => {
                                // yield for the caching behavior
                                setImmediate(() => {
                                    // The call counts shouldnt have changed
                                    assert(writeFile.callCount === 0);
                                    assert.equal(tempSpawn.callCount, 1);

                                    tempSpawn.restore();
                                    (<any>client.channel._sender.constructor).USE_ICACLS = origICACLS;
                                    done();
                                });
                            }
                        });
                    });
                }
            });
        });

        it("refuses to query for ACL identity twice (process never returned)", (done) => {
            spawn.restore();
            var tempSpawn = sinon.stub(child_process, 'spawn').returns({
                on: (type: string, cb: any) => {
                    return; // do nothing
                },
                stdout: {
                    on: (type: string, cb: any) => {
                        return; // do nothing
                    }
                }
            });

            var client = new AppInsights.TelemetryClient("uniquekey");
            client.channel.setUseDiskRetryCaching(true);
            var origICACLS = (<any>client.channel._sender.constructor).USE_ICACLS;
            (<any>client.channel._sender.constructor).USE_ICACLS = true; // Simulate ICACLS environment even on *nix

            // Set ICACLS caches for test purposes
            (<any>client.channel._sender.constructor).ACL_IDENTITY = null;
            (<any>client.channel._sender.constructor).ACLED_DIRECTORIES = {};

            client.trackEvent({ name: "test event" });

            client.flush({
                callback: (response: any) => {
                    // yield for the caching behavior
                    setImmediate(() => {
                        assert(writeFile.callCount === 0);
                        assert.equal(tempSpawn.callCount, 1);

                        client.trackEvent({ name: "test event" });

                        client.flush({
                            callback: (response: any) => {
                                // yield for the caching behavior
                                setImmediate(() => {
                                    // The call counts shouldnt have changed
                                    assert(writeFile.callCount === 0);
                                    assert.equal(tempSpawn.callCount, 1);

                                    tempSpawn.restore();
                                    (<any>client.channel._sender.constructor).USE_ICACLS = origICACLS;
                                    done();
                                });
                            }
                        });
                    });
                }
            });
        });

        it("refuses to store data if ICACLS fails", (done) => {
            spawn.restore();
            var tempSpawn = sinon.stub(child_process, 'spawn').returns({
                on: (type: string, cb: any) => {
                    if (type == 'close') {
                        cb(2000); // return non-zero status code
                    }
                }
            });

            var client = new AppInsights.TelemetryClient("uniquekey");
            client.channel.setUseDiskRetryCaching(true);
            var origICACLS = (<any>client.channel._sender.constructor).USE_ICACLS;
            (<any>client.channel._sender.constructor).USE_ICACLS = true; // Simulate ICACLS environment even on *nix

            // Set ICACLS caches for test purposes
            (<any>client.channel._sender.constructor).ACL_IDENTITY = 'testidentity'; // Don't use spawn for identity
            (<any>client.channel._sender.constructor).ACLED_DIRECTORIES = {};

            client.trackEvent({ name: "test event" });

            client.flush({
                callback: (response: any) => {
                    // yield for the caching behavior
                    setImmediate(() => {
                        assert(writeFile.callCount === 0);
                        assert.equal(tempSpawn.callCount, 1);

                        tempSpawn.restore();
                        (<any>client.channel._sender.constructor).USE_ICACLS = origICACLS;
                        done();
                    });
                }
            });
        });

        it("creates directory when nonexistent", (done) => {
            lstat.restore();
            var tempLstat = sinon.stub(fs, 'lstat').yields({ code: "ENOENT" }, null);

            var client = new AppInsights.TelemetryClient("key");
            client.channel.setUseDiskRetryCaching(true);

            client.trackEvent({ name: "test event" });

            client.flush({
                callback: (response: any) => {
                    setImmediate(() => {
                        assert.equal(mkdir.callCount, 1);
                        assert.equal(mkdir.firstCall.args[0], path.join(os.tmpdir(), Sender.TEMPDIR_PREFIX + "key"));
                        assert.equal(writeFile.callCount, 1);
                        assert.equal(
                            path.dirname(writeFile.firstCall.args[0]),
                            path.join(os.tmpdir(), Sender.TEMPDIR_PREFIX + "key"));
                        assert.equal(writeFile.firstCall.args[2].mode, 0o600, "File must not have weak permissions");

                        tempLstat.restore();
                        done();
                    });
                }
            });
        });

        it("does not store data when limit is below directory size", (done) => {
            var client = new AppInsights.TelemetryClient("key");
            client.channel.setUseDiskRetryCaching(true, null, 10); // 10 bytes is less than synthetic directory size (see file size in stat mock)

            client.trackEvent({ name: "test event" });

            client.flush({
                callback: (response: any) => {
                    // yield for the caching behavior
                    setImmediate(() => {
                        assert(writeFile.callCount === 0);
                        done();
                    });
                }
            });
        });

        it("checks for files when connection is back online", (done) => {
            var client = new AppInsights.TelemetryClient("key");
            client.channel.setUseDiskRetryCaching(true, 0);

            client.trackEvent({ name: "test event" });

            client.flush({
                callback: (response: any) => {
                    // wait until sdk looks for offline files
                    setTimeout(() => {
                        assert(readdir.callCount === 1);
                        assert(readFile.callCount === 1);
                        assert.equal(
                            path.dirname(readFile.firstCall.args[0]),
                            path.join(os.tmpdir(), Sender.TEMPDIR_PREFIX + "key"));
                        done();
                    }, 10);
                }
            });
        });

        // it("cache payload synchronously when process crashes (Node >= 0.11.12)", () => {
        //     var nodeVer = process.versions.node.split(".");
        //     if (parseInt(nodeVer[0]) > 0 || parseInt(nodeVer[1]) > 11 || (parseInt(nodeVer[1]) == 11) && parseInt(nodeVer[2]) > 11) {
        //         var req = new fakeRequest(true);

        //         var client = new AppInsights.TelemetryClient("key2");
        //         client.channel.setUseDiskRetryCaching(true);

        //         client.trackEvent({ name: "test event" });

        //         request.returns(req);

        //         client.channel.triggerSend(true);

        //         assert(existsSync.callCount === 1);
        //         assert(writeFileSync.callCount === 1);
        //         assert.equal(spawnSync.callCount, os.type() === "Windows_NT" ? 1 : 0); // This is implicitly testing caching of ACL identity (otherwise call count would be 2 like it is the non-sync time)
        //         assert.equal(
        //             path.dirname(writeFileSync.firstCall.args[0]),
        //             path.join(os.tmpdir(), Sender.TEMPDIR_PREFIX + "key2"));
        //         assert.equal(writeFileSync.firstCall.args[2].mode, 0o600, "File must not have weak permissions");
        //     }
        // });

        // it("cache payload synchronously when process crashes (Node < 0.11.12, ICACLS)", () => {
        //     var nodeVer = process.versions.node.split(".");
        //     if (!(parseInt(nodeVer[0]) > 0 || parseInt(nodeVer[1]) > 11 || (parseInt(nodeVer[1]) == 11) && parseInt(nodeVer[2]) > 11)) {
        //         var req = new fakeRequest(true);

        //         var client = new AppInsights.TelemetryClient("key22");
        //         client.channel.setUseDiskRetryCaching(true);
        //         var origICACLS = (<any>client.channel._sender.constructor).USE_ICACLS;
        //         (<any>client.channel._sender.constructor).USE_ICACLS = true; // Simulate ICACLS environment even on *nix

        //         client.trackEvent({ name: "test event" });

        //         request.returns(req);

        //         client.channel.triggerSend(true);

        //         assert(existsSync.callCount === 1);
        //         assert(writeFileSync.callCount === 0);
        //         (<any>client.channel._sender.constructor).USE_ICACLS = origICACLS;
        //     }
        // });

        // it("cache payload synchronously when process crashes (Node < 0.11.12, Non-ICACLS)", () => {
        //     var nodeVer = process.versions.node.split(".");
        //     if (!(parseInt(nodeVer[0]) > 0 || parseInt(nodeVer[1]) > 11 || (parseInt(nodeVer[1]) == 11) && parseInt(nodeVer[2]) > 11)) {
        //         var req = new fakeRequest(true);

        //         var client = new AppInsights.TelemetryClient("key23");
        //         client.channel.setUseDiskRetryCaching(true);
        //         var origICACLS = (<any>client.channel._sender.constructor).USE_ICACLS;
        //         (<any>client.channel._sender.constructor).USE_ICACLS = false; // Simulate Non-ICACLS environment even on Windows

        //         client.trackEvent({ name: "test event" });

        //         request.returns(req);

        //         client.channel.triggerSend(true);

        //         assert(existsSync.callCount === 1);
        //         assert(writeFileSync.callCount === 1);
        //         assert.equal(
        //             path.dirname(writeFileSync.firstCall.args[0]),
        //             path.join(os.tmpdir(), Sender.TEMPDIR_PREFIX + "key23"));
        //         assert.equal(writeFileSync.firstCall.args[2].mode, 0o600, "File must not have weak permissions");
        //     }
        // });

        // it("use WindowsIdentity to get ACL identity when process crashes (Node > 0.11.12, ICACLS)", () => {
        //     var nodeVer = process.versions.node.split(".");
        //     if ((parseInt(nodeVer[0]) > 0 || parseInt(nodeVer[1]) > 11 || (parseInt(nodeVer[1]) == 11) && parseInt(nodeVer[2]) > 11)) {
        //         var req = new fakeRequest(true);

        //         var client = new AppInsights.TelemetryClient("key22");
        //         client.channel.setUseDiskRetryCaching(true);
        //         var origICACLS = (<any>client.channel._sender.constructor).USE_ICACLS;
        //         (<any>client.channel._sender.constructor).USE_ICACLS = true; // Simulate ICACLS environment even on *nix

        //         // Set ICACLS caches for test purposes
        //         (<any>client.channel._sender.constructor).ACL_IDENTITY = null;
        //         (<any>client.channel._sender.constructor).ACLED_DIRECTORIES = {};

        //         client.trackEvent({ name: "test event" });

        //         request.returns(req);

        //         client.channel.triggerSend(true);

        //         // First external call should be to powershell to query WindowsIdentity
        //         assert(spawnSync.firstCall.args[0].indexOf('powershell.exe'));
        //         assert.equal(spawnSync.firstCall.args[1][0], "-Command");
        //         assert.equal(spawnSync.firstCall.args[1][1], "[System.Security.Principal.WindowsIdentity]::GetCurrent().Name");
        //         assert.equal((<any>client.channel._sender.constructor).ACL_IDENTITY, 'stdoutmock');

        //         // Next call should be to ICACLS (with the acquired identity)
        //         assert(spawnSync.lastCall.args[0].indexOf('icacls.exe'));
        //         assert.equal(spawnSync.lastCall.args[1][3], "/grant");
        //         assert.equal(spawnSync.lastCall.args[1][4], "stdoutmock:(OI)(CI)F");

        //         (<any>client.channel._sender.constructor).USE_ICACLS = origICACLS;
        //     }
        // });

        // it("refuses to cache payload when process crashes if ICACLS fails", () => {
        //     if (child_process.spawnSync) { // Doesn't exist in Node < 0.11.12
        //         spawnSync.restore();
        //         var tempSpawnSync = sinon.stub(child_process, 'spawnSync').returns({ status: 2000 });
        //     }

        //     var req = new fakeRequest(true);

        //     var client = new AppInsights.TelemetryClient("key3"); // avoid icacls cache by making key unique
        //     client.channel.setUseDiskRetryCaching(true);
        //     var origICACLS = (<any>client.channel._sender.constructor).USE_ICACLS;
        //     (<any>client.channel._sender.constructor).USE_ICACLS = true; // Simulate ICACLS environment even on *nix

        //     client.trackEvent({ name: "test event" });

        //     request.returns(req);

        //     client.channel.triggerSend(true);

        //     assert(existsSync.callCount === 1);
        //     assert(writeFileSync.callCount === 0);

        //     if (child_process.spawnSync) {
        //         assert.equal(tempSpawnSync.callCount, 1);

        //         (<any>client.channel._sender.constructor).USE_ICACLS = origICACLS;
        //         tempSpawnSync.restore();
        //     }
        // });
    });

});
