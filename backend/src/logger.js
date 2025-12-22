// ============================================================
// Production-Safe Logging Middleware
// ============================================================
// Logs requests and errors without exposing secrets
// ============================================================

/**
 * Sanitize data to remove secrets and sensitive information
 */
const sanitizeData = (data) => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveKeys = [
    'password',
    'password_hash',
    'token',
    'access_token',
    'refresh_token',
    'secret',
    'api_key',
    'authorization',
    'auth',
    'credentials'
  ];

  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  for (const key in sanitized) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }

  return sanitized;
};

/**
 * Log request (auth, wallet, calls only)
 */
const logRequest = (req, res, next) => {
  const startTime = Date.now();
  const path = req.path;
  
  // Only log specific routes
  const loggablePaths = [
    '/api/auth',
    '/api/wallet',
    '/api/calls',
    '/api/numbers',
    '/api/chat'
  ];

  const shouldLog = loggablePaths.some(logPath => path.startsWith(logPath));

  if (shouldLog) {
    const logData = {
      method: req.method,
      path: path,
      timestamp: new Date().toISOString(),
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent')?.substring(0, 100) || 'Unknown'
    };

    // Log sanitized request body (no secrets)
    if (req.body && Object.keys(req.body).length > 0) {
      logData.body = sanitizeData(req.body);
    }

    // Log in production-safe format
    console.log(JSON.stringify({
      type: 'request',
      ...logData
    }));
  }

  // Track response time
  res.on('finish', () => {
    if (shouldLog) {
      const duration = Date.now() - startTime;
      console.log(JSON.stringify({
        type: 'response',
        method: req.method,
        path: path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }));
    }
  });

  next();
};

/**
 * Log errors safely (no secrets)
 */
const logError = (error, context = {}) => {
  const errorLog = {
    type: 'error',
    message: error?.message || 'Unknown error',
    name: error?.name || 'Error',
    timestamp: new Date().toISOString(),
    ...sanitizeData(context)
  };

  // Include stack trace in development only
  if (process.env.NODE_ENV !== 'production') {
    errorLog.stack = error?.stack?.substring(0, 500);
  }

  // Log as JSON for easy parsing
  console.error(JSON.stringify(errorLog));
};

module.exports = {
  logRequest,
  logError,
  sanitizeData
};

