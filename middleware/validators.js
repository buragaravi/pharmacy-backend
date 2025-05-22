const { body, param, query, validationResult } = require('express-validator');
const { isValidObjectId } = require('mongoose');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Chemical request validation
const validateChemicalRequest = [
  body('labId').isString().notEmpty(),
  body('experiments').isArray().notEmpty(),
  body('experiments.*.experimentName').isString().notEmpty(),
  body('experiments.*.date').isISO8601(),
  body('experiments.*.session').isString().notEmpty(),
  body('experiments.*.chemicals').isArray().notEmpty(),
  body('experiments.*.chemicals.*.chemicalName').isString().notEmpty(),
  body('experiments.*.chemicals.*.quantity').isFloat({ min: 0 }),
  body('experiments.*.chemicals.*.unit').isString().notEmpty(),
  validate
];

// Chemical allocation validation
const validateChemicalAllocation = [
  body('labId').isString().notEmpty(),
  body('allocations').isArray().notEmpty(),
  body('allocations.*.chemicalName').isString().notEmpty(),
  body('allocations.*.quantity').isFloat({ min: 0 }),
  validate
];

// Quotation validation
const validateQuotation = [
  body('chemicals').isArray().notEmpty(),
  body('chemicals.*.chemicalName').isString().notEmpty(),
  body('chemicals.*.quantity').isFloat({ min: 0 }),
  body('chemicals.*.unit').isString().notEmpty(),
  body('chemicals.*.pricePerUnit').isFloat({ min: 0 }),
  validate
];

// ID parameter validation
const validateId = [
  param('id').custom(value => {
    if (!isValidObjectId(value)) {
      throw new Error('Invalid ID format');
    }
    return true;
  }),
  validate
];

// Query parameter validation
const validateQueryParams = [
  query('timeRange').optional().isIn(['last7Days', 'last30Days', 'last90Days', 'thisYear']),
  query('labId').optional().isString(),
  query('chemicalId').optional().custom(value => {
    if (!isValidObjectId(value)) {
      throw new Error('Invalid chemical ID format');
    }
    return true;
  }),
  validate
];

// User management validation
const validateUserUpdate = [
  body('name').optional().isString().trim().notEmpty(),
  body('email').optional().isEmail(),
  body('role').optional().isIn(['faculty', 'lab_assistant', 'central_lab_admin', 'admin']),
  body('labId').optional().isString(),
  validate
];

// Password reset validation
const validatePasswordReset = [
  body('currentPassword').isString().notEmpty(),
  body('newPassword')
    .isString()
    .isLength({ min: 8 })
    .matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/)
    .withMessage('Password must be at least 8 characters long and contain letters, numbers, and special characters'),
  validate
];

module.exports = {
  validateChemicalRequest,
  validateChemicalAllocation,
  validateQuotation,
  validateId,
  validateQueryParams,
  validateUserUpdate,
  validatePasswordReset
}; 