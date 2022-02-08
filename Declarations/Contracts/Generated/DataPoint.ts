import { DataPointType } from "./DataPointType";


/**
 * Metric data single measurement.
 */
export class DataPoint {

    /**
     * Name of the metric.
     */
    public name: string;

    /**
     * Namespace of the metric.
     */
    public ns: string;

    /**
     * Metric type. Single measurement or the aggregated value.
     */
    public kind: DataPointType;

    /**
     * Single value for measurement. Sum of individual measurements for the aggregation.
     */
    public value: number;

    /**
     * Metric weight of the aggregated metric. Should not be set for a measurement.
     */
    public count: number;

    /**
     * Minimum value of the aggregated metric. Should not be set for a measurement.
     */
    public min: number;

    /**
     * Maximum value of the aggregated metric. Should not be set for a measurement.
     */
    public max: number;

    /**
     * Standard deviation of the aggregated metric. Should not be set for a measurement.
     */
    public stdDev: number;

    constructor() {
        this.kind = DataPointType.Measurement;
    }
}

