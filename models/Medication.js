const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  strength: {
    type: String,
    trim: true
  },
  dose_per_intake: {
    type: String,
    trim: true
  },
  frequency: {
    type: String,
    trim: true
  },
  food_rule: {
    type: String,
    trim: true
  },
  duration_days: {
    type: Number
  },
  notes: {
    type: String
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
medicationSchema.index({ patient_id: 1 });

module.exports = mongoose.model('Medication', medicationSchema);
