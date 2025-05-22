const fs = require('fs');
const path = require('path');
const Transaction = require('../models/Transaction');

exports.logTransaction = async (transactionData) => {
  try {
    const newTransaction = new Transaction({
      chemicalLiveId: transactionData.chemicalLiveId,
      transactionType: transactionData.transactionType,
      quantity: transactionData.quantity,
      unit: transactionData.unit,
      fromLabId: transactionData.fromLabId,
      toLabId: transactionData.toLabId,
      createdBy: transactionData.createdBy,
    });

    await newTransaction.save();

    const logMessage = `Date: ${transactionData.date}, Chemical ID: ${transactionData.chemicalLiveId}, Type: ${transactionData.transactionType}, Quantity: ${transactionData.quantity} ${transactionData.unit}, From Lab: ${transactionData.fromLabId || 'N/A'}, To Lab: ${transactionData.toLabId || 'N/A'}, Created By: ${transactionData.createdBy}\n`;
    const logFilePath = path.join(__dirname, '..', 'logs', 'transactions.log');
    
    if (!fs.existsSync(path.dirname(logFilePath))) {
      fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    }

    fs.appendFileSync(logFilePath, logMessage);
  } catch (error) {
    console.error('Error logging transaction:', error.message);
  }
};
