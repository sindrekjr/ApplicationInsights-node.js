import os = require("os");
import fs = require("fs");
import path = require("path");

import Contracts = require("../Declarations/Contracts");
import Logging = require("./Logging");

class Context {
    public keys: Contracts.ContextTagKeys;
    public tags: { [key: string]: string };
    public static DefaultRoleName: string = "Web";
    public static appVersion: { [path: string]: string } = {};
    public static sdkVersion: string = null;

    constructor(packageJsonPath?: string) {
        this.keys = new Contracts.ContextTagKeys();
        this.tags = <{ [key: string]: string }>{};

        this._loadApplicationContext();
        this._loadDeviceContext();
        this._loadInternalContext();
    }

    private _loadApplicationContext(packageJsonPath?: string) {
        // note: this should return the host package.json
        packageJsonPath = packageJsonPath || path.resolve(__dirname, "../../../../package.json");
        const packageJsonPathTsNode = path.resolve(__dirname, "../../../package.json"); // path to read from if using ts-node

        let packageJson: { version: string } | null = null;

        if (!Context.appVersion[packageJsonPath]) {
            Context.appVersion[packageJsonPath] = "unknown";
            try {
                packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
            } catch (_e) {
                try {
                    packageJson = JSON.parse(fs.readFileSync(packageJsonPathTsNode, "utf8"));
                } catch (exception) {
                    Logging.info("unable to read app version:", exception);
                }
            }

            if (packageJson && typeof packageJson.version === "string") {
                Context.appVersion[packageJsonPath] = packageJson.version;
            }
        }

        this.tags[this.keys.applicationVersion] = Context.appVersion[packageJsonPath];
    }

    private _loadDeviceContext() {
        this.tags[this.keys.deviceId] = "";
        this.tags[this.keys.cloudRoleInstance] = os && os.hostname();
        this.tags[this.keys.deviceOSVersion] = os && os.type() + " " + os.release();
        this.tags[this.keys.cloudRole] = Context.DefaultRoleName;

        // not yet supported tags
        this.tags["ai.device.osArchitecture"] = os && os.arch();
        this.tags["ai.device.osPlatform"] = os && os.platform();
    }

    private _loadInternalContext() {
        // note: this should return the sdk package.json
        const packageJsonPath = path.resolve(__dirname, "../../package.json");
        const packageJsonPathTsNode = path.resolve(__dirname, "../package.json");

        let packageJson: { version: string } | null = null;

        if (!Context.sdkVersion) {
            Context.sdkVersion = "unknown";
            try {
                packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
            } catch (_e) {
                try {
                    packageJson = JSON.parse(fs.readFileSync(packageJsonPathTsNode, "utf8"));
                } catch (exception) {
                    Logging.info("unable to read sdk version: ", exception);
                }
            }

            if (packageJson && typeof packageJson.version === "string") {
                Context.sdkVersion = packageJson.version;
            }
        }

        this.tags[this.keys.internalSdkVersion] = "node:" + Context.sdkVersion;
    }
}

export = Context;
