const mongoose = require('mongoose');

const deviceCompartmentSchema = new mongoose.Schema({
  device_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true
  },
  medication_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medication'
  },
  compartment_number: {
    type: Number,
    required: true
  },
  current_stock: {
    type: Number,
    default: 0
  },
  low_stock_threshold: {
    type: Number,
    default: 5
  },
  last_refill: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Compound unique index
deviceCompartmentSchema.index({ device_id: 1, compartment_number: 1 }, { unique: true });

module.exports = mongoose.model('DeviceCompartment', deviceCompartmentSchema);
