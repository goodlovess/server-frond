// Standard response format utility
class ResponseUtil {
  static success(data = {}, msg = 'Success', code = 0) {
    return {
      code,
      data,
      msg
    };
  }

  static error(msg = 'Error', code = 1, data = {}) {
    return {
      code,
      data,
      msg
    };
  }

  static unauthorized(msg = 'Unauthorized', code = 401) {
    return {
      code,
      data: {},
      msg
    };
  }

  static notFound(msg = 'Not Found', code = 404) {
      return {
      code,
      data: {},
      msg
    };
  }

  static serverError(msg = 'Internal Server Error', code = 500) {
    return {
      code,
      data: {},
      msg
    };
  }
}

// Error code definitions
const ERROR_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
  INVALID_USER: 1001,
  TOKEN_EXPIRED: 1002,
  TOKEN_INVALID: 1003,
  DATABASE_ERROR: 2001,
  REDIS_ERROR: 2002
};

module.exports = { ResponseUtil, ERROR_CODES };