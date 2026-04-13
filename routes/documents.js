const express = require('express');
const { MedicalDocument, Patient } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and PDF files are allowed'));
    }
  }
});

// Get all documents for a patient
router.get('/patient/:patientId', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;

    // Verify ownership
    const patient = await Patient.findOne({
      _id: patientId,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const documents = await MedicalDocument.find({ patient_id: patientId })
      .sort({ created_at: -1 });

    res.json({ documents: documents.map(d => { const obj = d.toObject(); obj.id = obj._id; return obj; }) });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload document
router.post('/patient/:patientId/upload', authenticateToken, upload.single('document'), async (req, res) => {
  try {
    const { patientId } = req.params;
    const { document_type } = req.body;

    // Verify ownership
    const patient = await Patient.findOne({
      _id: patientId,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const document = await MedicalDocument.create({
      patient_id: patientId,
      document_type: document_type,
      file_name: req.file.originalname,
      file_path: req.file.path,
      uploaded_by: req.user.id
    });

    const docObj = document.toObject();
    docObj.id = docObj._id;

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: docObj
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete document
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Find document and verify ownership through patient
    const document = await MedicalDocument.findById(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const patient = await Patient.findOne({
      _id: document.patient_id,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const fs = require('fs');
    
    // Delete file from filesystem
    if (document.file_path && fs.existsSync(document.file_path)) {
      fs.unlinkSync(document.file_path);
    }

    await MedicalDocument.findByIdAndDelete(id);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
