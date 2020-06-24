import { LogLevel, ConsoleLogger } from "@opentelemetry/core";
import { NodeTracerProvider } from "@opentelemetry/node";
import { NoopContextManager, ContextManager } from "@opentelemetry/context-base";

import { DEFAULT_INSTRUMENTATION_PLUGINS } from "@opentelemetry/node/build/src/config";
import type { Plugins } from "@opentelemetry/node/build/src/instrumentation/PluginLoader";

export default class Provider {

  static config: Plugins = DEFAULT_INSTRUMENTATION_PLUGINS;

  private static _instance: NodeTracerProvider;
  private static _contextManager: ContextManager | undefined;
  private static _logLevel = LogLevel.DEBUG;

  static get instance(): NodeTracerProvider {
    return this._instance;
  }

  static set loggingLevel(logLevel: LogLevel) {
    this._logLevel = logLevel;
  }

  static enablePlugin(module: string, enabled: boolean): Provider {
    this.config[module].enabled = enabled;
    return this;
  }

  static enableCorrelation(enabled: boolean): Provider {
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

    return this._instance;
  }

  static dispose(): void {
    if (this._instance) {
      this._instance.stop();
      this._instance = null;
    }
  }
}
