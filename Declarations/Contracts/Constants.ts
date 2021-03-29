export class RemoteDependencyDataConstants {
    public static TYPE_HTTP:string = "Http";
    public static TYPE_AI:string = "Http (tracked component)";
}

/**
 * Subset of Connection String fields which this SDK can parse. Lower-typecased to
 * allow for case-insensitivity across field names
 * @type ConnectionStringKey
 */
export interface ConnectionString {
    authorization?: string;
    instrumentationkey?: string;
    ingestionendpoint?: string;
    liveendpoint?: string;
    location?: string;
    endpointsuffix?: string;

    // Note: this is a node types backcompat equivalent to
    // type ConnectionString = { [key in ConnectionStringKey]?: string }
}

export type ConnectionStringKey = "authorization" | "instrumentationkey" | "ingestionendpoint" | "liveendpoint" | "location" | "endpointsuffix";
