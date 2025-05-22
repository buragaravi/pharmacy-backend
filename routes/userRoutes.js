const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authenticate = require("../middleware/authMiddleware");
const authorizeRole = require('../middleware/roleMiddleware');

// All routes are protected and require admin role
router.use(authenticate);

// Get all users
router.get('/', userController.getAllUsers);

// Get user by ID
router.get('/:id', userController.getUserById);

// Update user
router.put('/:id', userController.updateUser);

// Reset user password
router.post('/:id/reset-password', userController.resetPassword);

// Delete user
router.delete('/:id', userController.deleteUser);

module.exports = router; 