import logger from '../utils/logger.js';

// Not found handler
export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  next(error);
};

// Global error handler
export const errorHandler = (err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Sequelize/Postgres error details (when present)
  const dbError = err?.original || err?.parent;

  // Log error details
  logger.error({
    name: err?.name,
    message: err.message,
    stack: err.stack,
    ...(dbError
      ? {
          dbMessage: dbError?.message,
          dbCode: dbError?.code,
          dbDetail: dbError?.detail,
          dbHint: dbError?.hint,
          sql: err?.sql
        }
      : {}),
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    statusCode
  });

  // Don't expose internal errors in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(statusCode).json({
    error: {
      message: isProduction && statusCode === 500 ? 'Internal Server Error' : message,
      status: statusCode,
      ...(isProduction
        ? {}
        : {
            stack: err.stack,
            details: err.details,
            ...(dbError
              ? {
                  dbMessage: dbError?.message,
                  dbCode: dbError?.code,
                  dbDetail: dbError?.detail,
                  dbHint: dbError?.hint
                }
              : {})
          })
    }
  });
};

// Async handler wrapper to catch async errors
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validation error formatter
export const formatValidationErrors = (errors) => {
  return errors.array().map(err => ({
    field: err.path,
    message: err.msg,
    value: err.value
  }));
};
