const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  caregiver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Caregiver',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  age: {
    type: Number
  },
  gender: {
    type: String,
    trim: true
  },
  relationship: {
    type: String,
    trim: true
  },
  allergies: {
    type: String
  },
  medical_conditions: {
    type: String
  },
  emergency_contact: {
    type: String,
    trim: true
  },
  doctor_name: {
    type: String,
    trim: true
  },
  doctor_contact: {
    type: String,
    trim: true
  },
  patient_credentials_email: {
    type: String,
    trim: true
  },
  patient_credentials_password: {
    type: String
  },
  password_changed: {
    type: Boolean,
    default: false
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
patientSchema.index({ caregiver_id: 1 });
patientSchema.index({ patient_credentials_email: 1 });

module.exports = mongoose.model('Patient', patientSchema);
