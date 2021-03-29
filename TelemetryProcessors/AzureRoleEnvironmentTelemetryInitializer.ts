import Models = require("../generated");
import Context = require("../Library/Context");

/**
 *  A telemetry processor that handles Azure specific variables.
 */
export function azureRoleEnvironmentTelemetryProcessor(envelope: Models.TelemetryItem, context: Context): void {
    if (process.env.WEBSITE_SITE_NAME) { // Azure Web apps and Functions
        envelope.tags[context.keys.cloudRole] = process.env.WEBSITE_SITE_NAME;
    }
}
