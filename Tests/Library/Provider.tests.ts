import Provider from "../../Library/Provider";
import * as assert from "assert";
// eslint-disable-next-line node/no-missing-import
import { DEFAULT_INSTRUMENTATION_PLUGINS } from "@opentelemetry/node/build/src/config";

describe("Provider", () => {
    afterEach(() => {
        Provider.dispose();
    });

    describe("#setupInstrumentationPlugin()", () => {
        it("should enable plugin for non-default module", () => {
            const module = "some-package";
            const plugin = "opentelemetry-instrumentation-some-package";

            assert.deepStrictEqual(Provider.config, DEFAULT_INSTRUMENTATION_PLUGINS);
            Provider.setInstrumentationPlugin(module, {
                enabled: true,
                path: plugin,
            });

            assert.deepStrictEqual(Provider.config[module], {
                enabled: true,
                path: plugin,
            });
        });

        it("should enable plugin for default module", () => {
            const module = "grpc";
            const plugin = "@opentelemetry/plugin-grpc";

            assert.deepStrictEqual(Provider.config, DEFAULT_INSTRUMENTATION_PLUGINS);
            assert.strictEqual(Provider.config[module].enabled, true);
            assert.strictEqual(Provider.config[module].path, plugin);

            Provider.setInstrumentationPlugin(module, false);
            assert.strictEqual(Provider.config[module].enabled, false);
            assert.strictEqual(Provider.config[module].path, plugin);
        });
    });
});
