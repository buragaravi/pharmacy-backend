const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authenticate = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware')
const { check } = require('express-validator');

// @route   GET /api/analytics/system-overview
// @desc    Get system-wide analytics (Admin only)
// @access  Private/Admin
router.get(
  '/system-overview',
  authenticate,
  authorizeRole(['admin']),
  analyticsController.getSystemOverview
);

// @route   GET /api/analytics/chemicals
// @desc    Get chemical analytics with filters
// @access  Private (role-based access)
router.get(
  '/chemicals',
  authenticate,
  [
    check('chemicalId').optional().isMongoId(),
    check('timeRange').optional().isIn([
      'today', 'thisWeek', 'thisMonth', 'thisYear', 
      'last30Days', 'last90Days'
    ])
  ],
  analyticsController.getChemicalAnalytics
);

// @route   GET /api/analytics/labs
// @desc    Get lab-specific analytics
// @access  Private (Lab Assistant, Central Admin, Admin)
router.get(
  '/labs',
  authenticate,
  authorizeRole(['admin', 'central_lab_admin', 'lab_assistant']),
  [
    check('labId').optional().isString(),
    check('timeRange').optional().isIn([
      'today', 'thisWeek', 'thisMonth', 'thisYear', 
      'last30Days', 'last90Days'
    ])
  ],
  analyticsController.getLabAnalytics
);

// @route   GET /api/analytics/faculty
// @desc    Get faculty-specific analytics
// @access  Private (Faculty, Admin)
router.get(
  '/faculty',
  authenticate,
  authorizeRole(['admin', 'faculty']),
  [
    check('facultyId').optional().isMongoId(),
    check('timeRange').optional().isIn([
      'today', 'thisWeek', 'thisMonth', 'thisYear', 
      'last30Days', 'last90Days'
    ])
  ],
  analyticsController.getFacultyAnalytics
);

// @route   GET /api/analytics/predictive
// @desc    Get predictive analytics and forecasts
// @access  Private (Admin, Central Lab Admin)
router.get(
  '/predictive',
  authenticate,
  authorizeRole(['admin', 'central_lab_admin']),
  [
    check('months').optional().isInt({ min: 1, max: 12 })
  ],
  analyticsController.getPredictiveAnalytics
);

module.exports = router;