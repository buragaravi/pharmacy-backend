const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema(
  {
    fromLabId: {
      type: String,
      required: true,
    },
    toLabId: {
      type: String,
      required: true,
    },
    chemicalsTransferred: [
      {
        chemicalMasterId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ChemicalMaster',
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
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transfer', transferSchema);
