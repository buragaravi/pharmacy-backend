const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transferController');
const authenticate = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.post('/initiate', authenticate, authorizeRoles('lab_assistant'), transferController.createTransfer);
router.get('/history', authenticate, authorizeRoles('central_lab_admin', 'lab_assistant'), transferController.getTransferHistory);
router.post('/approve', authenticate, authorizeRoles('central_lab_admin'), transferController.approveTransfer);

module.exports = router;
