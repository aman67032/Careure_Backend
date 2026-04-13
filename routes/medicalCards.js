const express = require('express');
const { MedicalCard, Patient, Medication, Reminder } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Generate medical card for patient
router.post('/patient/:patientId/generate', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { consent_given = false } = req.body;

    // Verify ownership
    const patient = await Patient.findOne({
      _id: patientId,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    if (!consent_given) {
      return res.status(400).json({ error: 'Data sharing consent required' });
    }

    // Generate QR code
    const qrCode = `CARESURE_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // Valid for 1 year

    // Check if card exists
    let card = await MedicalCard.findOne({
      patient_id: patientId,
      is_active: true
    });

    if (card) {
      // Update existing card
      card = await MedicalCard.findByIdAndUpdate(card._id, {
        $set: {
          qr_code: qrCode,
          consent_given: consent_given,
          expires_at: expiresAt
        }
      }, { new: true });
    } else {
      // Create new card
      card = await MedicalCard.create({
        patient_id: patientId,
        qr_code: qrCode,
        consent_given: consent_given,
        expires_at: expiresAt
      });
    }

    // Get patient data for card
    const patientData = patient.toObject();

    // Get medications with time slots
    const medications = await Medication.find({
      patient_id: patientId,
      is_active: true
    });

    const enrichedMeds = await Promise.all(medications.map(async (med) => {
      const medObj = med.toObject();
      medObj.id = medObj._id;

      const reminders = await Reminder.find({
        medication_id: med._id,
        is_active: true
      });

      medObj.time_slots = [...new Set(reminders.map(r => r.time_slot))].join(', ');
      return medObj;
    }));

    const cardObj = card.toObject();
    cardObj.id = cardObj._id;

    res.json({
      message: 'Medical card generated successfully',
      card: {
        ...cardObj,
        patient: patientData,
        medications: enrichedMeds
      }
    });
  } catch (error) {
    console.error('Generate medical card error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get medical card
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

    const card = await MedicalCard.findOne({
      patient_id: patientId,
      is_active: true
    });

    if (!card) {
      return res.json({ card: null });
    }

    // Get patient data
    const patientData = patient.toObject();

    // Get medications with time slots
    const medications = await Medication.find({
      patient_id: patientId,
      is_active: true
    });

    const enrichedMeds = await Promise.all(medications.map(async (med) => {
      const medObj = med.toObject();
      medObj.id = medObj._id;

      const reminders = await Reminder.find({
        medication_id: med._id,
        is_active: true
      });

      medObj.time_slots = [...new Set(reminders.map(r => r.time_slot))].join(', ');
      return medObj;
    }));

    const cardObj = card.toObject();
    cardObj.id = cardObj._id;

    res.json({
      card: {
        ...cardObj,
        patient: patientData,
        medications: enrichedMeds
      }
    });
  } catch (error) {
    console.error('Get medical card error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public view (for doctors scanning QR)
router.get('/qr/:qrCode', async (req, res) => {
  try {
    const { qrCode } = req.params;

    const card = await MedicalCard.findOne({
      qr_code: qrCode,
      is_active: true,
      $or: [
        { expires_at: null },
        { expires_at: { $gt: new Date() } }
      ]
    });

    if (!card) {
      return res.status(404).json({ error: 'Medical card not found or expired' });
    }

    if (!card.consent_given) {
      return res.status(403).json({ error: 'Data sharing consent not given' });
    }

    // Get patient data (limited info for privacy)
    const patient = await Patient.findById(card.patient_id)
      .select('name age gender allergies medical_conditions emergency_contact');

    // Get medications with time slots
    const medications = await Medication.find({
      patient_id: card.patient_id,
      is_active: true
    }).select('name strength dose_per_intake frequency');

    const enrichedMeds = await Promise.all(medications.map(async (med) => {
      const medObj = med.toObject();

      const reminders = await Reminder.find({
        medication_id: med._id,
        is_active: true
      });

      medObj.time_slots = [...new Set(reminders.map(r => r.time_slot))].join(', ');
      return medObj;
    }));

    res.json({
      card: {
        qr_code: card.qr_code,
        patient: patient ? patient.toObject() : null,
        medications: enrichedMeds,
        generated_at: card.created_at
      }
    });
  } catch (error) {
    console.error('Get QR medical card error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
