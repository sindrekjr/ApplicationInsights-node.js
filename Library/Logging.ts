import Provider from './Provider';

class Logging {

    private static TAG = "ApplicationInsights:";

    private static get _logger() {
        if (Provider.instance) {
            return Provider.instance.logger;
        }
        return console;
    }

    public static info(message?: any, ...optionalParams: any[]) {
        this._logger.info(Logging.TAG + message, optionalParams);
    }

    public static warn(message?: any, ...optionalParams: any[]) {
        this._logger.warn(Logging.TAG + message, optionalParams);
    }
}

export = Logging;
