import { LogLevel, ConsoleLogger } from "@opentelemetry/core";
import { NodeTracerProvider } from "@opentelemetry/node";
import { NoopContextManager, ContextManager } from "@opentelemetry/context-base";
import * as opentelemetry from "@opentelemetry/api";

import { DEFAULT_INSTRUMENTATION_PLUGINS } from "@opentelemetry/node/build/src/config";
import type { Plugins } from "@opentelemetry/node/build/src/instrumentation/PluginLoader";
import { Tracer } from "@opentelemetry/tracing";
import Logging = require("./Logging");
import { PluginConfig } from "@opentelemetry/api";

const setupWarningMessage = (fn: string) => `${fn}(...) was called after the provider was already set up. Provider.start() must be called again for this change to take effect.`;

type DefaultPlugins =
  | 'mongodb'
  | 'grpc'
  | 'http'
  | 'https'
  | 'mysql'
  | 'pg'
  | 'redis'
  | 'ioredis'
  | 'pg-pool'
  | 'express';

export default class Provider {

  static config: Plugins = DEFAULT_INSTRUMENTATION_PLUGINS;

  private static _instance: NodeTracerProvider;
  private static _contextManager: ContextManager | undefined;
  private static _logLevel = LogLevel.DEBUG;
  private static _started = false;

  static get instance(): NodeTracerProvider {
    return this._instance;
  }

  static set loggingLevel(logLevel: LogLevel) {
    this._logLevel = logLevel;
  }

  static get tracer(): Tracer {
    return opentelemetry.trace.getTracer("applicationinsights") as Tracer;
  }

  static setInstrumentationPlugin(module: DefaultPlugins, config: boolean): Provider;
  static setInstrumentationPlugin(module: string, config: PluginConfig): Provider;
  static setInstrumentationPlugin(module: string | DefaultPlugins, config: boolean | PluginConfig): Provider {
    if (this._started) {
      Logging.warn(setupWarningMessage("setInstrumentationPlugin"));
    }

    if (this.config[module] && typeof config === "boolean") {
      this.config[module].enabled = config
    } else if (typeof config === "object") {
      this.config[module] = {
        ...this.config[module],
        ...config,
      };
    } else {
      Logging.warn("setInstrumentationPlugin(...) was called with invalid arguments", arguments);
    }

    return this;
  }

  static setContextCorrelation(enabled: boolean): Provider {
    if (this._started) {
      Logging.warn(setupWarningMessage("setContextCorrelation"));
    }

    this._contextManager = enabled
      ? undefined // if undefined, defaults to AsyncHooksContextManager inside OpenTelemetry
      : new NoopContextManager();
    return this;
  }

  static setup(): NodeTracerProvider {
    return this._instance;
  }

  static start(): NodeTracerProvider {
    if (!this._instance) {
      this.setup();
    }

    (this.config.https as any)["ignoreOutgoingUrls"] = [new RegExp(/services.visualstudio.com/i)];
    this._instance = new NodeTracerProvider({
      logLevel: this._logLevel,
      logger: new ConsoleLogger(this._logLevel),
      plugins: this.config,
    });

    this._instance.register({
      contextManager: this._contextManager,
    });

    this._started = true;
    return this._instance;
  }

  static flush(): void {
    this._instance?.getActiveSpanProcessor().forceFlush();
  }

  static dispose(): void {
    if (this._instance) {
      this.config = DEFAULT_INSTRUMENTATION_PLUGINS;
      this._instance.stop();
      this._instance = null;
      this._started = false;
    }
  }
}
