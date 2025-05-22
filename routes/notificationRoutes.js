// Routes: Notifications 
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authenticate = require('../middleware/authMiddleware');
const { check } = require('express-validator'); // Validation middleware

// Create a new notification (requires admin role or special permission)
router.post(
  '/',
  authenticate, 
  [check('userId', 'User ID is required').not().isEmpty(), check('message', 'Message is required').not().isEmpty()],
  notificationController.createNotification
);

// Mark notification as read
router.post('/mark-read/:notificationId', authenticate, notificationController.markAsRead);

// Get notifications for the authenticated user with pagination
router.get('/user', authenticate, notificationController.getUserNotifications);

module.exports = router;
