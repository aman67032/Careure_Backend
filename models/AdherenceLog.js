const mongoose = require('mongoose');

const adherenceLogSchema = new mongoose.Schema({
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  medication_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medication',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  total_doses: {
    type: Number,
    default: 0
  },
  taken_doses: {
    type: Number,
    default: 0
  },
  missed_doses: {
    type: Number,
    default: 0
  },
  late_doses: {
    type: Number,
    default: 0
  },
  adherence_percentage: {
    type: Number,
    default: 0
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Compound unique index
adherenceLogSchema.index({ patient_id: 1, medication_id: 1, date: 1 }, { unique: true });
adherenceLogSchema.index({ patient_id: 1, date: 1 });

module.exports = mongoose.model('AdherenceLog', adherenceLogSchema);
