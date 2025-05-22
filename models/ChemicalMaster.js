const mongoose = require('mongoose');

const chemicalMasterSchema = new mongoose.Schema(
  {
    chemicalName: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    batchId: { type: String, required: true }, // No longer unique
    vendor: { type: String, required: true },
    pricePerUnit: { type: Number, required: true },
    department: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChemicalMaster', chemicalMasterSchema);
