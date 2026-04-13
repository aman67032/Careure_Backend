const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  device_name: {
    type: String,
    trim: true
  },
  device_id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  connection_type: {
    type: String,
    trim: true
  },
  battery_level: {
    type: Number,
    default: 100
  },
  is_connected: {
    type: Boolean,
    default: false
  },
  last_sync: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
deviceSchema.index({ patient_id: 1 });

module.exports = mongoose.model('Device', deviceSchema);
