const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  medication_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medication',
    required: true
  },
  time_slot: {
    type: String,
    required: true,
    trim: true
  },
  exact_time: {
    type: String,
    trim: true
  },
  time_window_start: {
    type: String,
    trim: true
  },
  time_window_end: {
    type: String,
    trim: true
  },
  food_rule: {
    type: String,
    trim: true
  },
  delay_on_meal_missed: {
    type: Boolean,
    default: false
  },
  notify_device: {
    type: Boolean,
    default: true
  },
  notify_mobile: {
    type: Boolean,
    default: true
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
reminderSchema.index({ medication_id: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
