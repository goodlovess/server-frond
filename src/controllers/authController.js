const jwt = require('jsonwebtoken');
const { getRedisClient } = require('../config/redis');
const { ResponseUtil, ERROR_CODES } = require('../utils/response');

const getAccess = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json(ResponseUtil.error('User ID is required', ERROR_CODES.GENERAL_ERROR));
    }

    // Mock user validation (in a real implementation, this would query PostgreSQL)
    // For demo purposes, we'll accept any non-empty userId as valid
    // In a real application, you would query your PostgreSQL database here:
    /*
    const userQuery = 'SELECT id, username, expires_at FROM users WHERE id = $1 AND active = true';
    const result = await query(userQuery, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json(ResponseUtil.error('User not found or inactive', ERROR_CODES.INVALID_USER));
    }

    const user = result.rows[0];

    // Check if user account is expired
    if (new Date(user.expires_at) < new Date()) {
      return res.status(403).json(ResponseUtil.error('User account expired', ERROR_CODES.INVALID_USER));
    }
    */

    // For demo purposes, we'll mock a valid user
    const user = {
      id: userId,
      username: `user_${userId}`,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    };

    // Generate token
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'secret_key');

    // Store token in Redis with expiration time
    const redisClient = getRedisClient();
    const redisExpiration = 24 * 60 * 60; // 24 hours in seconds
    await redisClient.setEx(`token:${userId}`, redisExpiration, token);

    res.json(ResponseUtil.success({ token }, 'Token generated successfully'));
  } catch (error) {
    console.error('Get access error:', error);
    res.status(500).json(ResponseUtil.serverError('Failed to generate token'));
  }
};

module.exports = { getAccess };