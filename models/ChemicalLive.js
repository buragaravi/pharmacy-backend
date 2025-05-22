// models/ChemicalLive.js
const mongoose = require('mongoose');

const chemicalLiveSchema = new mongoose.Schema(
  {
    chemicalMasterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChemicalMaster',
      required: true,
    },
    chemicalName: { type: String, required: true }, // Suffixed name (backend use)
    displayName: { type: String, required: true },  // Clean name (frontend use)
    unit: { type: String, required: true },
    labId: {
      type: String,
      required: true,
      enum: ['LAB01', 'LAB02', 'LAB03', 'LAB04', 'LAB05', 'LAB06', 'LAB07', 'LAB08', 'central-lab'],
    },
    quantity: { type: Number, required: true },
    originalQuantity: { type: Number, required: true },
    expiryDate: { type: Date, required: true },
    isAllocated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChemicalLive', chemicalLiveSchema);