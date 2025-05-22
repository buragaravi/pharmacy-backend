const express = require('express');
const router = express.Router();
const chemicalController = require('../controllers/ChemicalController');
const authenticate = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');
const { body } = require('express-validator');

// ============ VALIDATORS ============

// For adding single or multiple chemicals
const validateChemicalEntry = [
  body('chemicals').isArray({ min: 1 }).withMessage('Chemicals array is required'),
  body('chemicals.*.chemicalName').notEmpty().withMessage('Chemical name is required'),
  body('chemicals.*.quantity').isNumeric().withMessage('Quantity must be numeric'),
  body('chemicals.*.unit').notEmpty().withMessage('Unit is required'),
  body('chemicals.*.expiryDate').isISO8601().withMessage('Valid expiry date is required'),
  body('chemicals.*.vendor').notEmpty().withMessage('Vendor is required'),
  body('chemicals.*.pricePerUnit').isNumeric().withMessage('Price per unit must be numeric'),
  body('chemicals.*.department').notEmpty().withMessage('Department is required'),
];

// For allocating one or more chemicals to labs
const validateAllocationBatch = [
  body('labId').notEmpty().withMessage('Lab ID is required'),
  body('allocations').isArray({ min: 1 }).withMessage('Allocations array is required'),
  body('allocations.*.chemicalMasterId').notEmpty().withMessage('chemicalMasterId is required'),
  body('allocations.*.quantity').isNumeric().withMessage('Quantity must be numeric'),
];

// ============ ROUTES ============

// 🔐 All routes require authentication
router.use(authenticate);

// =====================
// 📦 Add Chemicals to Master
// =====================
router.post(
  '/add',
  authorizeRole(['admin', 'central_lab_admin']),
  validateChemicalEntry,
  chemicalController.addChemicalsToCentral
);

// =====================
// 📤 Allocate Chemicals to Labs
// =====================
router.post(
  '/allocate',
  authorizeRole(['central_lab_admin']),
  validateAllocationBatch,
  chemicalController.allocateChemicalsToLab
);

// =====================
// 📃 Master Inventory
// =====================
router.get(
  '/master',
  authorizeRole(['admin', 'central_lab_admin']),
  chemicalController.getCentralMasterChemicals 
);

router.get(
  '/master/:labId',
  authorizeRole(['admin', 'central_lab_admin', 'lab_assistant']),
  chemicalController.getLabMasterChemicals
);

// =====================
// 📊 Live Stock by Lab
// =====================
router.get(
  '/live/:labId',
  authorizeRole(['admin', 'central_lab_admin', 'lab_assistant']),
  chemicalController.getLiveStockByLab
);

router.get(
  '/central/available',
  authenticate,
  chemicalController.getCentralLiveSimplified
);

// =====================
// 📊 Distribution
// =====================
router.get(
  '/distribution',
  authorizeRole(['admin', 'central_lab_admin', 'lab_assistant']),
  chemicalController.getChemicalDistribution
);

module.exports = router;
