const express = require('express');
const { Caregiver, Patient, Medication, Alert } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(isAdmin);

// Helper function to mask sensitive data
const maskEmail = (email) => {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return email;
  return `${local.substring(0, 2)}***@${domain}`;
};

const maskPhone = (phone) => {
  if (!phone) return '';
  if (phone.length <= 4) return '***';
  return `***${phone.slice(-4)}`;
};

// Get all caregivers (with privacy masking)
router.get('/caregivers', async (req, res) => {
  try {
    const caregivers = await Caregiver.find()
      .select('name email phone created_at updated_at')
      .sort({ created_at: -1 });

    // Mask sensitive data for privacy
    const maskedCaregivers = caregivers.map(c => {
      const obj = c.toObject();
      obj.id = obj._id;
      return {
        ...obj,
        email: maskEmail(obj.email),
        phone: maskPhone(obj.phone),
      };
    });

    res.json({ 
      total: maskedCaregivers.length,
      caregivers: maskedCaregivers 
    });
  } catch (error) {
    console.error('Get caregivers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all patients (with privacy masking)
router.get('/patients', async (req, res) => {
  try {
    const patients = await Patient.find()
      .select('name age gender relationship created_at caregiver_id')
      .sort({ created_at: -1 });

    // Enrich with caregiver data
    const enrichedPatients = await Promise.all(patients.map(async (p) => {
      const pObj = p.toObject();
      pObj.id = pObj._id;

      const caregiver = await Caregiver.findById(p.caregiver_id).select('name email');
      pObj.caregiver_name = caregiver ? caregiver.name : 'Unknown';
      pObj.caregiver_email = caregiver ? maskEmail(caregiver.email) : '';

      return pObj;
    }));

    res.json({ 
      total: enrichedPatients.length,
      patients: enrichedPatients 
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all medications
router.get('/medications', async (req, res) => {
  try {
    const medications = await Medication.find()
      .select('name strength dose_per_intake frequency is_active created_at patient_id')
      .sort({ created_at: -1 });

    // Enrich with patient and caregiver data
    const enrichedMeds = await Promise.all(medications.map(async (m) => {
      const mObj = m.toObject();
      mObj.id = mObj._id;

      const patient = await Patient.findById(m.patient_id).select('name caregiver_id');
      mObj.patient_name = patient ? patient.name : 'Unknown';

      if (patient) {
        const caregiver = await Caregiver.findById(patient.caregiver_id).select('name');
        mObj.caregiver_name = caregiver ? caregiver.name : 'Unknown';
      } else {
        mObj.caregiver_name = 'Unknown';
      }

      return mObj;
    }));

    res.json({ 
      total: enrichedMeds.length,
      medications: enrichedMeds 
    });
  } catch (error) {
    console.error('Get medications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all alerts
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await Alert.find()
      .select('alert_type title message severity is_read created_at patient_id caregiver_id')
      .sort({ created_at: -1 })
      .limit(100);

    // Enrich with patient and caregiver data
    const enrichedAlerts = await Promise.all(alerts.map(async (a) => {
      const aObj = a.toObject();
      aObj.id = aObj._id;

      const patient = await Patient.findById(a.patient_id).select('name');
      aObj.patient_name = patient ? patient.name : 'Unknown';

      const caregiver = await Caregiver.findById(a.caregiver_id).select('name');
      aObj.caregiver_name = caregiver ? caregiver.name : 'Unknown';

      return aObj;
    }));

    res.json({ 
      total: enrichedAlerts.length,
      alerts: enrichedAlerts 
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get login activity (from caregivers table created_at as proxy)
router.get('/login-activity', async (req, res) => {
  try {
    // Get recent registrations (as proxy for login activity)
    const caregivers = await Caregiver.find()
      .select('name email created_at')
      .sort({ created_at: -1 })
      .limit(50);

    // Mask sensitive data
    const activity = caregivers.map(c => {
      const obj = c.toObject();
      obj.id = obj._id;
      return {
        ...obj,
        email: maskEmail(obj.email),
        last_activity: obj.created_at,
        activity_type: 'registration'
      };
    });

    res.json({ 
      total: activity.length,
      activity 
    });
  } catch (error) {
    console.error('Get login activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const [totalCaregivers, totalPatients, activeMedications, unreadAlerts] = await Promise.all([
      Caregiver.countDocuments(),
      Patient.countDocuments(),
      Medication.countDocuments({ is_active: true }),
      Alert.countDocuments({ is_read: false }),
    ]);

    res.json({
      stats: {
        totalCaregivers,
        totalPatients,
        activeMedications,
        unreadAlerts,
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
