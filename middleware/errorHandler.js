// Middleware: Error Handling 
// Global error handling middleware
const errorHandler = (err, req, res, next) => {
    // Log error details for debugging (this can be customized)
    console.error(err.stack);
  
    // If it's a validation error (e.g., from mongoose), we return the error details
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
  
    // Handle specific error codes (e.g., 404, 500)
    if (err.name === 'CastError' || err.name === 'MongoError') {
      return res.status(400).json({ message: 'Invalid data format or request.' });
    }
  
    // Default to internal server error (500)
    res.status(500).json({
      message: 'Something went wrong, please try again later.',
      error: err.message,
    });
  };
  
  module.exports = errorHandler;
  