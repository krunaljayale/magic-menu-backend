const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // Get the token from the Authorization header
  const token = req.header('Authorization')?.replace('Bearer ', '');
  

  if (!token) {
    return res.status(401).json({
      status: 'Error',
      message: 'Access denied. No token provided.',
    });
  }

  try {
    // Verify the token using the JWT_SECRET (ensure JWT_SECRET is stored in your environment variables)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the decoded user data to the request object (i.e., user id)
    req.user = decoded;

    // Call the next middleware function
    next();
  } catch (error) {
    return res.status(400).json({
      status: 'Error',
      message: 'Invalid token. Please login again.',
    });
  }
};

module.exports = authMiddleware;
