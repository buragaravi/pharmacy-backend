const mongoose = require('mongoose');
const Quotation = require('../models/Quotation');
const ChemicalMaster = require('../models/ChemicalMaster');
const ChemicalLive = require('../models/ChemicalLive');
const Transaction = require('../models/Transaction');
const { validationResult } = require('express-validator');
const asyncHandler = require('express-async-handler');

// LAB ASSISTANT: Create quotation for deficient chemicals
exports.createLabQuotation = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { labId, chemicals } = req.body;

  // Validate chemicals array
  if (!Array.isArray(chemicals)) {
    return res.status(400).json({ message: 'Chemicals must be an array' });
  }

  const quotation = new Quotation({
    createdByRole: 'lab_assistant',
    createdBy: req.user._id,
    labId,
    chemicals: chemicals.map(chem => ({
      chemicalName: chem.chemicalName,
      quantity: chem.quantity,
      unit: chem.unit,
      remarks: chem.remarks // Save remarks if provided
    })),
    status: 'pending',
    comments: [] // Ensure comments array is initialized
  });

  await quotation.save();
  res.status(201).json({ msg: 'Lab quotation submitted', quotation });
});

// CENTRAL LAB ADMIN: Create new draft quotation
exports.createDraftQuotation = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { vendorName, chemicals, totalPrice, expectedDeliveryDate } = req.body;

  const quotation = new Quotation({
    createdByRole: 'central_lab_admin',
    createdBy: req.user._id,
    vendorName,
    chemicals: chemicals.map(chem => ({
      chemicalName: chem.chemicalName,
      quantity: chem.quantity,
      unit: chem.unit,
      pricePerUnit: chem.pricePerUnit,
      remarks: chem.remarks // Save remarks if provided
    })),
    totalPrice,
    status: 'draft',
    comments: [{ text: 'Draft created for review', author: req.user._id, role: req.user.role, createdAt: new Date() }],
  });

  await quotation.save();
  res.status(201).json({ msg: 'Draft quotation created', quotation });
});

// CENTRAL LAB ADMIN: Add chemical to existing draft
exports.addChemicalToDraft = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { quotationId, chemicalName, quantity, unit, pricePerUnit } = req.body;
  const quotation = new mongoose.Types.ObjectId(quotationId);
  const draft = await Quotation.findById(quotation);
  if (!draft || draft.status !== 'draft') {
    return res.status(404).json({ msg: 'Draft quotation not found' });
  }

  draft.chemicals.push({
    chemicalName,
    quantity,
    unit,
    pricePerUnit,
  });

  // Recalculate total price
  draft.totalPrice = draft.chemicals.reduce((sum, chem) => sum + (chem.quantity * chem.pricePerUnit), 0);

  await draft.save();
  res.status(200).json({ msg: 'Chemical added to draft', draft });
});

// CENTRAL LAB ADMIN: Submit draft quotation (status → pending)
exports.submitDraftToPending = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { quotationId } = req.body;

  const draft = await Quotation.findById(quotationId);
  if (!draft || draft.status !== 'draft') {
    return res.status(404).json({ msg: 'Draft quotation not found' });
  }

  draft.status = 'pending';
  draft.submittedAt = new Date();
  await draft.save();

  res.status(200).json({ msg: 'Draft submitted for approval', draft });
});

// CENTRAL LAB ADMIN: Allocate chemicals from lab assistant's quotation
exports.allocateLabQuotation = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { quotationId, comments, status } = req.body;

  // Validate status first
  if (!['allocated', 'partially_fulfilled', 'rejected'].includes(status)) {
    return res.status(400).json({
      success: false,
      msg: 'Invalid status for allocation',
      validStatuses: ['allocated', 'partially_fulfilled', 'rejected']
    });
  }

  // Find the quotation
  const quotation = await Quotation.findOne({
    _id: new mongoose.Types.ObjectId(quotationId),
    createdByRole: 'lab_assistant',
  }).populate('createdBy');

  if (!quotation) {
    return res.status(404).json({
      success: false,
      msg: 'Pending lab quotation not found',
      details: { quotationId }
    });
  }

  // Defensive: Ensure comments is always an array of objects with required fields
  if (!Array.isArray(quotation.comments)) {
    quotation.comments = [];
  }
  quotation.comments.push({
    text: comments || 'Request rejected',
    author: req.user._id,
    role: req.user.role,
    createdAt: new Date()
  });

  // If status is rejected, just update and return
  if (status === 'rejected') {
    quotation.status = 'rejected';
    await quotation.save();

    return res.status(200).json({
      success: true,
      msg: 'Quotation rejected',
      quotation
    });
  }

  // For allocation statuses, process the chemicals
  const allocationResults = [];
  let allAllocated = true;

  // Use the robust allocation logic from ChemicalController
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    for (const chem of quotation.chemicals) {
      try {
        // Find central stock (FIFO: earliest expiry)
        const centralStock = await ChemicalLive.findOneAndUpdate(
          {
            displayName: chem.chemicalName,
            labId: 'central-lab',
            quantity: { $gte: chem.quantity }
          },
          { $inc: { quantity: -chem.quantity } },
          {
            session,
            new: true,
            sort: { expiryDate: 1 }
          }
        );

        if (!centralStock) {
          allocationResults.push({
            chemicalName: chem.chemicalName,
            status: 'failed',
            reason: 'Insufficient stock or not found'
          });
          allAllocated = false;
          continue;
        }

        // Add/update lab stock with all required fields
        const labStock = await ChemicalLive.findOneAndUpdate(
          {
            chemicalMasterId: centralStock.chemicalMasterId,
            labId: quotation.labId
          },
          {
            $inc: { quantity: chem.quantity },
            $setOnInsert: {
              chemicalName: centralStock.chemicalName,
              displayName: centralStock.displayName,
              unit: centralStock.unit,
              expiryDate: centralStock.expiryDate,
              originalQuantity: chem.quantity,
              isAllocated: true
            }
          },
          {
            session,
            new: true,
            upsert: true
          }
        );

        // Create transaction record
        await Transaction.create([
          {
            chemicalName: centralStock.chemicalName,
            transactionType: 'allocation',
            chemicalLiveId: labStock._id,
            fromLabId: 'central-lab',
            toLabId: quotation.labId,
            quantity: chem.quantity,
            unit: centralStock.unit,
            createdBy: req.user._id,
            quotationId: quotation._id,
            timestamp: new Date()
          }
        ], { session });

        allocationResults.push({
          chemicalName: chem.chemicalName,
          status: 'allocated',
          quantity: chem.quantity
        });
      } catch (error) {
        allocationResults.push({
          chemicalName: chem.chemicalName,
          status: 'error',
          reason: error.message
        });
        allAllocated = false;
      }
    }
    await session.commitTransaction();
    session.endSession();
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ message: 'Allocation failed', error: error.message });
  }

  // Update quotation status based on allocation results
  quotation.status = allAllocated ? 'allocated' : 'partially_fulfilled';
  quotation.comments.push({
    text: comments || `Allocation completed with ${allAllocated ? 'full' : 'partial'} success`,
    author: req.user._id,
    role: req.user.role,
    createdAt: new Date()
  });
  await quotation.save();

  res.status(200).json({
    success: true,
    msg: `Quotation ${quotation.status}`,
    status: quotation.status,
    allocationResults,
    quotation
  });
});

// ADMIN: Approve/reject central admin's quotation
exports.processCentralQuotation = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { quotationId, status, comments, chemicalUpdates } = req.body;

  // Validate status
  if (!['approved', 'rejected', 'purchasing', 'purchased'].includes(status)) {
    return res.status(400).json({ msg: 'Invalid status for central quotation' });
  }

  const quotation = await Quotation.findById(new mongoose.Types.ObjectId(quotationId));

  if (!quotation) {
    return res.status(404).json({ msg: 'Pending central quotation not found' });
  }

  // Defensive: Ensure comments is always an array of objects with required fields
  if (!Array.isArray(quotation.comments)) {
    quotation.comments = [];
  }
  quotation.comments.push({
    text: comments || `Quotation marked as ${status}`,
    author: req.user._id,
    role: req.user.role,
    createdAt: new Date()
  });

  // Update chemical remarks if chemicalUpdates is present
  if (Array.isArray(chemicalUpdates)) {
    chemicalUpdates.forEach(update => {
      if (typeof update.index === 'number' && quotation.chemicals[update.index]) {
        quotation.chemicals[update.index].remarks = update.remarks;
      }
    });
  }

  // Update status
  quotation.status = status;

  // If ordered, add to master inventory
  if (status === 'purchased') {
    for (const chem of quotation.chemicals) {
      // Find or create chemical master
      let master = await ChemicalMaster.findOne({
        chemicalName: chem.chemicalName,
        unit: chem.unit
      });

      if (!master) {
        master = await ChemicalMaster.create({
          chemicalName: chem.chemicalName,
          unit: chem.unit,
          vendor: quotation.vendorName,
          pricePerUnit: chem.pricePerUnit
        });
      }

      // Add to central live stock
      let liveStock = await ChemicalLive.findOne({
        chemicalMasterId: master._id,
        labId: 'central-lab'
      });

      if (liveStock) {
        liveStock.quantity += chem.quantity;
      } else {
        liveStock = new ChemicalLive({
          chemicalMasterId: master._id,
          chemicalName: chem.chemicalName,
          labId: 'central-lab',
          quantity: chem.quantity,
          originalQuantity: chem.quantity,
          unit: chem.unit,
          vendor: quotation.vendorName
        });
      }
      await liveStock.save();

      // Record transaction
      await Transaction.create({
        chemicalName: chem.chemicalName,
        transactionType: 'purchase',
        fromLabId: 'vendor',
        toLabId: 'central-lab',
        quantity: chem.quantity,
        unit: chem.unit,
        createdBy: req.user._id,
        quotationId: quotation._id,
        timestamp: new Date()
      });
    }
  }

  await quotation.save();
  res.status(200).json({ msg: `Quotation ${status}`, quotation });
});

// GET quotations for Lab Assistant
exports.getLabAssistantQuotations = asyncHandler(async (req, res) => {
  const quotations = await Quotation.find({
    createdBy: req.user._id,
    createdByRole: 'lab_assistant'
  }).sort({ createdAt: -1 });
  res.status(200).json(quotations);
});

// GET quotations for Central Lab Admin
exports.getCentralAdminQuotations = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const query = {
    createdByRole: { $in: ['lab_assistant', 'central_lab_admin'] }
  };

  if (status) query.status = status;

  const quotations = await Quotation.find(query)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name email')

  res.status(200).json(quotations);
});

// GET quotations for Admin (excluding drafts)
exports.getAdminQuotations = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const query = {
    createdByRole: 'central_lab_admin',
    status: { $ne: 'draft' }
  };

  if (status) query.status = status;

  const quotations = await Quotation.find(query)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name email')

  res.status(200).json(quotations);
});

// GET single quotation with details
exports.getQuotationDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const quotationId = new mongoose.Types.ObjectId(id);
  const quotation = await Quotation.findById(quotationId)
    .populate('createdBy', 'name email role')
    .populate('labId', 'labName');

  if (!quotation) {
    return res.status(404).json({ msg: 'Quotation not found' });
  }

  // Add stock availability for lab assistant quotations
  if (quotation.createdByRole === 'lab_assistant') {
    const chemicalsWithStock = await Promise.all(
      quotation.chemicals.map(async chem => {
        const centralStock = await ChemicalLive.findOne({
          chemicalName: chem.chemicalName,
          labId: 'central-lab'
        });
        return {
          ...chem.toObject(),
          availableInCentral: centralStock?.quantity || 0
        };
      })
    );
    quotation.chemicals = chemicalsWithStock;
  }

  res.status(200).json(quotation);
});

// Add a comment to a quotation (chat-like)
exports.addQuotationComment = asyncHandler(async (req, res) => {
  const { quotationId } = req.params;
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Comment text required' });
  const quotation = await Quotation.findById(quotationId);
  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
  // Defensive: Ensure comments is always an array of objects with required fields
  if (!Array.isArray(quotation.comments)) {
    quotation.comments = [];
  }
  quotation.comments.push({
    text: text.trim(),
    author: req.user._id || req.userId,
    role: req.user.role,
    createdAt: new Date()
  });
  await quotation.save();
  res.status(200).json({ message: 'Comment added', comments: quotation.comments });
});

/**
 * Controller functions for managing chemical quotations
 */

// Add chemical remarks to quotation
exports.addChemicalRemarks = async (req, res) => {
  try {
    const { quotationId } = req.params;
    const { chemicalUpdates } = req.body;

    // Verify user role is central_lab_admin
    if (req.user.role !== 'central_lab_admin') {
      return res.status(403).json({ message: 'Only central lab administrators can add remarks to chemicals' });
    }

    // Find the quotation
    const quotation = await Quotation.findById(quotationId);

    if (!quotation) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    // Defensive: Ensure comments is always an array of objects with required fields
    if (!Array.isArray(quotation.comments)) {
      quotation.comments = [];
    }
    quotation.comments.push({
      text: chemicalUpdates.comments || `${req.user.name} added remarks to chemicals`,
      author: req.user?._id || req.userId,
      role: req.user?.role || 'system',
      createdAt: new Date()
    });

    // Update chemical remarks based on provided updates
    // chemicalUpdates should be an array of objects like: [{ index: 0, remarks: 'New remark' }]
    if (Array.isArray(chemicalUpdates)) {
      chemicalUpdates.forEach(update => {
        if (typeof update.index === 'number' && quotation.chemicals[update.index]) {
          quotation.chemicals[update.index].remarks = update.remarks;
        }
      });
    }

    // Save the updated quotation
    await quotation.save();

    return res.status(200).json({
      message: 'Chemical remarks updated successfully',
      quotation
    });
  } catch (error) {
    console.error('Error adding chemical remarks:', error);
    return res.status(500).json({ message: 'Failed to update chemical remarks', error: error.message });
  }
};

// Update specific chemicals in a quotation including remarks
exports.updateQuotationChemicals = async (req, res) => {
  try {
    const { quotationId } = req.params;
    const { chemicals } = req.body;

    // Find the quotation
    const quotation = await Quotation.findById(quotationId);

    if (!quotation) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    // Defensive: Ensure comments is always an array of objects with required fields
    if (!Array.isArray(quotation.comments)) {
      quotation.comments = [];
    }
    quotation.comments.push({
      text: 'Auto-generated comment',
      author: req.user?._id || req.userId,
      role: req.user?.role || 'system',
      createdAt: new Date()
    });

    // Check authorization based on quotation status and user role
    if (req.user.role !== 'central_lab_admin' &&
      quotation.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this quotation' });
    }

    // For central admin, allow updating chemicals including remarks
    if (req.user.role === 'central_lab_admin') {
      // Update chemicals array with new data
      if (Array.isArray(chemicals)) {
        chemicals.forEach(updatedChem => {
          const index = quotation.chemicals.findIndex(
            chem => chem._id.toString() === updatedChem._id
          );

          if (index !== -1) {
            // Update existing chemical
            quotation.chemicals[index] = {
              ...quotation.chemicals[index],
              ...updatedChem,
              // Preserve original _id
              _id: quotation.chemicals[index]._id
            };
          }
        });
      }

      // Recalculate total price if needed
      if (quotation.totalPrice) {
        quotation.totalPrice = quotation.chemicals.reduce((sum, chem) => {
          return sum + (chem.pricePerUnit || 0) * chem.quantity;
        }, 0);
      }

      await quotation.save();

      return res.status(200).json({
        message: 'Quotation chemicals updated successfully',
        quotation
      });
    } else {
      // For lab assistant, only allow limited updates
      return res.status(403).json({
        message: 'Lab assistants cannot update chemical details after submission'
      });
    }
  } catch (error) {
    console.error('Error updating quotation chemicals:', error);
    return res.status(500).json({
      message: 'Failed to update quotation chemicals',
      error: error.message
    });
  }
};

// Add a new route to handle batch remarks updates
exports.updateAllChemicalRemarks = async (req, res) => {
  try {
    const { quotationId } = req.params;
    const { standardRemark } = req.body;

    // Defensive: Check req.user exists and has role
    if (!req.user || req.user.role !== 'central_lab_admin') {
      return res.status(403).json({ message: 'Only central lab administrators can perform batch updates' });
    }

    // Find the quotation
    const quotation = await Quotation.findById(quotationId);

    if (!quotation) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    // Defensive: Ensure comments is always an array of objects with required fields
    if (!Array.isArray(quotation.comments)) {
      quotation.comments = [];
    }
    quotation.comments.push({
      text: 'Auto-generated comment',
      author: req.user?._id || req.userId,
      role: req.user?.role || 'system',
      createdAt: new Date()
    });

    // Apply the standard remark to all chemicals that don't already have remarks
    quotation.chemicals.forEach((chemical, index) => {
      if (!chemical.remarks || chemical.remarks.trim() === '') {
        quotation.chemicals[index].remarks = standardRemark;
      }
    });

    await quotation.save();

    return res.status(200).json({
      message: 'Standard remarks applied successfully to all chemicals without remarks',
      quotation
    });
  } catch (error) {
    console.error('Error applying standard remarks:', error);
    return res.status(500).json({
      message: 'Failed to apply standard remarks',
      error: error.message
    });
  }
};