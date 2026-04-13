const mongoose = require('mongoose');

const deviceEventSchema = new mongoose.Schema({
  device_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true
  },
  event_type: {
    type: String,
    required: true,
    trim: true
  },
  compartment_number: {
    type: Number
  },
  event_data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('DeviceEvent', deviceEventSchema);
