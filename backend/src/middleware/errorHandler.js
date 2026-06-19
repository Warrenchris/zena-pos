module.exports = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors?.map(e => e.message) || err.message
    });
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred'
      : err.message
  });
};
