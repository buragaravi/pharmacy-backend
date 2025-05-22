const ChemicalLive = require('../models/ChemicalLive');
const ChemicalMaster = require('../models/ChemicalMaster');
const Transaction = require('../models/Transaction');
const { handleErrorResponse, handleSuccessResponse } = require('../utils/responseHandler');

// Get all chemicals in the inventory with optional pagination and filtering
exports.getAllInventory = async (req, res) => {
  try {
    const { name, page = 1, limit = 10 } = req.query;
    const query = {};

    if (name) query.name = { $regex: name, $options: 'i' };

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      ChemicalMaster.find(query).skip(skip).limit(parseInt(limit)),
      ChemicalMaster.countDocuments(query),
    ]);

    handleSuccessResponse(res, 200, 'Inventory fetched successfully', {
      data,
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    handleErrorResponse(res, error);
  }
};

// Get inventory details by labId with optional pagination
exports.getInventoryByLab = async (req, res) => {
  try {
    const { labId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      ChemicalLive.find({ labId }).skip(skip).limit(parseInt(limit)),
      ChemicalLive.countDocuments({ labId }),
    ]);

    handleSuccessResponse(res, 200, 'Lab inventory fetched successfully', {
      data,
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    handleErrorResponse(res, error);
  }
};

// Add new chemical to the inventory (Master Stock)
exports.addChemical = async (req, res) => {
  try {
    const { name, description, unit, quantity, expiryDate, supplier, batchId } = req.body;

    // Create new entry in the master inventory
    const newChemical = new ChemicalMaster({
      name,
      description,
      unit,
      quantity,
      expiryDate,
      supplier,
      batchId,
    });

    await newChemical.save();

    // Create a corresponding entry in the live stock for tracking in the central lab
    const liveChemical = new ChemicalLive({
      chemicalId: newChemical._id,
      labId: 'central-lab', // Central Lab is assumed
      name,
      unit,
      quantity, // Starts with the same quantity as master stock
    });

    await liveChemical.save();

    // Log the transaction for adding the chemical
    const transaction = new Transaction({
      chemicalId: newChemical._id,
      quantity,
      labId: 'central-lab',
      type: 'entry', // Transaction type for adding
      date: new Date(),
      details: `Added ${quantity} units of ${name} to central lab.`,
    });

    await transaction.save();

    handleSuccessResponse(res, 201, 'Chemical added successfully to master and live stock', newChemical);
  } catch (error) {
    handleErrorResponse(res, error);
  }
};

// Allocate chemicals to a lab and update live stock
exports.allocateChemical = async (req, res) => {
  try {
    const { labId, chemicalId, quantity } = req.body;

    // Find the chemical in the live stock (central lab)
    const liveChemical = await ChemicalLive.findOne({ chemicalId, labId: 'central-lab' });

    if (!liveChemical) {
      return handleErrorResponse(res, 'Chemical not found in central lab stock', 404);
    }

    if (liveChemical.quantity < quantity) {
      return handleErrorResponse(res, 'Insufficient stock in central lab for allocation', 400);
    }

    // Deduct the quantity from the central lab live stock
    liveChemical.quantity -= quantity;
    await liveChemical.save();

    // Check if the chemical exists in the destination lab stock
    const labStock = await ChemicalLive.findOne({ chemicalId, labId });

    if (labStock) {
      // Update quantity in the destination lab
      labStock.quantity += quantity;
      await labStock.save();
    } else {
      // Create new entry for the lab if not present
      await ChemicalLive.create({
        chemicalId,
        labId,
        name: liveChemical.name,
        unit: liveChemical.unit,
        quantity,
      });
    }

    // Log the allocation transaction
    const newTransaction = new Transaction({
      chemicalId,
      quantity,
      labId,
      type: 'allocation',
      date: new Date(),
      details: `Allocated ${quantity} units of ${liveChemical.name} to lab ${labId}.`,
    });

    await newTransaction.save();

    handleSuccessResponse(res, 200, 'Chemical allocated successfully to lab', newTransaction);
  } catch (error) {
    handleErrorResponse(res, error);
  }
};

// Get live stock details
exports.getLiveStock = async (req, res) => {
  try {
    const liveStock = await ChemicalLive.find();
    handleSuccessResponse(res, 200, 'Live stock fetched successfully', liveStock);
  } catch (error) {
    handleErrorResponse(res, error);
  }
};
