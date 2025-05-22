const asyncHandler = require('express-async-handler');
const ChemicalMaster = require('../models/ChemicalMaster');
const ChemicalLive = require('../models/ChemicalLive');
const Transaction = require('../models/Transaction');
const Request = require('../models/Request');
const Quotation = require('../models/Quotation');
const { DateTime } = require('luxon');

// Helper: Get time ranges for analytics
const getTimeRanges = () => {
  const now = DateTime.now();
  return {
    today: now.startOf('day').toJSDate(),
    thisWeek: now.startOf('week').toJSDate(),
    thisMonth: now.startOf('month').toJSDate(),
    thisYear: now.startOf('year').toJSDate(),
    last30Days: now.minus({ days: 30 }).toJSDate(),
    last90Days: now.minus({ days: 90 }).toJSDate()
  };
};

// Helper: Apply role-based filters
const applyRoleFilters = (user, baseQuery = {}) => {
  switch(user.role) {
    case 'admin':
      return baseQuery; // No filters for admin
    case 'central_lab_admin':
      return { ...baseQuery, labId: 'central-lab' };
    case 'lab_assistant':
      return { ...baseQuery, labId: user.labId };
    case 'faculty':
      return { ...baseQuery, facultyId: user._id };
    default:
      throw new Error('Unauthorized access');
  }
};

// @desc    Get system overview analytics (Admin only)
// @route   GET /api/analytics/system-overview
// @access  Admin
exports.getSystemOverview = asyncHandler(async (req, res) => {
  if(req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const timeRanges = getTimeRanges();
  
  const [
    totalChemicals,
    totalLabs,
    activeRequests,
    pendingQuotations,
    recentTransactions,
    chemicalDistribution
  ] = await Promise.all([
    ChemicalMaster.countDocuments(),
    ChemicalLive.distinct('labId').then(labs => labs.filter(l => l !== 'central-lab').length),
    Request.countDocuments({ status: { $in: ['pending', 'partially_fulfilled'] } }),
    Quotation.countDocuments({ status: 'pending' }),
    Transaction.countDocuments({ createdAt: { $gte: timeRanges.last30Days } }),
    ChemicalLive.aggregate([
      { $group: { 
        _id: '$labId', 
        totalChemicals: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' }
      }},
      { $sort: { totalQuantity: -1 } }
    ])
  ]);

  res.json({
    metrics: {
      totalChemicals,
      totalLabs,
      activeRequests,
      pendingQuotations,
      recentTransactions
    },
    chemicalDistribution,
    timeRanges: {
      last30Days: timeRanges.last30Days,
      currentYear: timeRanges.thisYear
    }
  });
});

// @desc    Get chemical analytics
// @route   GET /api/analytics/chemicals
// @access  All (role-based filtering)
exports.getChemicalAnalytics = asyncHandler(async (req, res) => {
  const timeRanges = getTimeRanges();
  const { chemicalId, timeRange = 'last30Days' } = req.query;
  
  // Base query with role filters
  const baseQuery = applyRoleFilters(req.user);
  let chemicalFilter = {};
  
  if(chemicalId) {
    chemicalFilter = { chemicalMasterId: chemicalId };
  }

  const [
    stockLevels,
    consumptionRate,
    transactionHistory,
    expiryData
  ] = await Promise.all([
    // Current stock levels
    ChemicalLive.aggregate([
      { $match: { ...baseQuery, ...chemicalFilter } },
      { $group: {
        _id: '$chemicalName',
        totalQuantity: { $sum: '$quantity' },
        labs: { $push: { labId: '$labId', quantity: '$quantity' } }
      }},
      { $sort: { totalQuantity: -1 } },
      { $limit: 20 }
    ]),
    
    // Consumption rate (transactions out)
    Transaction.aggregate([
      { $match: { 
        ...baseQuery,
        ...chemicalFilter,
        transactionType: { $in: ['issue', 'transfer', 'allocation'] },
        createdAt: { $gte: timeRanges[timeRange] } 
      }},
      { $group: {
        _id: '$chemicalName',
        totalConsumed: { $sum: '$quantity' },
        transactions: { $push: {
          date: '$createdAt',
          quantity: '$quantity',
          type: '$transactionType',
          fromLab: '$fromLabId',
          toLab: '$toLabId'
        }}
      }},
      { $sort: { totalConsumed: -1 } }
    ]),
    
    // Transaction history
    Transaction.find({
      ...baseQuery,
      ...chemicalFilter,
      createdAt: { $gte: timeRanges[timeRange] }
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('createdBy', 'name role'),
    
    // Expiry data
    ChemicalLive.aggregate([
      { $match: { 
        ...baseQuery,
        ...chemicalFilter,
        expiryDate: { $gte: new Date() } 
      }},
      { $project: {
        chemicalName: 1,
        labId: 1,
        quantity: 1,
        expiryDate: 1,
        daysToExpiry: {
          $divide: [
            { $subtract: ['$expiryDate', new Date()] },
            1000 * 60 * 60 * 24 // Convert ms to days
          ]
        }
      }},
      { $sort: { daysToExpiry: 1 } },
      { $limit: 50 }
    ])
  ]);

  res.json({
    stockLevels,
    consumptionRate,
    transactionHistory,
    expiryData,
    timeRange: {
      start: timeRanges[timeRange],
      end: new Date()
    }
  });
});

// @desc    Get lab-specific analytics
// @route   GET /api/analytics/labs
// @access  Lab Assistant, Central Admin, Admin
exports.getLabAnalytics = asyncHandler(async (req, res) => {
  if(req.user.role === 'faculty') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const timeRanges = getTimeRanges();
  const { labId, timeRange = 'last30Days' } = req.query;
  
  // Apply role-based lab filter
  let labFilter = {};
  if(req.user.role === 'lab_assistant') {
    labFilter = { labId: req.user.labId };
  } else if(labId) {
    labFilter = { labId };
  }

  const [
    labInventory,
    requestStats,
    chemicalUsage,
    topChemicals
  ] = await Promise.all([
    // Lab inventory snapshot
    ChemicalLive.find({
      ...labFilter,
      quantity: { $gt: 0 }
    })
      .sort({ quantity: -1 })
      .limit(20),
    
    // Request statistics
    Request.aggregate([
      { $match: { 
        ...labFilter,
        createdAt: { $gte: timeRanges[timeRange] } 
      }},
      { $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgChemicals: { $avg: { $size: '$experiments.chemicals' } }
      }},
      { $project: {
        status: '$_id',
        count: 1,
        avgChemicals: { $round: ['$avgChemicals', 2] },
        _id: 0
      }}
    ]),
    
    // Chemical usage patterns
    Transaction.aggregate([
      { $match: {
        ...labFilter,
        $or: [
          { fromLabId: labFilter.labId || { $exists: true } },
          { toLabId: labFilter.labId || { $exists: true } }
        ],
        createdAt: { $gte: timeRanges.thisMonth }
      }},
      { $group: {
        _id: {
          chemical: '$chemicalName',
          dayOfWeek: { $dayOfWeek: '$createdAt' },
          hour: { $hour: '$createdAt' }
        },
        totalQuantity: { $sum: '$quantity' },
        transactionCount: { $sum: 1 }
      }},
      { $group: {
        _id: '$_id.chemical',
        usagePattern: {
          $push: {
            dayOfWeek: '$_id.dayOfWeek',
            hour: '$_id.hour',
            quantity: '$totalQuantity',
            count: '$transactionCount'
          }
        }
      }}
    ]),
    
    // Top chemicals by usage
    Transaction.aggregate([
      { $match: {
        ...labFilter,
        fromLabId: labFilter.labId || { $exists: true },
        transactionType: 'issue',
        createdAt: { $gte: timeRanges[timeRange] }
      }},
      { $group: {
        _id: '$chemicalName',
        totalUsed: { $sum: '$quantity' },
        transactionCount: { $sum: 1 }
      }},
      { $sort: { totalUsed: -1 } },
      { $limit: 10 }
    ])
  ]);

  res.json({
    labInventory,
    requestStats,
    chemicalUsage,
    topChemicals,
    timeRange: {
      start: timeRanges[timeRange],
      end: new Date()
    }
  });
});

// @desc    Get faculty-specific analytics
// @route   GET /api/analytics/faculty
// @access  Faculty, Admin
exports.getFacultyAnalytics = asyncHandler(async (req, res) => {
  if(req.user.role !== 'faculty' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const facultyId = req.query.facultyId || req.user._id;
  const timeRanges = getTimeRanges();
  const { timeRange = 'thisYear' } = req.query;

  const [
    requestStats,
    chemicalUsage,
    departmentComparison
  ] = await Promise.all([
    // Faculty request statistics
    Request.aggregate([
      { $match: { 
        facultyId,
        createdAt: { $gte: timeRanges[timeRange] } 
      }},
      { $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgChemicals: { $avg: { $size: '$experiments.chemicals' } }
      }}
    ]),
    
    // Chemical usage breakdown
    Request.aggregate([
      { $match: { facultyId } },
      { $unwind: '$experiments' },
      { $unwind: '$experiments.chemicals' },
      { $group: {
        _id: '$experiments.chemicals.chemicalName',
        totalRequested: { $sum: '$experiments.chemicals.quantity' },
        totalAllocated: { $sum: '$experiments.chemicals.allocatedQuantity' },
        experimentCount: { $sum: 1 }
      }},
      { $sort: { totalRequested: -1 } },
      { $limit: 15 }
    ]),
    
    // Department comparison (admin only)
    req.user.role === 'admin' ? Request.aggregate([
      { $lookup: {
        from: 'users',
        localField: 'facultyId',
        foreignField: '_id',
        as: 'faculty'
      }},
      { $unwind: '$faculty' },
      { $match: {
        'faculty.department': req.user.department,
        createdAt: { $gte: timeRanges.thisYear }
      }},
      { $group: {
        _id: '$facultyId',
        facultyName: { $first: '$faculty.name' },
        requestCount: { $sum: 1 },
        chemicalCount: { $sum: { $size: '$experiments.chemicals' } }
      }},
      { $sort: { chemicalCount: -1 } }
    ]) : Promise.resolve([])
  ]);

  res.json({
    requestStats,
    chemicalUsage,
    departmentComparison,
    timeRange: {
      start: timeRanges[timeRange],
      end: new Date()
    }
  });
});

// @desc    Get predictive analytics
// @route   GET /api/analytics/predictive
// @access  Admin, Central Lab Admin
exports.getPredictiveAnalytics = asyncHandler(async (req, res) => {
  if(!['admin', 'central_lab_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const timeRanges = getTimeRanges();
  const { months = 3 } = req.query;

  // Get consumption trends for forecasting
  const consumptionTrends = await Transaction.aggregate([
    {
      $match: {
        transactionType: { $in: ['issue', 'transfer'] },
        createdAt: { $gte: timeRanges.last90Days }
      }
    },
    {
      $group: {
        _id: {
          chemical: '$chemicalName',
          month: { $month: '$createdAt' },
          year: { $year: '$createdAt' }
        },
        totalConsumed: { $sum: '$quantity' },
        transactionCount: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.chemical',
        monthlyConsumption: {
          $push: {
            month: '$_id.month',
            year: '$_id.year',
            consumed: '$totalConsumed',
            transactions: '$transactionCount'
          }
        },
        avgConsumption: { $avg: '$totalConsumed' }
      }
    },
    {
      $project: {
        chemical: '$_id',
        monthlyConsumption: 1,
        avgConsumption: { $round: ['$avgConsumption', 2] },
        forecast: {
          $multiply: [
            '$avgConsumption',
            parseInt(months)
          ]
        },
        _id: 0
      }
    },
    { $sort: { forecast: -1 } },
    { $limit: 20 }
  ]);

  // Get upcoming expirations
  const upcomingExpirations = await ChemicalLive.aggregate([
    {
      $match: {
        expiryDate: {
          $gte: new Date(),
          $lte: DateTime.now().plus({ months: parseInt(months) }).toJSDate()
        }
      }
    },
    {
      $group: {
        _id: '$chemicalName',
        totalExpiring: { $sum: '$quantity' },
        earliestExpiry: { $min: '$expiryDate' },
        labs: { $addToSet: '$labId' }
      }
    },
    {
      $project: {
        chemical: '$_id',
        totalExpiring: 1,
        earliestExpiry: 1,
        labCount: { $size: '$labs' },
        daysUntilExpiry: {
          $divide: [
            { $subtract: ['$earliestExpiry', new Date()] },
            1000 * 60 * 60 * 24
          ]
        },
        _id: 0
      }
    },
    { $sort: { daysUntilExpiry: 1 } }
  ]);

  res.json({
    consumptionTrends,
    upcomingExpirations,
    forecastPeriod: `${months} months`,
    generatedAt: new Date()
  });
});