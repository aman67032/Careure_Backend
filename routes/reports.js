const express = require('express');
const { AdherenceLog, Dose, Medication, Reminder, Patient } = require('../models');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get adherence report for patient
router.get('/patient/:patientId/adherence', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { start_date, end_date, medication_id } = req.query;

    // Verify ownership
    const patient = await Patient.findOne({
      _id: patientId,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const filter = { patient_id: patientId };

    if (start_date) {
      filter.date = filter.date || {};
      filter.date.$gte = new Date(start_date);
    }

    if (end_date) {
      filter.date = filter.date || {};
      filter.date.$lte = new Date(end_date);
    }

    if (medication_id) {
      filter.medication_id = medication_id;
    }

    const adherenceLogs = await AdherenceLog.find(filter)
      .sort({ date: -1 });

    // Enrich with medication names
    const enrichedLogs = await Promise.all(adherenceLogs.map(async (log) => {
      const logObj = log.toObject();
      logObj.id = logObj._id;

      const medication = await Medication.findById(log.medication_id);
      logObj.medication_name = medication ? medication.name : 'Unknown';

      return logObj;
    }));

    // Calculate summary
    const summary = {
      total_doses: 0,
      taken_doses: 0,
      missed_doses: 0,
      overall_adherence: 0
    };

    enrichedLogs.forEach(row => {
      summary.total_doses += row.total_doses || 0;
      summary.taken_doses += row.taken_doses || 0;
      summary.missed_doses += row.missed_doses || 0;
    });

    if (summary.total_doses > 0) {
      summary.overall_adherence = (summary.taken_doses / summary.total_doses) * 100;
    }

    res.json({
      adherence_data: enrichedLogs,
      summary
    });
  } catch (error) {
    console.error('Get adherence report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dose history
router.get('/patient/:patientId/doses', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { start_date, end_date, status } = req.query;

    // Verify ownership
    const patient = await Patient.findOne({
      _id: patientId,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const filter = { patient_id: patientId };

    if (start_date) {
      filter.scheduled_time = filter.scheduled_time || {};
      filter.scheduled_time.$gte = new Date(start_date);
    }

    if (end_date) {
      const endOfDay = new Date(end_date);
      endOfDay.setHours(23, 59, 59, 999);
      filter.scheduled_time = filter.scheduled_time || {};
      filter.scheduled_time.$lte = endOfDay;
    }

    if (status) {
      filter.status = status;
    }

    const doses = await Dose.find(filter)
      .sort({ scheduled_time: -1 })
      .limit(100);

    // Enrich with medication and reminder data
    const enrichedDoses = await Promise.all(doses.map(async (dose) => {
      const doseObj = dose.toObject();
      doseObj.id = doseObj._id;

      const medication = await Medication.findById(dose.medication_id);
      const reminder = await Reminder.findById(dose.reminder_id);

      if (medication) {
        doseObj.medication_name = medication.name;
        doseObj.strength = medication.strength;
      }
      if (reminder) {
        doseObj.time_slot = reminder.time_slot;
      }

      return doseObj;
    }));

    res.json({ doses: enrichedDoses });
  } catch (error) {
    console.error('Get dose history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dashboard stats
router.get('/patient/:patientId/dashboard', authenticateToken, async (req, res) => {
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

    // Today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const taken = await Dose.countDocuments({
      patient_id: patientId,
      status: 'taken',
      scheduled_time: { $gte: today, $lt: tomorrow }
    });
    const missed = await Dose.countDocuments({
      patient_id: patientId,
      status: 'missed',
      scheduled_time: { $gte: today, $lt: tomorrow }
    });
    const pending = await Dose.countDocuments({
      patient_id: patientId,
      status: 'pending',
      scheduled_time: { $gte: today, $lt: tomorrow }
    });
    const total = await Dose.countDocuments({
      patient_id: patientId,
      scheduled_time: { $gte: today, $lt: tomorrow }
    });

    // Weekly adherence
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const weeklyAdherence = await AdherenceLog.aggregate([
      {
        $match: {
          patient_id: patient._id,
          date: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          avg_adherence: { $avg: '$adherence_percentage' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Upcoming doses (next 24 hours)
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const upcomingDoses = await Dose.find({
      patient_id: patientId,
      status: 'pending',
      scheduled_time: { $gt: now, $lte: next24h }
    }).sort({ scheduled_time: 1 }).limit(10);

    // Enrich upcoming doses
    const enrichedUpcoming = await Promise.all(upcomingDoses.map(async (dose) => {
      const doseObj = dose.toObject();
      doseObj.id = doseObj._id;

      const medication = await Medication.findById(dose.medication_id);
      const reminder = await Reminder.findById(dose.reminder_id);

      if (medication) {
        doseObj.medication_name = medication.name;
        doseObj.strength = medication.strength;
      }
      if (reminder) {
        doseObj.time_slot = reminder.time_slot;
      }

      return doseObj;
    }));

    res.json({
      today_stats: { taken, missed, pending, total },
      weekly_adherence: weeklyAdherence.map(w => ({
        date: w._id,
        avg_adherence: w.avg_adherence
      })),
      upcoming_doses: enrichedUpcoming
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
