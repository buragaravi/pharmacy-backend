// Success response
exports.handleSuccessResponse = (res, statusCode, message, data) => {
    res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  };
  
  // Error response
  exports.handleErrorResponse = (res, error, statusCode = 500) => {
    const message = error.message || 'Something went wrong';
    res.status(statusCode).json({
      success: false,
      message,
    });
  };
  