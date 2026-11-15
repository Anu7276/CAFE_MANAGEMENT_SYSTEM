const { Sentry } = require('../config/sentry');

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  const isProd = process.env.NODE_ENV === 'production';

  // Report 5xx server exceptions to Sentry
  if (statusCode >= 500 && process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }

  const response = {
    success: false,
    message: isProd && statusCode === 500 ? 'Internal Server Error' : (err.message || 'An unexpected error occurred')
  };

  // Expose error stacks only in development and test environments
  if (!isProd && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = { errorHandler };

