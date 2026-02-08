const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((val) => val.message);
    return res.status(400).json({
      error: "Validation Error",
      details: messages,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue);
    return res.status(400).json({
      error: "Duplicate Entry",
      details: `${field} already exists`,
    });
  }

  // Mongoose cast error
  if (err.name === "CastError") {
    return res.status(400).json({
      error: "Invalid ID format",
    });
  }

  // Default error
  res.status(err.statusCode || 500).json({
    error: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorHandler;
