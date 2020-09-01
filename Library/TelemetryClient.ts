import Provider from "./Provider";
import url = require("url");

import Config = require("./Config");
import Context = require("./SdkContext");
import Contracts = require("../Declarations/Contracts");
import Channel = require("./Channel");
import TelemetryProcessors = require("../TelemetryProcessors");
import Sender = require("./Sender");
import Util = require("./Util");
import Logging = require("./Logging");
import FlushOptions = require("./FlushOptions");
import EnvelopeFactory = require("./EnvelopeFactory");
import QuickPulseStateManager = require("./QuickPulseStateManager");
import * as opentelemetry from "@opentelemetry/api";
import * as tracing from "@opentelemetry/tracing";
import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";
import * as conventions from "@opentelemetry/semantic-conventions";

/**
 * Application Insights telemetry client provides interface to track telemetry items, register telemetry initializers and
 * and manually trigger immediate sending (flushing)
 */
class TelemetryClient {
    private _telemetryProcessors: {
        (envelope: Contracts.Envelope, contextObjects: { [name: string]: any }): boolean;
    }[] = [];

    public config: Config;
    public context: Context;
    public commonProperties: { [key: string]: string };
    public channel: Channel;
    public quickPulseClient: QuickPulseStateManager;

    private static _azureExporterSetup = false;

    /**
     * Constructs a new client of the client
     * @param setupString the Connection String or Instrumentation Key to use (read from environment variable if not specified)
     */
    constructor(setupString?: string) {
        const config = new Config(setupString);
        this.config = config;
        this.context = new Context();
        this.commonProperties = {};

        const sender = new Sender(this.config);
        this.channel = new Channel(
            () => config.disableAppInsights,
            () => config.maxBatchSize,
            () => config.maxBatchIntervalMs,
            sender
        );
    }

    public setupSpanExporter() {
        if (!TelemetryClient._azureExporterSetup) {
            Provider.instance.addSpanProcessor(
                new tracing.BatchSpanProcessor(
                    new AzureMonitorTraceExporter({
                        connectionString: this.config.connectionString,
                        instrumentationKey: this.config.instrumentationKey,
                        logger: Provider.instance.logger,
                    }),
                    {
                        bufferTimeout: this.config.maxBatchIntervalMs,
                        bufferSize: this.config.maxBatchSize,
                    }
                )
            );
            TelemetryClient._azureExporterSetup = true;
        } else {
            Logging.warn(
                "TelemetryClient.setupSpanExporter() was called multiple times. Ignoring this call"
            );
        }
    }

    /**
     * Log information about availability of an application
     * @param telemetry      Object encapsulating tracking options
     */
    public trackAvailability(telemetry: Contracts.AvailabilityTelemetry): void {
        this.track(telemetry, Contracts.TelemetryType.Availability);
    }

    /**
     * Log a page view
     * @param telemetry      Object encapsulating tracking options
     */
    public trackPageView(telemetry: Contracts.PageViewTelemetry): void {
        this.track(telemetry, Contracts.TelemetryType.PageView);
    }

    /**
     * Log a trace message
     * @param telemetry      Object encapsulating tracking options
     */
    public trackTrace(telemetry: Contracts.TraceTelemetry): void {
        this.track(telemetry, Contracts.TelemetryType.Trace);
    }

    /**
     * Log a numeric value that is not associated with a specific event. Typically used to send regular reports of performance indicators.
     * To send a single measurement, use just the first two parameters. If you take measurements very frequently, you can reduce the
     * telemetry bandwidth by aggregating multiple measurements and sending the resulting average at intervals.
     * @param telemetry      Object encapsulating tracking options
     */
    public trackMetric(telemetry: Contracts.MetricTelemetry): void {
        this.track(telemetry, Contracts.TelemetryType.Metric);
    }

    /**
     * Log an exception
     * @param telemetry      Object encapsulating tracking options
     */
    public trackException(telemetry: Contracts.ExceptionTelemetry): void {
        if (telemetry && telemetry.exception && !Util.isError(telemetry.exception)) {
            telemetry.exception = new Error(telemetry.exception.toString());
        }
        this.track(telemetry, Contracts.TelemetryType.Exception);
    }

    /**
     * Log a user action or other occurrence.
     * @param telemetry      Object encapsulating tracking options
     */
    public trackEvent(telemetry: Contracts.EventTelemetry): void {
        this.track(telemetry, Contracts.TelemetryType.Event);
    }

    /**
     * Log a request. Note that the default client will attempt to collect HTTP requests automatically so only use this for requests
     * that aren't automatically captured or if you've disabled automatic request collection.
     *
     * @param telemetry      Object encapsulating tracking options
     */
    public trackRequest(telemetry: Contracts.RequestTelemetry & Contracts.Identified): void {
        const startTime = telemetry.time?.getTime() ?? Date.now() - telemetry.duration;
        const span = Provider.tracer.startSpan(telemetry.name, {
            parent: Provider.tracer.getCurrentSpan(),
            kind: opentelemetry.SpanKind.SERVER,
            startTime,
            attributes: {
                ...this.commonProperties,
                ...telemetry.properties,
                [conventions.GeneralAttribute.NET_PEER_ADDRESS]: telemetry.url,
                [conventions.HttpAttribute.HTTP_STATUS_CODE]: telemetry.resultCode,
                tags: this.context.tags,
            },
        });
        span.setStatus({
            code: telemetry.success
                ? opentelemetry.CanonicalCode.OK
                : opentelemetry.CanonicalCode.UNKNOWN,
        });

        span.end(startTime + telemetry.duration);
    }

    /**
     * Log a dependency. Note that the default client will attempt to collect dependencies automatically so only use this for dependencies
     * that aren't automatically captured or if you've disabled automatic dependency collection.
     *
     * @param telemetry      Object encapsulating tracking option
     * */
    public trackDependency(telemetry: Contracts.DependencyTelemetry & Contracts.Identified) {
        if (telemetry && !telemetry.target && telemetry.data) {
            // url.parse().host returns null for non-urls,
            // making this essentially a no-op in those cases
            // If this logic is moved, update jsdoc in DependencyTelemetry.target
            telemetry.target = url.parse(telemetry.data).host;
        }
        const startTime = telemetry.time?.getTime() ?? Date.now() - telemetry.duration;
        const span = Provider.tracer.startSpan(telemetry.name, {
            parent: Provider.tracer.getCurrentSpan(),
            kind: opentelemetry.SpanKind.SERVER,
            startTime,
            attributes: {
                ...this.commonProperties,
                ...telemetry.properties,
                [conventions.GeneralAttribute.NET_PEER_ADDRESS]: telemetry.data,
                [conventions.HttpAttribute.HTTP_STATUS_CODE]: telemetry.resultCode,
                tags: this.context.tags,
            },
        });
        span.setStatus({
            code: telemetry.success
                ? opentelemetry.CanonicalCode.OK
                : opentelemetry.CanonicalCode.UNKNOWN,
        });

        span.end(startTime + telemetry.duration);
    }

    /**
     * Immediately send all queued telemetry.
     * @param options Flush options, including indicator whether app is crashing and callback
     */
    public flush(options?: FlushOptions) {
        Provider.flush();
        this.channel.triggerSend(
            options ? !!options.isAppCrashing : false,
            options ? options.callback : undefined
        );
    }

    /**
     * Generic track method for all telemetry types
     * @param data the telemetry to send
     * @param telemetryType specify the type of telemetry you are tracking from the list of Contracts.DataTypes
     */
    public track(telemetry: Contracts.Telemetry, telemetryType: Contracts.TelemetryType) {
        if (telemetry && Contracts.telemetryTypeToBaseType(telemetryType)) {
            const envelope = EnvelopeFactory.createEnvelope(
                telemetry,
                telemetryType,
                this.commonProperties,
                this.context,
                this.config
            );

            // Set time on the envelope if it was set on the telemetry item
            if (telemetry.time) {
                envelope.time = telemetry.time.toISOString();
            }

            let accepted = this.runTelemetryProcessors(envelope, telemetry.contextObjects);

            // Ideally we would have a central place for "internal" telemetry processors and users can configure which ones are in use.
            // This will do for now. Otherwise clearTelemetryProcessors() would be problematic.
            accepted =
                accepted &&
                TelemetryProcessors.samplingTelemetryProcessor(envelope, {
                    correlationContext: Provider.tracer?.getCurrentSpan()?.context(),
                });

            if (accepted) {
                TelemetryProcessors.performanceMetricsTelemetryProcessor(
                    envelope,
                    this.quickPulseClient
                );
                this.channel.send(envelope);
            }
        } else {
            Logging.warn("track() requires telemetry object and telemetryType to be specified.");
        }
    }

    /**
     * Adds telemetry processor to the collection. Telemetry processors will be called one by one
     * before telemetry item is pushed for sending and in the order they were added.
     *
     * @param telemetryProcessor function, takes Envelope, and optional context object and returns boolean
     */
    public addTelemetryProcessor(
        telemetryProcessor: (
            envelope: Contracts.Envelope,
            contextObjects?: { [name: string]: any }
        ) => boolean
    ) {
        this._telemetryProcessors.push(telemetryProcessor);
    }

    /*
     * Removes all telemetry processors
     */
    public clearTelemetryProcessors() {
        this._telemetryProcessors = [];
    }

    private runTelemetryProcessors(
        envelope: Contracts.Envelope,
        contextObjects: { [name: string]: any }
    ): boolean {
        let accepted = true;
        const telemetryProcessorsCount = this._telemetryProcessors.length;

        if (telemetryProcessorsCount === 0) {
            return accepted;
        }

        contextObjects = contextObjects || {};
        contextObjects["correlationContext"] = Provider.tracer?.getCurrentSpan()?.context();

        for (let i = 0; i < telemetryProcessorsCount; ++i) {
            try {
                const processor = this._telemetryProcessors[i];
                if (processor) {
                    if (processor.apply(null, [envelope, contextObjects]) === false) {
                        accepted = false;
                        break;
                    }
                }
            } catch (error) {
                accepted = true;
                Logging.warn(
                    "One of telemetry processors failed, telemetry item will be sent.",
                    error,
                    envelope
                );
            }
        }

        return accepted;
    }
}

export = TelemetryClient;
