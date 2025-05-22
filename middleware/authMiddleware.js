const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded token:', decoded); // Debug log

    const userId = decoded.user.id;
    const userRole = decoded.user.role; // Get role from token

    // Convert userId to a MongoDB ObjectId
    const objectId = new mongoose.Types.ObjectId(userId);
    const user = await User.findById(objectId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Set user info in request
    req.user = {
      ...user.toObject(),
      role: userRole // Ensure role is set from token
    };
    req.userId = userId;

    console.log('Authenticated user:', {
      id: req.userId,
      role: req.user.role
    }); // Debug log

    next();
  } catch (error) {
    console.error('JWT Error:', error);
    res.status(400).json({ message: 'Invalid token.' });
  }
};

module.exports = authenticate;
