const express = require('express');
const router = express.Router();
const experimentController = require('../controllers/experimentController');
const authenticate = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

// Get all experiments
router.get('/', experimentController.getExperiments);

// Get experiment by ID
router.get('/:id', experimentController.getExperimentById);

// Create new experiment (admin only)
router.post('/', authenticate, authorizeRole(['admin', 'central_lab_admin']), experimentController.createExperiment);

// Update experiment (admin only)
router.put('/:id', authenticate, authorizeRole(['admin', 'central_lab_admin']), experimentController.updateExperiment);

// Delete experiment (admin only)
router.delete('/:id', authenticate, authorizeRole(['admin', 'central_lab_admin']), experimentController.deleteExperiment);

module.exports = router; 