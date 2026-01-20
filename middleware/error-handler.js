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

  // Log error details
  logger.error({
    message: err.message,
    stack: err.stack,
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
      ...(isProduction ? {} : { stack: err.stack, details: err.details })
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
