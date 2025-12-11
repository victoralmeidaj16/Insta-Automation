/**
 * Structured Logging Middleware
 * Logs all requests with detailed information
 */

const logger = {
    info: (message, meta = {}) => {
        console.log(JSON.stringify({
            level: 'INFO',
            timestamp: new Date().toISOString(),
            message,
            ...meta
        }));
    },

    warn: (message, meta = {}) => {
        console.warn(JSON.stringify({
            level: 'WARN',
            timestamp: new Date().toISOString(),
            message,
            ...meta
        }));
    },

    error: (message, error, meta = {}) => {
        console.error(JSON.stringify({
            level: 'ERROR',
            timestamp: new Date().toISOString(),
            message,
            error: {
                message: error?.message,
                stack: error?.stack,
                code: error?.code
            },
            ...meta
        }));
    }
};

function loggingMiddleware(req, res, next) {
    const startTime = Date.now();

    // Log request
    logger.info('Incoming request', {
        method: req.method,
        url: req.url,
        path: req.path,
        query: req.query,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        userId: req.userId // Set by auth middleware
    });

    // Capture original res.json
    const originalJson = res.json.bind(res);

    // Override res.json to log response
    res.json = function (body) {
        const duration = Date.now() - startTime;

        logger.info('Response sent', {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userId: req.userId
        });

        return originalJson(body);
    };

    // Handle response finish for non-JSON responses
    res.on('finish', () => {
        if (!res.headersSent) return;

        const duration = Date.now() - startTime;

        if (res.statusCode >= 400) {
            logger.warn('Request failed', {
                method: req.method,
                url: req.url,
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                userId: req.userId
            });
        }
    });

    next();
}

// Error logging middleware (use after routes)
function errorLoggingMiddleware(err, req, res, next) {
    logger.error('Request error', err, {
        method: req.method,
        url: req.url,
        userId: req.userId,
        body: req.body
    });

    next(err);
}

export { logger, loggingMiddleware, errorLoggingMiddleware };
