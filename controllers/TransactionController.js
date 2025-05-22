const Transaction = require('../models/Transaction');
const ChemicalLive = require('../models/ChemicalLive');
const { validationResult } = require('express-validator');
const asyncHandler = require('express-async-handler');
const { logTransaction } = require('../utils/transactionLogger');  // Assuming you have a utility to log transactions

// Create a new stock transaction (allocation, return, restock, etc.)
exports.createTransaction = asyncHandler(async (req, res) => {
  const { chemicalName ,transactionType, chemicalLiveId, fromLabId, toLabId, quantity, unit } = req.body;
  const  userId = req.userId; // User ID from authentication middleware

  // Validate request data
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Log the transaction in the database
  const newTransaction = new Transaction({
    chemicalName,
    transactionType,
    chemicalLiveId,  // Assuming you use chemicalMasterId as the live chemical ID
    quantity,
    unit,
    fromLabId,
    toLabId,  // Assuming the transaction involves lab ID
    createdBy: userId._id,  // User initiating the transaction
  });

  // Save the transaction to the database
  await newTransaction.save();

  // Update the live inventory stock based on transaction type
  const chemicalLive = await ChemicalLive.findOne({ chemicalLiveId, fromLabId });
  if (!chemicalLive) {
    return res.status(404).json({ msg: 'Chemical not found in live inventory' });
  }

  // Handle different types of transactions
  if (transactionType === 'allocation') {
    if (chemicalLive.quantity < quantity) {
      return res.status(400).json({ msg: 'Insufficient stock for allocation' });
    }
    chemicalLive.quantity -= quantity; // Deduct from live stock
  } else if (transactionType === 'restock') {
    chemicalLive.quantity += quantity; // Add to live stock
  }

  await chemicalLive.save(); // Save updated live stock

  // Optionally log the transaction (you can call the logTransaction utility here)
  await logTransaction({
    chemicalLiveId,
    transactionType,
    quantity,
    unit,
    fromLabId,
    toLabId,
    createdBy: userId._id,
  });

  res.status(201).json({ msg: 'Transaction processed and live inventory updated' });
});

// Get all transactions (accessible by central lab admins)
exports.getAllTransactions = asyncHandler(async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('chemicalLiveId')
      .populate('createdBy');
    res.status(200).json(transactions);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Get transactions for a specific lab (accessible by lab assistants)
exports.getLabTransactions = asyncHandler(async (req, res) => {
  const { labId } = req.params;
  try {
    const transactions = await Transaction.find({
      $or: [{ fromLabId: labId }, { toLabId: labId }]
    })
      .populate('chemicalLiveId')
      .populate('createdBy');

    if (transactions.length === 0) {
      return res.status(404).json({ msg: 'No transactions found for this lab' });
    }

    res.status(200).json(transactions);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});
