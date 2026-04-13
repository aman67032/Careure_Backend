const mongoose = require('mongoose');

const medicalDocumentSchema = new mongoose.Schema({
  patient_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  document_type: {
    type: String,
    trim: true
  },
  file_name: {
    type: String,
    trim: true
  },
  file_path: {
    type: String
  },
  uploaded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Caregiver'
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('MedicalDocument', medicalDocumentSchema);
