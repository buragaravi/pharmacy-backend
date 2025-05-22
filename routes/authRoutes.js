const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticate = require('../middleware/authMiddleware');


router.post('/register', authController.register);
router.post('/login', authController.login);

// Get current user
router.get('/me', authenticate, authController.getCurrentUser);

module.exports = router;
