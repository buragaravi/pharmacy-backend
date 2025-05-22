const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    chemicalLiveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChemicalLive',
      required: true,
    },
    chemicalName: {
      type: String,
      required: true,
    },
    transactionType: {
      type: String,
      enum: ['entry', 'issue', 'allocation', 'transfer'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    unit: {
      type: String,
      required: true,
    },
    fromLabId: {
      type: String,
    },
    toLabId: {
      type: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);
