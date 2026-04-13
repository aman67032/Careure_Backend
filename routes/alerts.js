const express = require('express');
const { Alert, Patient } = require('../models');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all alerts for caregiver
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { type, is_read, patient_id } = req.query;

    const filter = { caregiver_id: req.user.id };

    if (type) {
      filter.alert_type = type;
    }

    if (is_read !== undefined) {
      filter.is_read = is_read === 'true';
    }

    if (patient_id) {
      filter.patient_id = patient_id;
    }

    const alerts = await Alert.find(filter)
      .sort({ created_at: -1 })
      .limit(50);

    // Enrich with patient names
    const enrichedAlerts = await Promise.all(alerts.map(async (alert) => {
      const alertObj = alert.toObject();
      alertObj.id = alertObj._id;

      if (alert.patient_id) {
        const patient = await Patient.findById(alert.patient_id).select('name');
        alertObj.patient_name = patient ? patient.name : null;
      }

      return alertObj;
    }));

    res.json({ alerts: enrichedAlerts });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark alert as read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const alert = await Alert.findOneAndUpdate(
      { _id: id, caregiver_id: req.user.id },
      { $set: { is_read: true } },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const alertObj = alert.toObject();
    alertObj.id = alertObj._id;

    res.json({ message: 'Alert marked as read', alert: alertObj });
  } catch (error) {
    console.error('Mark alert read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark all alerts as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await Alert.updateMany(
      { caregiver_id: req.user.id, is_read: false },
      { $set: { is_read: true } }
    );

    res.json({ message: 'All alerts marked as read' });
  } catch (error) {
    console.error('Mark all alerts read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get unread count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const count = await Alert.countDocuments({
      caregiver_id: req.user.id,
      is_read: false
    });

    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
