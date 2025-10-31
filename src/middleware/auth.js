const jwt = require('jsonwebtoken');
const { getRedisClient } = require('../config/redis');
const { ResponseUtil, ERROR_CODES } = require('../utils/response');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json(ResponseUtil.unauthorized('Access token required', ERROR_CODES.UNAUTHORIZED));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');

    // Check if token exists in Redis
    const redisClient = getRedisClient();
    const storedToken = await redisClient.get(`token:${decoded.userId}`);

    if (!storedToken || storedToken !== token) {
      return res.status(401).json(ResponseUtil.unauthorized('Invalid or expired token', ERROR_CODES.TOKEN_INVALID));
    }

    // Check token expiration
    if (decoded.exp * 1000 < Date.now()) {
      return res.status(401).json(ResponseUtil.unauthorized('Token expired', ERROR_CODES.TOKEN_EXPIRED));
    }

    // Add user info to request
    req.user = {
      userId: decoded.userId,
      exp: decoded.exp
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json(ResponseUtil.unauthorized('Invalid token', ERROR_CODES.TOKEN_INVALID));
    }
    return res.status(500).json(ResponseUtil.serverError('Authentication error'));
  }
};

// Middleware for optional authentication (for endpoints that don't require token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return next();
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');

    // Check if token exists in Redis
    const redisClient = getRedisClient();
    const storedToken = await redisClient.get(`token:${decoded.userId}`);

    if (!storedToken || storedToken !== token) {
      return next(); // Continue without user info if token is invalid
    }

    // Check token expiration
    if (decoded.exp * 1000 < Date.now()) {
      return next(); // Continue without user info if token is expired
    }

    // Add user info to request
    req.user = {
      userId: decoded.userId,
      exp: decoded.exp
    };
  } catch (error) {
    // Ignore errors for optional auth
  }

  next();
};

module.exports = { authenticateToken, optionalAuth };