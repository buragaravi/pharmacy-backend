const express = require('express');
const router = express.Router();
const quotationController = require('../controllers/quotationController');
const authenticate = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');
const { check } = require('express-validator');

// LAB ASSISTANT ROUTES
router.post(
  '/lab',
  authenticate,
  authorizeRole('lab_assistant'),
  [
    check('labId', 'Lab ID is required').not().isEmpty(),
    check('chemicals', 'At least one chemical is required').isArray({ min: 1 }),
    check('chemicals.*.chemicalName', 'Chemical name is required').not().isEmpty(),
    check('chemicals.*.quantity', 'Valid quantity is required').isNumeric().toFloat(),
    check('chemicals.*.unit', 'Unit is required').not().isEmpty()
  ],
  quotationController.createLabQuotation
);

router.get(
  '/lab',
  authenticate,
  authorizeRole('lab_assistant'),
  quotationController.getLabAssistantQuotations
);

// CENTRAL LAB ADMIN ROUTES
router.post(
  '/central/draft',
  authenticate,
  authorizeRole('central_lab_admin'),
  [
    check('vendorName', 'Vendor name is required').not().isEmpty(),
    check('chemicals', 'At least one chemical is required').isArray({ min: 1 }),
    check('chemicals.*.chemicalName', 'Chemical name is required').not().isEmpty(),
    check('chemicals.*.quantity', 'Valid quantity is required').isNumeric().toFloat(),
    check('chemicals.*.unit', 'Unit is required').not().isEmpty(),
    check('chemicals.*.pricePerUnit', 'Price per unit is required').isNumeric().toFloat(),
    check('totalPrice', 'Total price is required').isNumeric().toFloat()
  ],
  quotationController.createDraftQuotation
);

router.post(
  '/central/draft/add-chemical',
  authenticate,
  authorizeRole('central_lab_admin'),
  [
    check('quotationId', 'Quotation ID is required').not().isEmpty(),
    check('chemicalName', 'Chemical name is required').not().isEmpty(),
    check('quantity', 'Valid quantity is required').isNumeric().toFloat(),
    check('unit', 'Unit is required').not().isEmpty(),
    check('pricePerUnit', 'Price per unit is required').isNumeric().toFloat()
  ],
  quotationController.addChemicalToDraft
);

router.patch(
  '/central/draft/submit',
  authenticate,
  authorizeRole('central_lab_admin'),
  [
    check('quotationId', 'Quotation ID is required').not().isEmpty()
  ],
  quotationController.submitDraftToPending
);

// Add proper validation for allocateLabQuotation route
router.patch(
  '/central/allocate',
  authenticate,
  authorizeRole('central_lab_admin'),
  [
    check('quotationId', 'Quotation ID is required').not().isEmpty(),
    check('status', 'Valid status is required').isIn(['allocated', 'partially_fulfilled', 'rejected']),
  ],
  quotationController.allocateLabQuotation
);

router.get(
  '/central',
  authenticate,
  authorizeRole('central_lab_admin'),
  quotationController.getCentralAdminQuotations
);

// ADMIN ROUTES
router.patch(
  '/admin/process',
  authenticate,
  authorizeRole('admin'),
  [
    check('status', 'Valid status is required').isIn(['approved', 'rejected', 'purchasing', 'purchased']),
    check('comments', 'Comments are required').optional().isString()
  ],
  quotationController.processCentralQuotation
);

router.get(
  '/admin',
  authenticate,
  authorizeRole('admin'),
  quotationController.getAdminQuotations
);

// COMMON ROUTES
router.get(
  '/:id',
  authenticate,
  authorizeRole(['lab_assistant', 'central_lab_admin', 'admin']),
  quotationController.getQuotationDetails
);

router.post('/:quotationId/comments', authenticate, quotationController.addQuotationComment);

module.exports = router;

router.patch('/:quotationId/chemicals/remarks',  quotationController.addChemicalRemarks);
router.patch('/:quotationId/chemicals',  quotationController.updateQuotationChemicals);
router.patch('/:quotationId/chemicals/batch-remarks', quotationController.updateAllChemicalRemarks);