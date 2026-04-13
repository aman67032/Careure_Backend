const express = require('express');
const { Medication, Patient, Reminder } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { validateMedication } = require('../middleware/validate');

const router = express.Router();

// Get all medications for a patient
router.get('/patient/:patientId', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;

    // Verify patient belongs to caregiver
    const patient = await Patient.findOne({
      _id: patientId,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const medications = await Medication.find({
      patient_id: patientId,
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

      medObj.reminder_count = reminders.length;
      medObj.time_slots = [...new Set(reminders.map(r => r.time_slot))].join(', ');

      return medObj;
    }));

    res.json({ medications: enrichedMeds });
  } catch (error) {
    console.error('Get medications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single medication with reminders
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const medication = await Medication.findById(id);

    if (!medication) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    // Verify ownership through patient
    const patient = await Patient.findOne({
      _id: medication.patient_id,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const reminders = await Reminder.find({
      medication_id: id,
      is_active: true
    }).sort({ exact_time: 1 });

    const medObj = medication.toObject();
    medObj.id = medObj._id;

    res.json({
      medication: medObj,
      reminders: reminders.map(r => { const obj = r.toObject(); obj.id = obj._id; return obj; })
    });
  } catch (error) {
    console.error('Get medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add medication (manual entry)
router.post('/patient/:patientId', authenticateToken, validateMedication, async (req, res) => {
  try {
    const { patientId } = req.params;
    const {
      name, strength, dose_per_intake, frequency,
      food_rule, duration_days, notes
    } = req.body;

    // Verify patient belongs to caregiver
    const patient = await Patient.findOne({
      _id: patientId,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const medication = await Medication.create({
      patient_id: patientId,
      name,
      strength,
      dose_per_intake,
      frequency,
      food_rule,
      duration_days,
      notes
    });

    const medObj = medication.toObject();
    medObj.id = medObj._id;

    res.status(201).json({
      message: 'Medication added successfully',
      medication: medObj
    });
  } catch (error) {
    console.error('Add medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// OCR Prescription Upload (simulated)
router.post('/patient/:patientId/ocr', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { medicines } = req.body; // Array of extracted medicines

    // Verify patient belongs to caregiver
    const patient = await Patient.findOne({
      _id: patientId,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    if (!Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({ error: 'No medicines found in prescription' });
    }

    // Create medications from OCR results
    const createdMedications = [];
    for (const med of medicines) {
      const medication = await Medication.create({
        patient_id: patientId,
        name: med.name || 'Unknown Medicine',
        strength: med.strength || null,
        dose_per_intake: med.dose_per_intake || '1',
        frequency: med.frequency || 'once',
        food_rule: med.food_rule || null,
        notes: med.notes || 'Extracted from prescription'
      });

      const medObj = medication.toObject();
      medObj.id = medObj._id;
      createdMedications.push(medObj);
    }

    res.status(201).json({
      message: 'Medications extracted and saved',
      medications: createdMedications
    });
  } catch (error) {
    console.error('OCR medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update medication
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, strength, dose_per_intake, frequency,
      food_rule, duration_days, notes
    } = req.body;

    // Verify ownership
    const medication = await Medication.findById(id);
    if (!medication) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    const patient = await Patient.findOne({
      _id: medication.patient_id,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (strength !== undefined) updateData.strength = strength;
    if (dose_per_intake !== undefined) updateData.dose_per_intake = dose_per_intake;
    if (frequency !== undefined) updateData.frequency = frequency;
    if (food_rule !== undefined) updateData.food_rule = food_rule;
    if (duration_days !== undefined) updateData.duration_days = duration_days;
    if (notes !== undefined) updateData.notes = notes;

    const updatedMed = await Medication.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    const medObj = updatedMed.toObject();
    medObj.id = medObj._id;

    res.json({
      message: 'Medication updated successfully',
      medication: medObj
    });
  } catch (error) {
    console.error('Update medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete medication
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const medication = await Medication.findById(id);
    if (!medication) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    const patient = await Patient.findOne({
      _id: medication.patient_id,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    await Medication.findByIdAndUpdate(id, {
      $set: { is_active: false }
    });

    res.json({ message: 'Medication deleted successfully' });
  } catch (error) {
    console.error('Delete medication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
