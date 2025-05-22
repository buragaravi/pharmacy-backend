const Request = require('../models/Request');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { validationResult } = require('express-validator');
const asyncHandler = require('express-async-handler');
const { logTransaction } = require('../utils/transactionLogger');
const ChemicalLive = require('../models/ChemicalLive');
const Transaction = require('../models/Transaction');
const Experiment = require('../models/Experiment');
const mongoose = require('mongoose');

// Helper function to validate ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// @desc    Approve, reject or fulfill a request
// @route   POST /api/requests/approve
// @access  Private (Admin/Lab Assistant)
exports.approveRequest = asyncHandler(async (req, res) => {
  const { requestId, status, force = false } = req.body;
  const adminId = req.userId;

  const validStatuses = ['approved', 'rejected', 'fulfilled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ msg: 'Invalid status value.' });
  }

  const request = await Request.findById(requestId)
    .populate('facultyId', 'name email')
    .populate('experiments.experimentId');
  
  if (!request) {
    return res.status(404).json({ msg: 'Request not found.' });
  }

  if (status === 'fulfilled') {
    const labId = request.labId;
    const unfulfilledChemicals = [];
    const fulfilledChemicals = [];

    // Check stock for each chemical
    for (const experiment of request.experiments) {
      for (const chem of experiment.chemicals) {
        // Skip already allocated chemicals
        if (chem.isAllocated) continue;

        const { chemicalName, quantity, unit } = chem;
        const labStock = await ChemicalLive.findOne({ chemicalName, labId });

        if (!labStock || labStock.quantity < quantity) {
          unfulfilledChemicals.push({
            chemicalName,
            availableQuantity: labStock?.quantity || 0,
            requiredQuantity: quantity,
            reason: labStock ? 'Insufficient stock' : 'Not found in lab',
          });
        } else {
          fulfilledChemicals.push({ 
            experimentId: experiment.experimentId,
            experimentName: experiment.experimentName,
            chemicalName, 
            quantity, 
            unit,
            chemicalMasterId: chem.chemicalMasterId
          });
        }
      }
    }

    // If some are unavailable, return list and await frontend confirmation
    if (unfulfilledChemicals.length > 0 && !force) {
      return res.status(206).json({
        msg: 'Some chemicals are unavailable or insufficient. Proceed with available chemicals only?',
        partiallyAvailable: fulfilledChemicals,
        unavailable: unfulfilledChemicals,
        requiresConfirmation: true,
      });
    }

    // Process available chemicals
    for (const chem of fulfilledChemicals) {
      const { chemicalName, quantity, unit, experimentId, chemicalMasterId } = chem;
      const labStock = await ChemicalLive.findOne({ chemicalName, labId });

      // Update chemical stock
      labStock.quantity -= quantity;
      await labStock.save();

      // Record transaction
      await Transaction.create({
        transactionType: 'transfer',
        chemicalName,
        fromLabId: labId,
        toLabId: "faculty",
        chemicalLiveId: labStock._id,
        quantity,
        unit,
        createdBy: adminId,
        timestamp: new Date(),
      });

      // Update allocation status in request
      const experiment = request.experiments.find(e => e.experimentId.equals(experimentId));
      const chemical = experiment.chemicals.find(c => 
        c.chemicalName === chemicalName && 
        (!c.chemicalMasterId || c.chemicalMasterId.equals(chemicalMasterId))
      );

      chemical.allocatedQuantity = quantity;
      chemical.isAllocated = true;
      chemical.allocationHistory.push({
        date: new Date(),
        quantity,
        allocatedBy: adminId
      });
    }

    // Update overall request status
    const allChemicalsAllocated = request.experiments.every(exp => 
      exp.chemicals.every(chem => chem.isAllocated)
    );
    request.status = allChemicalsAllocated ? 'fulfilled' : 'partially_fulfilled';
  } else {
    // Approve or reject
    request.status = status;
  }

  request.updatedBy = adminId;
  await request.save();

  await logTransaction({
    requestId,
    status: request.status,
    adminId,
    action: 'Approval/Reject/Fulfill',
    date: new Date(),
  });

  const notification = new Notification({
    userId: request.facultyId,
    message: `Your chemical request has been ${request.status.replace('_', ' ')}.`,
    type: 'request',
    relatedRequest: request._id
  });
  await notification.save();

  res.status(200).json({
    msg: `Request ${request.status} successfully.`,
    request
  });
});

// @desc    Fulfill remaining chemicals in a partially fulfilled request
// @route   POST /api/requests/fulfill-remaining
// @access  Private (Admin/Lab Assistant)
exports.fulfillRemaining = asyncHandler(async (req, res) => {
  const { requestId } = req.body;
  const adminId = req.userId;

  const request = await Request.findById(requestId)
    .populate('facultyId', 'name email')
    .populate('experiments.experimentId');
  
  if (!request) {
    return res.status(404).json({ msg: 'Request not found.' });
  }

  if (request.status !== 'partially_fulfilled') {
    return res.status(400).json({ msg: 'Only partially fulfilled requests can have remaining fulfilled.' });
  }

  const labId = request.labId;
  const unfulfilledChemicals = [];
  const fulfilledChemicals = [];

  // Process only unallocated chemicals
  for (const experiment of request.experiments) {
    for (const chem of experiment.chemicals) {
      if (chem.isAllocated) continue;

      const { chemicalName, quantity, unit } = chem;
      const labStock = await ChemicalLive.findOne({ chemicalName, labId });

      if (!labStock || labStock.quantity < quantity) {
        unfulfilledChemicals.push({
          chemicalName,
          availableQuantity: labStock?.quantity || 0,
          requiredQuantity: quantity,
          reason: labStock ? 'Insufficient stock' : 'Not found in lab',
        });
      } else {
        fulfilledChemicals.push({
          experimentId: experiment.experimentId,
          experimentName: experiment.experimentName,
          chemicalName,
          quantity,
          unit,
          chemicalMasterId: chem.chemicalMasterId
        });
      }
    }
  }

  // Process available chemicals
  for (const chem of fulfilledChemicals) {
    const { chemicalName, quantity, unit, experimentId, chemicalMasterId } = chem;
    const labStock = await ChemicalLive.findOne({ chemicalName, labId });

    labStock.quantity -= quantity;
    await labStock.save();

    await Transaction.create({
      transactionType: 'transfer',
      chemicalName,
      fromLabId: labId,
      toLabId: "faculty",
      chemicalLiveId: labStock._id,
      quantity,
      unit,
      createdBy: adminId,
      timestamp: new Date(),
    });

    // Update allocation status
    const experiment = request.experiments.find(e => e.experimentId.equals(experimentId));
    const chemical = experiment.chemicals.find(c => 
      c.chemicalName === chemicalName && 
      (!c.chemicalMasterId || c.chemicalMasterId.equals(chemicalMasterId))
    );

    chemical.allocatedQuantity = quantity;
    chemical.isAllocated = true;
    chemical.allocationHistory.push({
      date: new Date(),
      quantity,
      allocatedBy: adminId
    });
  }

  // Update request status
  const allChemicalsAllocated = request.experiments.every(exp => 
    exp.chemicals.every(chem => chem.isAllocated)
  );
  request.status = allChemicalsAllocated ? 'fulfilled' : 'partially_fulfilled';
  request.updatedBy = adminId;
  
  await request.save();

  res.status(200).json({
    msg: `Successfully fulfilled ${fulfilledChemicals.length} remaining chemicals.`,
    unfulfilled: unfulfilledChemicals,
    request
  });
});

// @desc    Create a new chemical request
// @route   POST /api/requests
// @access  Private (Faculty)
exports.createRequest = asyncHandler(async (req, res) => {
  const { labId, experiments } = req.body;
  const facultyId = req.userId;

  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Process experiments and get suggested chemicals
  const processedExperiments = await Promise.all(experiments.map(async exp => {
    const experiment = await Experiment.findById(exp.experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${exp.experimentId}`);
    }

    // Get suggested chemicals for this experiment
    const suggestedChemicals = experiment.defaultChemicals.map(defaultChem => {
      const averageUsage = experiment.averageUsage.find(
        avg => avg.chemicalName === defaultChem.chemicalName
      );

      return {
        chemicalName: defaultChem.chemicalName,
        quantity: averageUsage ? averageUsage.averageQuantity : defaultChem.quantity,
        unit: defaultChem.unit,
        allocatedQuantity: 0,
        isAllocated: false,
        allocationHistory: []
      };
    });

    return {
      experimentId: experiment._id,
      experimentName: experiment.name,
      date: exp.date,
      session: exp.session,
      chemicals: exp.chemicals || suggestedChemicals // Use provided chemicals or suggested ones
    };
  }));

  const newRequest = new Request({
    facultyId,
    labId,
    experiments: processedExperiments,
    status: 'pending',
    createdBy: facultyId
  });

  await newRequest.save();

  // Notify lab assistant
  const labAssistant = await User.findOne({ role: 'lab_assistant', labId });
  if (labAssistant) {
    const newNotification = new Notification({
      userId: labAssistant._id,
      message: `New request submitted by faculty for lab ${labId}.`,
      type: 'request',
      relatedRequest: newRequest._id
    });
    await newNotification.save();
  }

  res.status(201).json({
    message: 'Request created and lab assistant notified.',
    request: newRequest
  });
});

// @desc    Get experiments for request form
// @route   GET /api/requests/experiments
// @access  Private (Faculty)
exports.getExperimentsForRequest = asyncHandler(async (req, res) => {
  const { semester } = req.query;
  
  const experiments = await Experiment.find({ semester })
    .select('name subject description defaultChemicals averageUsage')
    .sort({ subject: 1, name: 1 });

  res.status(200).json(experiments);
});

// @desc    Get suggested chemicals for an experiment
// @route   GET /api/requests/experiments/:experimentId/suggested-chemicals
// @access  Private (Faculty)
exports.getSuggestedChemicalsForExperiment = asyncHandler(async (req, res) => {
  const { experimentId } = req.params;

  if (!isValidObjectId(experimentId)) {
    return res.status(400).json({ message: 'Invalid experiment ID format' });
  }

  const experiment = await Experiment.findById(experimentId);
  if (!experiment) {
    return res.status(404).json({ message: 'Experiment not found' });
  }

  // Get historical usage data
  const historicalRequests = await Request.find({
    'experiments.experimentId': experimentId
  }).select('experiments.chemicals');

  // Calculate average usage
  const chemicalUsage = {};
  historicalRequests.forEach(request => {
    request.experiments.forEach(exp => {
      if (exp.experimentId.toString() === experimentId) {
        exp.chemicals.forEach(chem => {
          if (!chemicalUsage[chem.chemicalName]) {
            chemicalUsage[chem.chemicalName] = {
              total: 0,
              count: 0,
              unit: chem.unit
            };
          }
          chemicalUsage[chem.chemicalName].total += chem.quantity;
          chemicalUsage[chem.chemicalName].count += 1;
        });
      }
    });
  });

  // Combine default chemicals with historical usage
  const suggestedChemicals = experiment.defaultChemicals.map(defaultChem => {
    const usage = chemicalUsage[defaultChem.chemicalName];
    return {
      chemicalName: defaultChem.chemicalName,
      quantity: usage ? usage.total / usage.count : defaultChem.quantity,
      unit: defaultChem.unit,
      chemicalMasterId: defaultChem.chemicalMasterId
    };
  });

  res.status(200).json({
    defaultChemicals: experiment.defaultChemicals,
    suggestedChemicals,
    historicalUsage: chemicalUsage
  });
});

// @desc    Get all chemical requests
// @route   GET /api/requests
// @access  Private (Admin/Lab Assistant)
exports.getAllRequests = asyncHandler(async (req, res) => {
  try {
    const requests = await Request.find()
      .populate('facultyId', 'name email')
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .populate('experiments.experimentId', 'name subject')
      .populate('experiments.chemicals.chemicalMasterId')
      .populate('experiments.chemicals.allocationHistory.allocatedBy', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (err) {
    console.error('Error fetching all requests:', err);
    res.status(500).json({ msg: 'Server error fetching requests' });
  }
});

// @desc    Get requests by faculty ID
// @route   GET /api/requests/faculty
// @access  Private (Faculty)
exports.getRequestsByFacultyId = asyncHandler(async (req, res) => {
  try {
    const facultyId = req.userId;
    const requests = await Request.find({ facultyId })
      .populate('experiments.experimentId', 'name subject')
      .populate('experiments.chemicals.chemicalMasterId')
      .populate('experiments.chemicals.allocationHistory.allocatedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error('Error fetching faculty requests:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @desc    Get requests by lab ID
// @route   GET /api/requests/lab/:labId
// @access  Private (Admin/Lab Assistant)
exports.getRequestsByLabId = asyncHandler(async (req, res) => {
  const { labId } = req.params;

  try {
    const requests = await Request.find({ labId })
      .populate('facultyId', 'name email')
      .populate('experiments.experimentId', 'name')
      .populate('experiments.chemicals.chemicalMasterId')
      .populate('experiments.chemicals.allocationHistory.allocatedBy', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json(requests);
  } catch (err) {
    console.error(`Error fetching requests for lab ${labId}:`, err);
    res.status(500).json({ msg: 'Server error fetching lab requests' });
  }
});

// @desc    Get request by ID
// @route   GET /api/requests/:id
// @access  Private
exports.getRequestById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid request ID format' });
  }

  const request = await Request.findById(id)
    .populate('facultyId', 'name email')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name')
    .populate('experiments.experimentId', 'name subject description')
    .populate('experiments.chemicals.chemicalMasterId')
    .populate('experiments.chemicals.allocationHistory.allocatedBy', 'name');

  if (!request) {
    return res.status(404).json({ message: 'Request not found' });
  }

  res.status(200).json(request);
});

// @desc    Update request
// @route   PUT /api/requests/:id
// @access  Private (Faculty)
exports.updateRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { labId, experiments } = req.body;
  const facultyId = req.userId;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid request ID format' });
  }

  const request = await Request.findById(id);

  if (!request) {
    return res.status(404).json({ message: 'Request not found' });
  }

  // Only allow updates if request is pending
  if (request.status !== 'pending') {
    return res.status(400).json({ message: 'Can only update pending requests' });
  }

  // Only the creator can update the request
  if (!request.createdBy.equals(facultyId)) {
    return res.status(403).json({ message: 'Not authorized to update this request' });
  }

  // Process experiments
  const processedExperiments = await Promise.all(experiments.map(async exp => {
    const experiment = await Experiment.findById(exp.experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${exp.experimentId}`);
    }

    return {
      experimentId: experiment._id,
      experimentName: experiment.name,
      date: exp.date,
      session: exp.session,
      chemicals: exp.chemicals
    };
  }));

  // Update request
  request.labId = labId;
  request.experiments = processedExperiments;
  request.updatedBy = facultyId;
  await request.save();

  res.status(200).json(request);
});

// @desc    Delete request
// @route   DELETE /api/requests/:id
// @access  Private (Faculty)
exports.deleteRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const facultyId = req.userId;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid request ID format' });
  }

  const request = await Request.findById(id);

  if (!request) {
    return res.status(404).json({ message: 'Request not found' });
  }

  // Only allow deletion if request is pending
  if (request.status !== 'pending') {
    return res.status(400).json({ message: 'Can only delete pending requests' });
  }

  // Only the creator can delete the request
  if (!request.createdBy.equals(facultyId)) {
    return res.status(403).json({ message: 'Not authorized to delete this request' });
  }

  await Request.deleteOne({ _id: id });
  res.status(200).json({ message: 'Request deleted successfully' });
});

// @desc    Reject request
// @route   PUT /api/requests/:id/reject
// @access  Private (Admin/Lab Assistant)
exports.rejectRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminId = req.userId;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid request ID format' });
  }

  const request = await Request.findById(id);

  if (!request) {
    return res.status(404).json({ message: 'Request not found' });
  }

  request.status = 'rejected';
  request.updatedBy = adminId;
  await request.save();

  // Notify faculty
  const notification = new Notification({
    userId: request.facultyId,
    message: `Your chemical request has been rejected. ${reason ? 'Reason: ' + reason : ''}`,
    type: 'request',
    relatedRequest: request._id
  });
  await notification.save();

  res.status(200).json(request);
});

// @desc    Allocate chemicals to request
// @route   PUT /api/requests/:id/allocate
// @access  Private (Admin/Lab Assistant)
exports.allocateChemicals = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { chemicals } = req.body;
  const adminId = req.userId;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid request ID format' });
  }

  const request = await Request.findById(id)
    .populate('experiments.experimentId');

  if (!request) {
    return res.status(404).json({ message: 'Request not found' });
  }

  // Check lab stock before allocation
  const labId = request.labId;
  const stockIssues = [];

  for (const allocation of chemicals) {
    const { experimentId, chemicalName, quantity } = allocation;
    
    const labStock = await ChemicalLive.findOne({ chemicalName, labId });
    if (!labStock || labStock.quantity < quantity) {
      stockIssues.push({
        chemicalName,
        available: labStock ? labStock.quantity : 0,
        required: quantity
      });
    }
  }

  if (stockIssues.length > 0) {
    return res.status(400).json({
      message: 'Some chemicals have insufficient stock',
      stockIssues
    });
  }

  // Update chemical allocations
  for (const allocation of chemicals) {
    const { experimentId, chemicalName, quantity, unit, chemicalMasterId } = allocation;
    
    // Find the experiment and chemical
    const experiment = request.experiments.find(exp => exp.experimentId.equals(experimentId));
    if (!experiment) continue;
    
    const chemical = experiment.chemicals.find(chem => 
      chem.chemicalName === chemicalName && 
      (!chemicalMasterId || chem.chemicalMasterId.equals(chemicalMasterId))
    );
    
    if (!chemical) continue;

    // Update chemical stock
    const labStock = await ChemicalLive.findOne({ chemicalName, labId });
    labStock.quantity -= quantity;
    await labStock.save();

    // Record transaction
    await Transaction.create({
      transactionType: 'transfer',
      chemicalName,
      fromLabId: labId,
      toLabId: "faculty",
      chemicalLiveId: labStock._id,
      quantity,
      unit,
      createdBy: adminId,
      timestamp: new Date(),
    });

    // Update allocation
    chemical.allocatedQuantity = quantity;
    chemical.isAllocated = true;
    chemical.allocationHistory.push({
      date: new Date(),
      quantity,
      allocatedBy: adminId
    });
  }

  // Update request status
  const allAllocated = request.experiments.every(exp => 
    exp.chemicals.every(chem => chem.isAllocated)
  );
  request.status = allAllocated ? 'fulfilled' : 'partially_fulfilled';
  request.updatedBy = adminId;
  
  await request.save();

  res.status(200).json(request);
});

// @desc    Complete a fulfilled request
// @route   PUT /api/requests/:id/complete
// @access  Private (Admin/Lab Assistant)
exports.completeRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.userId;

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid request ID format' });
  }

  const request = await Request.findById(id);

  if (!request) {
    return res.status(404).json({ message: 'Request not found' });
  }

  if (request.status !== 'fulfilled') {
    return res.status(400).json({ message: 'Can only complete fulfilled requests' });
  }

  request.status = 'completed';
  request.updatedBy = adminId;
  await request.save();

  // Notify faculty
  const notification = new Notification({
    userId: request.facultyId,
    message: 'Your chemical request has been completed and is ready for pickup.',
    type: 'request',
    relatedRequest: request._id
  });
  await notification.save();

  res.status(200).json(request);
});