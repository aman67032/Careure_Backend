const express = require('express');
const { Patient, Medication, Dose, Reminder } = require('../models');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Middleware to authenticate patient
const authenticatePatient = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production'
    );

    // Check if token is for a patient
    if (decoded.type !== 'patient') {
      return res.status(403).json({ error: 'Invalid token type' });
    }

    // Verify patient exists and is active
    const patient = await Patient.findOne({
      _id: decoded.id,
      is_active: true
    }).select('name patient_credentials_email');

    if (!patient) {
      return res.status(401).json({ error: 'Patient not found or inactive' });
    }

    req.patient = { id: patient._id, name: patient.name, patient_credentials_email: patient.patient_credentials_email };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Patient auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get patient profile
router.get('/profile', authenticatePatient, async (req, res) => {
  try {
    const patient = await Patient.findById(req.patient.id)
      .select('name age gender relationship allergies medical_conditions emergency_contact doctor_name doctor_contact created_at');

    const patientObj = patient.toObject();
    patientObj.id = patientObj._id;

    res.json({ patient: patientObj });
  } catch (error) {
    console.error('Get patient profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient's medications
router.get('/medications', authenticatePatient, async (req, res) => {
  try {
    const medications = await Medication.find({
      patient_id: req.patient.id,
      is_active: true
    }).sort({ created_at: -1 });

    // Enrich with reminder data
    const enrichedMeds = await Promise.all(medications.map(async (med) => {
      const medObj = med.toObject();
      medObj.id = medObj._id;

      const reminders = await Reminder.find({
        medication_id: med._id,
        is_active: true
      });

      medObj.time_slots = [...new Set(reminders.map(r => r.time_slot))].sort().join(', ');

      return medObj;
    }));

    res.json({ medications: enrichedMeds });
  } catch (error) {
    console.error('Get patient medications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get today's doses/reminders
router.get('/doses/today', authenticatePatient, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const doses = await Dose.find({
      patient_id: req.patient.id,
      scheduled_time: { $gte: today, $lt: tomorrow },
      status: { $ne: 'cancelled' }
    }).sort({ scheduled_time: 1 });

    // Enrich with medication and reminder data
    const enrichedDoses = await Promise.all(doses.map(async (dose) => {
      const doseObj = dose.toObject();
      doseObj.id = doseObj._id;

      const medication = await Medication.findById(dose.medication_id);
      const reminder = await Reminder.findById(dose.reminder_id);

      if (medication) {
        doseObj.medication_name = medication.name;
        doseObj.strength = medication.strength;
        doseObj.dose_per_intake = medication.dose_per_intake;
      }
      if (reminder) {
        doseObj.time_slot = reminder.time_slot;
        doseObj.food_rule = reminder.food_rule;
      }

      return doseObj;
    }));

    res.json({ doses: enrichedDoses });
  } catch (error) {
    console.error('Get today doses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark dose as taken
router.post('/doses/:doseId/taken', authenticatePatient, async (req, res) => {
  try {
    const { doseId } = req.params;
    const { notes } = req.body;

    // Verify dose belongs to patient
    const dose = await Dose.findOne({
      _id: doseId,
      patient_id: req.patient.id
    });

    if (!dose) {
      return res.status(404).json({ error: 'Dose not found' });
    }

    // Update dose status
    const updateData = {
      status: 'taken',
      taken_at: new Date()
    };
    if (notes) updateData.notes = notes;

    await Dose.findByIdAndUpdate(doseId, { $set: updateData });

    res.json({ message: 'Dose marked as taken' });
  } catch (error) {
    console.error('Mark dose taken error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark dose as missed
router.post('/doses/:doseId/missed', authenticatePatient, async (req, res) => {
  try {
    const { doseId } = req.params;

    // Verify dose belongs to patient
    const dose = await Dose.findOne({
      _id: doseId,
      patient_id: req.patient.id
    });

    if (!dose) {
      return res.status(404).json({ error: 'Dose not found' });
    }

    // Update dose status
    await Dose.findByIdAndUpdate(doseId, {
      $set: {
        status: 'missed'
      }
    });

    res.json({ message: 'Dose marked as missed' });
  } catch (error) {
    console.error('Mark dose missed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get patient stats
router.get('/stats', authenticatePatient, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's stats
    const taken = await Dose.countDocuments({
      patient_id: req.patient.id,
      status: 'taken',
      scheduled_time: { $gte: today, $lt: tomorrow }
    });
    const missed = await Dose.countDocuments({
      patient_id: req.patient.id,
      status: 'missed',
      scheduled_time: { $gte: today, $lt: tomorrow }
    });
    const pending = await Dose.countDocuments({
      patient_id: req.patient.id,
      status: 'pending',
      scheduled_time: { $gte: today, $lt: tomorrow }
    });

    // Get total medications
    const totalMedications = await Medication.countDocuments({
      patient_id: req.patient.id,
      is_active: true
    });

    // Get adherence for last 7 days
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const takenLast7 = await Dose.countDocuments({
      patient_id: req.patient.id,
      status: 'taken',
      scheduled_time: { $gte: sevenDaysAgo, $lt: tomorrow }
    });
    const totalLast7 = await Dose.countDocuments({
      patient_id: req.patient.id,
      scheduled_time: { $gte: sevenDaysAgo, $lt: tomorrow }
    });

    res.json({
      today: { taken, missed, pending },
      totalMedications,
      adherence7Days: totalLast7 > 0
        ? Math.round((takenLast7 / totalLast7) * 100)
        : 0
    });
  } catch (error) {
    console.error('Get patient stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
