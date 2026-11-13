class ApiResponse {
  constructor(statusCode, data = null, message = 'Success') {
    this.statusCode = statusCode;
    this.success = statusCode >= 200 && statusCode < 400;
    this.message = message;
    this.data = data;
  }

  toJSON() {
    return {
      success: this.success,
      message: this.message,
      data: this.data,
    };
  }
}


export default ApiResponse;
