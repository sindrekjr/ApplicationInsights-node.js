import Provider from './Provider';

const logger = Provider.logger;

class Logging {

    private static TAG = "ApplicationInsights:";

    public static info(message?: any, ...optionalParams: any[]) {
        logger.info(Logging.TAG + message, optionalParams);
    }

    public static warn(message?: any, ...optionalParams: any[]) {
        logger.warn(Logging.TAG + message, optionalParams);
    }
}

export = Logging;
