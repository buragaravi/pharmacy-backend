const mongoose = require('mongoose');

const quotationSchema = new mongoose.Schema({
  createdByRole: {
    type: String,
    enum: ['lab_assistant', 'central_lab_admin'],
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  labId: { type: String }, // Required for lab assistant quotes
  vendorName: { type: String }, // Only for central lab admin
  chemicals: [
    {
      chemicalName: { type: String, required: true },
      quantity: { type: Number, required: true },
      unit: { type: String, required: true },
      pricePerUnit: { type: Number }, // optional for lab assistant
      remarks: { type: String }, // Added field for chemical-specific remarks
    }
  ],
  totalPrice: { type: Number },
  status: {
    type: String,
    enum: [
      // For Lab Assistant
      'pending', 'reviewed', 'allocated', 'partially_fulfilled', 'rejected',
      // For Central Admin
      'draft', 'suggestions', 'approved', 'purchasing', 'purchased'
    ],
    required: true,
  },
  comments: [{
    text: { type: String},
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    role: { type: String },
    createdAt: { type: Date, default: Date.now }
  }], // Array of comments for chat-like conversation
}, { timestamps: true });

module.exports = mongoose.model('Quotation', quotationSchema);