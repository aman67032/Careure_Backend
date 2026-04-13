const mongoose = require('mongoose');

const doseSchema = new mongoose.Schema({
  reminder_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reminder',
    required: true
  },
  medication_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medication',
    required: true
  },
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  scheduled_time: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'taken', 'missed', 'cancelled']
  },
  taken_at: {
    type: Date
  },
  taken_by: {
    type: String,
    trim: true
  },
  missed_at: {
    type: Date
  },
  device_verified: {
    type: Boolean,
    default: false
  },
  delay_minutes: {
    type: Number,
    default: 0
  },
  notes: {
    type: String
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
doseSchema.index({ patient_id: 1 });
doseSchema.index({ scheduled_time: 1 });
doseSchema.index({ status: 1 });
doseSchema.index({ reminder_id: 1, patient_id: 1, scheduled_time: 1 });

module.exports = mongoose.model('Dose', doseSchema);
