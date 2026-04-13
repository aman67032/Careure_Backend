const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  caregiver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Caregiver',
    required: true
  },
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  alert_type: {
    type: String,
    required: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String
  },
  severity: {
    type: String,
    default: 'info',
    enum: ['info', 'low', 'medium', 'high', 'critical']
  },
  is_read: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
alertSchema.index({ caregiver_id: 1 });
alertSchema.index({ patient_id: 1 });

module.exports = mongoose.model('Alert', alertSchema);
