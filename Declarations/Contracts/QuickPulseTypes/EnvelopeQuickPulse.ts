import { DocumentQuickPulse } from "./DocumentQuickPulse";
import { MetricQuickPulse } from "./MetricQuickPulse";

export interface EnvelopeQuickPulse {
    Documents: DocumentQuickPulse[] | null;

    Instance: string;

    InstrumentationKey: string;

    InvariantVersion: number;

    MachineName: string;

    Metrics: MetricQuickPulse[] | null;

    StreamId: string;

    Timestamp: string;

    Version: string;
}
