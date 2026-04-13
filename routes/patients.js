const express = require('express');
const { Patient, Medication, Dose, Device } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { validatePatient } = require('../middleware/validate');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const router = express.Router();

// Get all patients for caregiver
router.get('/', authenticateToken, async (req, res) => {
  try {
    const patients = await Patient.find({
      caregiver_id: req.user.id,
      is_active: true
    }).sort({ created_at: -1 });

    // Enrich with medication count and today's stats
    const enrichedPatients = await Promise.all(patients.map(async (patient) => {
      const patientObj = patient.toObject();
      patientObj.id = patientObj._id;

      // Medication count
      const medicationCount = await Medication.countDocuments({
        patient_id: patient._id,
        is_active: true
      });

      // Today's dose stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayTaken = await Dose.countDocuments({
        patient_id: patient._id,
        status: 'taken',
        scheduled_time: { $gte: today, $lt: tomorrow }
      });

      const todayMissed = await Dose.countDocuments({
        patient_id: patient._id,
        status: 'missed',
        scheduled_time: { $gte: today, $lt: tomorrow }
      });

      return {
        ...patientObj,
        medication_count: medicationCount,
        today_taken: todayTaken,
        today_missed: todayMissed
      };
    }));

    res.json({ patients: enrichedPatients });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single patient
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify patient belongs to caregiver
    const patient = await Patient.findOne({
      _id: id,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patientObj = patient.toObject();
    patientObj.id = patientObj._id;

    // Get medications count
    const medicationCount = await Medication.countDocuments({
      patient_id: id,
      is_active: true
    });

    // Get today's adherence
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const taken = await Dose.countDocuments({
      patient_id: id,
      status: 'taken',
      scheduled_time: { $gte: today, $lt: tomorrow }
    });
    const missed = await Dose.countDocuments({
      patient_id: id,
      status: 'missed',
      scheduled_time: { $gte: today, $lt: tomorrow }
    });
    const pending = await Dose.countDocuments({
      patient_id: id,
      status: 'pending',
      scheduled_time: { $gte: today, $lt: tomorrow }
    });

    // Get device status
    const device = await Device.findOne({ patient_id: id }).sort({ created_at: -1 });

    res.json({
      patient: {
        ...patientObj,
        medication_count: medicationCount,
        today_stats: { taken, missed, pending },
        device: device ? device.toObject() : null
      }
    });
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create patient (paid feature - 50rs)
router.post('/', authenticateToken, validatePatient, async (req, res) => {
  try {
    const {
      name,
      age,
      gender,
      relationship,
      allergies,
      medical_conditions,
      emergency_contact,
      doctor_name,
      doctor_contact
    } = req.body;

    // Generate patient credentials
    const patientEmail = `patient_${crypto.randomBytes(8).toString('hex')}@caresure.local`;
    // Generate a more user-friendly password
    const passwordChars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
    let patientPassword = '';
    for (let i = 0; i < 12; i++) {
      patientPassword += passwordChars.charAt(Math.floor(Math.random() * passwordChars.length));
    }
    const passwordHash = await bcrypt.hash(patientPassword, 10);

    // Create patient
    const patient = await Patient.create({
      caregiver_id: req.user.id,
      name,
      age,
      gender,
      relationship,
      allergies,
      medical_conditions,
      emergency_contact,
      doctor_name,
      doctor_contact,
      patient_credentials_email: patientEmail,
      patient_credentials_password: passwordHash
    });

    const patientObj = patient.toObject();
    patientObj.id = patientObj._id;

    res.status(201).json({
      message: 'Patient created successfully',
      patient: {
        ...patientObj,
        patient_credentials: {
          email: patientEmail,
          password: patientPassword // Only shown once
        }
      }
    });
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update patient
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, age, gender, relationship, allergies,
      medical_conditions, emergency_contact, doctor_name, doctor_contact
    } = req.body;

    // Verify ownership
    const existingPatient = await Patient.findOne({
      _id: id,
      caregiver_id: req.user.id
    });

    if (!existingPatient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (age !== undefined) updateData.age = age;
    if (gender !== undefined) updateData.gender = gender;
    if (relationship !== undefined) updateData.relationship = relationship;
    if (allergies !== undefined) updateData.allergies = allergies;
    if (medical_conditions !== undefined) updateData.medical_conditions = medical_conditions;
    if (emergency_contact !== undefined) updateData.emergency_contact = emergency_contact;
    if (doctor_name !== undefined) updateData.doctor_name = doctor_name;
    if (doctor_contact !== undefined) updateData.doctor_contact = doctor_contact;

    const patient = await Patient.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    const patientObj = patient.toObject();
    patientObj.id = patientObj._id;

    res.json({
      message: 'Patient updated successfully',
      patient: patientObj
    });
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete patient (soft delete)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existingPatient = await Patient.findOne({
      _id: id,
      caregiver_id: req.user.id
    });

    if (!existingPatient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    await Patient.findByIdAndUpdate(id, {
      $set: { is_active: false }
    });

    res.json({ message: 'Patient deleted successfully' });
  } catch (error) {
    console.error('Delete patient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
