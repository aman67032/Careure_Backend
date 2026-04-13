const express = require('express');
const { Device, DeviceCompartment, DeviceEvent, Patient, Dose, Alert } = require('../models');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get device for a patient
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

    const device = await Device.findOne({ patient_id: patientId }).sort({ created_at: -1 });

    if (!device) {
      return res.json({ device: null, compartments: [] });
    }

    // Get compartments
    const compartments = await DeviceCompartment.find({ device_id: device._id })
      .populate('medication_id', 'name')
      .sort({ compartment_number: 1 });

    const compartmentData = compartments.map(c => {
      const obj = c.toObject();
      obj.id = obj._id;
      obj.medication_name = c.medication_id ? c.medication_id.name : null;
      return obj;
    });

    // Get recent events
    const events = await DeviceEvent.find({ device_id: device._id })
      .sort({ timestamp: -1 })
      .limit(20);

    const deviceObj = device.toObject();
    deviceObj.id = deviceObj._id;

    res.json({
      device: {
        ...deviceObj,
        compartments: compartmentData,
        recent_events: events.map(e => { const obj = e.toObject(); obj.id = obj._id; return obj; })
      }
    });
  } catch (error) {
    console.error('Get device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register/Connect device
router.post('/patient/:patientId/connect', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { device_id, device_name, connection_type = 'wifi' } = req.body;

    // Verify ownership
    const patient = await Patient.findOne({
      _id: patientId,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Check if device already exists
    let device = await Device.findOne({ device_id: device_id });

    if (device) {
      // Update existing device
      device = await Device.findOneAndUpdate(
        { device_id: device_id },
        {
          $set: {
            patient_id: patientId,
            device_name: device_name || device.device_name,
            connection_type: connection_type,
            is_connected: true,
            last_sync: new Date()
          }
        },
        { new: true }
      );
    } else {
      // Create new device
      device = await Device.create({
        patient_id: patientId,
        device_id: device_id,
        device_name: device_name,
        connection_type: connection_type,
        is_connected: true,
        last_sync: new Date()
      });
    }

    const deviceObj = device.toObject();
    deviceObj.id = deviceObj._id;

    res.status(201).json({
      message: 'Device connected successfully',
      device: deviceObj
    });
  } catch (error) {
    console.error('Connect device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update device status (called by hardware)
router.post('/:deviceId/status', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { battery_level, is_connected, compartments } = req.body;

    // Update device status
    const updateData = { last_sync: new Date() };
    if (battery_level !== undefined) updateData.battery_level = battery_level;
    if (is_connected !== undefined) updateData.is_connected = is_connected;

    await Device.findOneAndUpdate(
      { device_id: deviceId },
      { $set: updateData }
    );

    // Update compartments if provided
    if (compartments && Array.isArray(compartments)) {
      const device = await Device.findOne({ device_id: deviceId });

      if (device) {
        for (const comp of compartments) {
          await DeviceCompartment.findOneAndUpdate(
            { device_id: device._id, compartment_number: comp.number },
            {
              $set: {
                current_stock: comp.stock,
                medication_id: comp.medication_id
              }
            },
            { upsert: true, new: true }
          );
        }
      }
    }

    // Check for low battery
    if (battery_level < 20) {
      const device = await Device.findOne({ device_id: deviceId });

      if (device) {
        const patient = await Patient.findById(device.patient_id);

        if (patient) {
          await Alert.create({
            caregiver_id: patient.caregiver_id,
            patient_id: patient._id,
            alert_type: 'low_battery',
            title: 'Low Battery',
            message: 'Device battery is below 20%',
            severity: 'medium'
          });
        }
      }
    }

    res.json({ message: 'Device status updated' });
  } catch (error) {
    console.error('Update device status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Device event (lid opened, medication taken, etc.)
router.post('/:deviceId/event', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { event_type, compartment_number, event_data } = req.body;

    const device = await Device.findOne({ device_id: deviceId });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const patientId = device.patient_id;

    // Log event
    await DeviceEvent.create({
      device_id: device._id,
      event_type,
      compartment_number,
      event_data: event_data || {}
    });

    // If lid opened, try to match with scheduled dose
    if (event_type === 'lid_opened' && compartment_number) {
      const compartment = await DeviceCompartment.findOne({
        device_id: device._id,
        compartment_number: compartment_number
      });

      if (compartment && compartment.medication_id) {
        const medicationId = compartment.medication_id;
        const now = new Date();
        const windowStart = new Date(now.getTime() - 15 * 60000); // 15 min before
        const windowEnd = new Date(now.getTime() + 15 * 60000); // 15 min after

        // Find matching pending dose
        const dose = await Dose.findOne({
          patient_id: patientId,
          medication_id: medicationId,
          status: 'pending',
          scheduled_time: { $gte: windowStart, $lte: windowEnd }
        }).sort({ scheduled_time: 1 });

        if (dose) {
          // Mark dose as taken
          await Dose.findByIdAndUpdate(dose._id, {
            $set: {
              status: 'taken',
              taken_at: new Date(),
              taken_by: 'device',
              device_verified: true
            }
          });

          // Decrease stock
          await DeviceCompartment.findOneAndUpdate(
            { device_id: device._id, compartment_number: compartment_number },
            { $inc: { current_stock: -1 } }
          );

          // Ensure stock doesn't go below 0
          await DeviceCompartment.findOneAndUpdate(
            { device_id: device._id, compartment_number: compartment_number, current_stock: { $lt: 0 } },
            { $set: { current_stock: 0 } }
          );

          // Check low stock
          const updatedComp = await DeviceCompartment.findOne({
            device_id: device._id,
            compartment_number: compartment_number
          });

          if (updatedComp && updatedComp.current_stock <= updatedComp.low_stock_threshold) {
            const patient = await Patient.findById(patientId);

            if (patient) {
              await Alert.create({
                caregiver_id: patient.caregiver_id,
                patient_id: patientId,
                alert_type: 'low_stock',
                title: 'Low Stock Alert',
                message: `Medication in compartment ${compartment_number} is running low`,
                severity: 'medium'
              });
            }
          }
        }
      }
    }

    res.json({ message: 'Event recorded' });
  } catch (error) {
    console.error('Device event error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign medication to compartment
router.post('/patient/:patientId/compartment', authenticateToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { compartment_number, medication_id, current_stock } = req.body;

    // Verify ownership
    const patient = await Patient.findOne({
      _id: patientId,
      caregiver_id: req.user.id
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const device = await Device.findOne({ patient_id: patientId }).sort({ created_at: -1 });

    if (!device) {
      return res.status(404).json({ error: 'No device connected' });
    }

    await DeviceCompartment.findOneAndUpdate(
      { device_id: device._id, compartment_number: compartment_number },
      {
        $set: {
          medication_id: medication_id,
          current_stock: current_stock,
          last_refill: new Date()
        }
      },
      { upsert: true, new: true }
    );

    res.json({ message: 'Compartment assigned successfully' });
  } catch (error) {
    console.error('Assign compartment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
