const express = require('express');
const { Reminder, Medication, Patient, Dose, Alert, AdherenceLog } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const cron = require('node-cron');

const router = express.Router();

// Get reminders for a medication
router.get('/medication/:medicationId', authenticateToken, async (req, res) => {
  try {
    const { medicationId } = req.params;

    // Verify ownership
    const medication = await Medication.findById(medicationId);
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

    const reminders = await Reminder.find({
      medication_id: medicationId,
      is_active: true
    }).sort({ exact_time: 1 });

    res.json({ reminders: reminders.map(r => { const obj = r.toObject(); obj.id = obj._id; return obj; }) });
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set reminders for a medication
router.post('/medication/:medicationId', authenticateToken, async (req, res) => {
  try {
    const { medicationId } = req.params;
    const { reminders } = req.body; // Array of reminder objects

    // Verify ownership
    const medication = await Medication.findById(medicationId);
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

    const patientId = medication.patient_id;

    // Deactivate existing reminders
    await Reminder.updateMany(
      { medication_id: medicationId },
      { $set: { is_active: false } }
    );

    // Create new reminders
    const createdReminders = [];
    for (const reminder of reminders) {
      const newReminder = await Reminder.create({
        medication_id: medicationId,
        time_slot: reminder.time_slot,
        exact_time: reminder.exact_time,
        time_window_start: reminder.time_window_start,
        time_window_end: reminder.time_window_end,
        food_rule: reminder.food_rule,
        delay_on_meal_missed: reminder.delay_on_meal_missed || false,
        notify_device: reminder.notify_device !== false,
        notify_mobile: reminder.notify_mobile !== false
      });

      const reminderObj = newReminder.toObject();
      reminderObj.id = reminderObj._id;
      createdReminders.push(reminderObj);

      // Schedule doses for next 30 days
      await scheduleDoses(patientId, medicationId, newReminder._id, reminder);
    }

    res.status(201).json({
      message: 'Reminders set successfully',
      reminders: createdReminders
    });
  } catch (error) {
    console.error('Set reminders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to schedule doses
async function scheduleDoses(patientId, medicationId, reminderId, reminder) {
  try {
    const [hours, minutes] = reminder.exact_time.split(':').map(Number);

    console.log(`📅 Scheduling doses for patient ${patientId}, medication ${medicationId}, reminder ${reminderId}, time ${hours}:${minutes}`);

    // Schedule doses for the next 30 days starting from TODAY
    for (let i = 0; i < 30; i++) {
      try {
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + i);
        scheduledDate.setHours(hours, minutes, 0, 0);

        // Check if dose already exists
        const existingDose = await Dose.findOne({
          reminder_id: reminderId,
          patient_id: patientId,
          scheduled_time: {
            $gte: new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate()),
            $lt: new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate() + 1)
          }
        });

        if (!existingDose) {
          const dose = await Dose.create({
            reminder_id: reminderId,
            medication_id: medicationId,
            patient_id: patientId,
            scheduled_time: scheduledDate,
            status: 'pending'
          });

          if (i === 0) {
            console.log(`✅ Created dose for TODAY: ${dose.scheduled_time}, Status: ${dose.status}`);
          } else {
            console.log(`Created dose for day ${i}: ${dose.scheduled_time}`);
          }
        } else {
          if (i === 0) {
            console.log(`⚠️ Dose already exists for today`);
          }
        }
      } catch (err) {
        console.error(`❌ Error inserting dose for day ${i}:`, err);
      }
    }
    console.log(`✅ Finished scheduling doses for reminder ${reminderId}`);
  } catch (error) {
    console.error('❌ Schedule doses error:', error);
  }
}

// Get today's reminders for a patient
router.get('/patient/:patientId/today', authenticateToken, async (req, res) => {
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const doses = await Dose.find({
      patient_id: patientId,
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
    console.error('Get today reminders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark dose as taken
router.post('/dose/:doseId/taken', authenticateToken, async (req, res) => {
  try {
    const { doseId } = req.params;
    const { taken_by = 'manual' } = req.body;

    // Verify ownership
    const dose = await Dose.findById(doseId);
    if (!dose) {
      return res.status(404).json({ error: 'Dose not found' });
    }

    const patient = await Patient.findOne({
      _id: dose.patient_id,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Dose not found' });
    }

    const delayMinutes = Math.floor((new Date() - new Date(dose.scheduled_time)) / 60000);

    await Dose.findByIdAndUpdate(doseId, {
      $set: {
        status: 'taken',
        taken_at: new Date(),
        taken_by: taken_by,
        delay_minutes: delayMinutes
      }
    });

    // Update adherence log
    await updateAdherenceLog(dose.patient_id, dose.medication_id, dose.scheduled_time, 'taken');

    // If delay > 15 minutes, shift future doses
    if (delayMinutes > 15) {
      await shiftFutureDoses(dose.reminder_id, delayMinutes);
    }

    res.json({ message: 'Dose marked as taken' });
  } catch (error) {
    console.error('Mark dose taken error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark dose as missed
router.post('/dose/:doseId/missed', authenticateToken, async (req, res) => {
  try {
    const { doseId } = req.params;

    // Verify ownership
    const dose = await Dose.findById(doseId);
    if (!dose) {
      return res.status(404).json({ error: 'Dose not found' });
    }

    const patient = await Patient.findOne({
      _id: dose.patient_id,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Dose not found' });
    }

    await Dose.findByIdAndUpdate(doseId, {
      $set: {
        status: 'missed',
        missed_at: new Date()
      }
    });

    // Update adherence log
    await updateAdherenceLog(dose.patient_id, dose.medication_id, dose.scheduled_time, 'missed');

    // Create alert
    await Alert.create({
      caregiver_id: req.user.id,
      patient_id: dose.patient_id,
      alert_type: 'missed_dose',
      title: 'Missed Dose',
      message: `Patient missed medication dose at scheduled time`,
      severity: 'high'
    });

    res.json({ message: 'Dose marked as missed' });
  } catch (error) {
    console.error('Mark dose missed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: Update adherence log
async function updateAdherenceLog(patientId, medicationId, scheduledTime, status) {
  try {
    const date = new Date(scheduledTime);
    date.setHours(0, 0, 0, 0);

    const existingLog = await AdherenceLog.findOne({
      patient_id: patientId,
      medication_id: medicationId,
      date: date
    });

    if (existingLog) {
      const updateData = {
        $inc: {
          total_doses: 1,
          taken_doses: status === 'taken' ? 1 : 0,
          missed_doses: status === 'missed' ? 1 : 0
        }
      };

      await AdherenceLog.findByIdAndUpdate(existingLog._id, updateData);

      // Update adherence percentage
      const updatedLog = await AdherenceLog.findById(existingLog._id);
      if (updatedLog.total_doses > 0) {
        updatedLog.adherence_percentage = (updatedLog.taken_doses / updatedLog.total_doses) * 100;
        await updatedLog.save();
      }
    } else {
      await AdherenceLog.create({
        patient_id: patientId,
        medication_id: medicationId,
        date: date,
        total_doses: 1,
        taken_doses: status === 'taken' ? 1 : 0,
        missed_doses: status === 'missed' ? 1 : 0,
        adherence_percentage: status === 'taken' ? 100 : 0
      });
    }
  } catch (error) {
    console.error('Update adherence log error:', error);
  }
}

// Helper: Shift future doses if delay > 15 minutes
async function shiftFutureDoses(reminderId, delayMinutes) {
  try {
    const pendingDoses = await Dose.find({
      reminder_id: reminderId,
      status: 'pending',
      scheduled_time: { $gt: new Date() }
    });

    for (const dose of pendingDoses) {
      const newTime = new Date(dose.scheduled_time.getTime() + delayMinutes * 60000);
      await Dose.findByIdAndUpdate(dose._id, {
        $set: { scheduled_time: newTime }
      });
    }
  } catch (error) {
    console.error('Shift future doses error:', error);
  }
}

module.exports = router;
