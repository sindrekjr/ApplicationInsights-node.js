﻿import * as os from "os";
import * as fs from "fs";
import * as path from "path";

import { Resource } from "@opentelemetry/resources";
import { APPLICATION_INSIGHTS_SDK_VERSION } from "../Declarations/Constants";
import { Logger } from "./Logging/Logger";
import { KnownContextTagKeys } from "../Declarations/Generated";

export class Context {


    public tags: { [key: string]: string };
    public static DefaultRoleName: string = "Web";
    public static appVersion: { [path: string]: string } = {};
    public static sdkVersion: string = null;

    private _resource: Resource;

    constructor(resource?: Resource, packageJsonPath?: string) {
        this._resource = resource ? resource : Resource.EMPTY;
        this.tags = <{ [key: string]: string }>{};
        this._loadApplicationContext(packageJsonPath);
        this._loadDeviceContext();
        this._loadInternalContext();
    }

    public getResource(): Resource {
        return this._resource;
    }

    private _loadApplicationContext(packageJsonPath?: string) {
        // note: this should return the host package.json
        packageJsonPath = packageJsonPath || path.resolve(__dirname, "../../../../package.json");

        if (!Context.appVersion[packageJsonPath]) {
            Context.appVersion[packageJsonPath] = "unknown";
            try {
                let packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
                if (packageJson && typeof packageJson.version === "string") {
                    Context.appVersion[packageJsonPath] = packageJson.version;
                }
            } catch (exception) {
                Logger.info("unable to read app version: ", exception);
            }
        }

        this.tags[KnownContextTagKeys.AiApplicationVer] = Context.appVersion[packageJsonPath];
    }

    private _loadDeviceContext() {
        this.tags[KnownContextTagKeys.AiDeviceId] = "";
        this.tags[KnownContextTagKeys.AiCloudRoleInstance] = os && os.hostname();
        this.tags[KnownContextTagKeys.AiDeviceOsVersion] = os && (os.type() + " " + os.release());
        this.tags[KnownContextTagKeys.AiCloudRole] = Context.DefaultRoleName;

        // not yet supported tags
        this.tags["ai.device.osArchitecture"] = os && os.arch();
        this.tags["ai.device.osPlatform"] = os && os.platform();
    }

    private _loadInternalContext() {
        Context.sdkVersion = APPLICATION_INSIGHTS_SDK_VERSION;
        this.tags[KnownContextTagKeys.AiInternalSdkVersion] = "node:" + Context.sdkVersion;
    }
}
