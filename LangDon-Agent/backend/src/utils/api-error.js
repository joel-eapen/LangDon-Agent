class ApiError extends Error {
  constructor(statusCode, message = 'Something went wrong', errors = [], code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.success = false;
    this.errors = Array.isArray(errors) ? errors : [errors];

    Error.captureStackTrace(this, ApiError);
  }

  toJSON() {
    return {
      success: this.success,
      error: {
        code: this.code,
        message: this.message,
        ...(this.errors.length ? { details: this.errors } : {}),
      },
    };
  }
}


export default ApiError;
