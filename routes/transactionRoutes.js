const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/TransactionController');
const authenticate = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// Route to get all transactions (accessible by central lab admins)
router.get('/all', authenticate,  transactionController.getAllTransactions);

// Route to get transactions by lab ID (accessible by lab assistants)
router.get('/lab/:labId', authenticate, transactionController.getLabTransactions);

// Route to create a new transaction (allocation, restock, etc.)
router.post('/create', authenticate, transactionController.createTransaction);

module.exports = router;
