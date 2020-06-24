import { LogLevel, ConsoleLogger } from "@opentelemetry/core";
import { NodeTracerProvider } from "@opentelemetry/node";

const provider = new NodeTracerProvider({
  logLevel: LogLevel.DEBUG,
  logger: new ConsoleLogger(LogLevel.DEBUG),
  plugins: {
    https: {
      enabled: true,
      path: "@opentelemetry/plugin-https",
      ignoreOutgoingUrls: [new RegExp(/dc.services.visualstudio.com/i)],
    } as any
  }
});

provider.register();

export default provider;
