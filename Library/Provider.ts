import { LogLevel, ConsoleLogger } from "@opentelemetry/core";
import { NodeTracerProvider } from "@opentelemetry/node";

const provider = new NodeTracerProvider({
  logLevel: LogLevel.WARN,
  logger: new ConsoleLogger()
});

provider.register();

export default provider;
