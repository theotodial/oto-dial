/**
 * Standardized Error Handler for OTO-DIAL Backend
 * 
 * Provides consistent error responses and prevents information leakage
 * All errors return: { success: false, error: string }
 * All successes return: { success: true, data: ... } or { success: true, ...data }
 */

const { logError } = require('./logger');

// Error types
const ErrorTypes = {
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  SERVER: 'server'
};

// HTTP Status codes
const StatusCodes = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500
};

/**
 * Map Supabase/Postgres error codes to user-friendly messages
 */
const mapDatabaseError = (error) => {
  if (!error) return null;

  // Postgres error codes
  const errorCode = error.code || error.error_code;

  switch (errorCode) {
    // Unique violation
    case '23505':
      return {
        type: ErrorTypes.CONFLICT,
        message: 'This record already exists',
        status: StatusCodes.CONFLICT
      };

    // Foreign key violation
    case '23503':
      return {
        type: ErrorTypes.VALIDATION,
        message: 'Invalid reference to related record',
        status: StatusCodes.BAD_REQUEST
      };

    // Not null violation
    case '23502':
      return {
        type: ErrorTypes.VALIDATION,
        message: 'Required field is missing',
        status: StatusCodes.BAD_REQUEST
      };

    // Check constraint violation
    case '23514':
      return {
        type: ErrorTypes.VALIDATION,
        message: 'Invalid data format or value',
        status: StatusCodes.BAD_REQUEST
      };

    // Supabase auth errors
    case 'PGRST116':
      return {
        type: ErrorTypes.NOT_FOUND,
        message: 'Record not found',
        status: StatusCodes.NOT_FOUND
      };

    default:
      // Don't leak internal error details
      return {
        type: ErrorTypes.SERVER,
        message: 'An error occurred while processing your request',
        status: StatusCodes.INTERNAL_SERVER_ERROR
      };
  }
};

/**
 * Map authentication errors to user-friendly messages
 */
const mapAuthError = (error) => {
  if (!error) return null;

  const errorMessage = error.message?.toLowerCase() || '';

  if (errorMessage.includes('invalid') || errorMessage.includes('credentials')) {
    return {
      type: ErrorTypes.AUTHENTICATION,
      message: 'Invalid email or password',
      status: StatusCodes.UNAUTHORIZED
    };
  }

  if (errorMessage.includes('user not found') || errorMessage.includes('not found')) {
    return {
      type: ErrorTypes.AUTHENTICATION,
      message: 'Invalid email or password',
      status: StatusCodes.UNAUTHORIZED
    };
  }

  if (errorMessage.includes('email already') || errorMessage.includes('already exists')) {
    return {
      type: ErrorTypes.CONFLICT,
      message: 'An account with this email already exists',
      status: StatusCodes.CONFLICT
    };
  }

  if (errorMessage.includes('weak password') || errorMessage.includes('password')) {
    return {
      type: ErrorTypes.VALIDATION,
      message: 'Password does not meet requirements',
      status: StatusCodes.BAD_REQUEST
    };
  }

  if (errorMessage.includes('token') || errorMessage.includes('session')) {
    return {
      type: ErrorTypes.AUTHENTICATION,
      message: 'Session expired. Please login again',
      status: StatusCodes.UNAUTHORIZED
    };
  }

  // Generic auth error
  return {
    type: ErrorTypes.AUTHENTICATION,
    message: 'Authentication failed',
    status: StatusCodes.UNAUTHORIZED
  };
};

/**
 * Create a standardized error response
 */
const createErrorResponse = (error, customMessage = null) => {
  // If it's already a mapped error
  if (error && error.type && error.message && error.status) {
    return {
      response: { success: false, error: customMessage || error.message },
      status: error.status
    };
  }

  // Try to map database error
  const dbError = mapDatabaseError(error);
  if (dbError) {
    return {
      response: { success: false, error: customMessage || dbError.message },
      status: dbError.status
    };
  }

  // Try to map auth error
  const authError = mapAuthError(error);
  if (authError) {
    return {
      response: { success: false, error: customMessage || authError.message },
      status: authError.status
    };
  }

  // Generic server error (don't leak details)
  return {
    response: { success: false, error: customMessage || 'An unexpected error occurred' },
    status: StatusCodes.INTERNAL_SERVER_ERROR
  };
};

/**
 * Create a standardized success response
 */
const createSuccessResponse = (data) => {
  if (typeof data === 'object' && data !== null) {
    return { success: true, ...data };
  }
  return { success: true, data };
};

/**
 * Validation error helper
 */
const validationError = (message) => {
  return {
    type: ErrorTypes.VALIDATION,
    message,
    status: StatusCodes.BAD_REQUEST
  };
};

/**
 * Authentication error helper
 */
const authenticationError = (message = 'Authentication required') => {
  return {
    type: ErrorTypes.AUTHENTICATION,
    message,
    status: StatusCodes.UNAUTHORIZED
  };
};

/**
 * Authorization error helper
 */
const authorizationError = (message = 'You do not have permission to perform this action') => {
  return {
    type: ErrorTypes.AUTHORIZATION,
    message,
    status: StatusCodes.FORBIDDEN
  };
};

/**
 * Not found error helper
 */
const notFoundError = (resource = 'Resource') => {
  return {
    type: ErrorTypes.NOT_FOUND,
    message: `${resource} not found`,
    status: StatusCodes.NOT_FOUND
  };
};

/**
 * Server error helper
 */
const serverError = (message = 'An unexpected error occurred') => {
  return {
    type: ErrorTypes.SERVER,
    message,
    status: StatusCodes.INTERNAL_SERVER_ERROR
  };
};

/**
 * Global error handling middleware
 */
const errorMiddleware = (err, req, res, next) => {
  // Log error safely (no secrets)
  logError(err, {
    path: req.path,
    method: req.method,
    statusCode: res.statusCode
  });

  const { response, status } = createErrorResponse(err);
  res.status(status).json(response);
};

/**
 * Async handler wrapper to catch errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  ErrorTypes,
  StatusCodes,
  mapDatabaseError,
  mapAuthError,
  createErrorResponse,
  createSuccessResponse,
  validationError,
  authenticationError,
  authorizationError,
  notFoundError,
  serverError,
  errorMiddleware,
  asyncHandler
};

