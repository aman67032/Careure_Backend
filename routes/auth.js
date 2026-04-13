const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Caregiver, Patient } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validate');

const router = express.Router();

// Register Caregiver - GET handler for helpful error message
router.get('/register', (req, res) => {
  res.status(405).json({
    error: 'Method Not Allowed',
    message: 'This endpoint requires a POST request. Use POST /api/auth/register with name, email, password, and phone in the request body.',
    example: {
      method: 'POST',
      url: '/api/auth/register',
      body: {
        name: 'John Doe',
        email: 'user@example.com',
        password: 'securepassword',
        phone: '1234567890'
      }
    }
  });
});

// Register Caregiver
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Prevent admin emails from being registered
    const adminEmails = process.env.ADMIN_EMAILS 
      ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim())
      : ['admin@jklu.edu.in', 'admin@caresure.com'];
    
    if (adminEmails.includes(email.toLowerCase())) {
      return res.status(403).json({ error: 'This email cannot be used for registration' });
    }

    // Check if email already exists
    const existingUser = await Caregiver.findOne({ email: email.toLowerCase() });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create caregiver
    const caregiver = await Caregiver.create({
      name,
      email,
      password_hash: passwordHash,
      phone
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: caregiver._id, email: caregiver.email },
      process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Caregiver registered successfully',
      token,
      caregiver: {
        id: caregiver._id,
        name: caregiver.name,
        email: caregiver.email,
        phone: caregiver.phone
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login Caregiver - GET handler for helpful error message
router.get('/login', (req, res) => {
  res.status(405).json({
    error: 'Method Not Allowed',
    message: 'This endpoint requires a POST request. Use POST /api/auth/login with email and password in the request body.',
    example: {
      method: 'POST',
      url: '/api/auth/login',
      body: {
        email: 'user@example.com',
        password: 'yourpassword'
      }
    }
  });
});

// Login Caregiver
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for email:', email);

    // Normalize email to lowercase for comparison
    const normalizedEmail = email.toLowerCase().trim();

    // Find caregiver (case-insensitive email search)
    const caregiver = await Caregiver.findOne({ email: normalizedEmail });

    if (!caregiver) {
      console.log('No caregiver found with email:', normalizedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('Caregiver found:', caregiver.email);

    // Verify password
    const isValidPassword = await bcrypt.compare(password, caregiver.password_hash);

    if (!isValidPassword) {
      console.log('Invalid password for email:', normalizedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('Password verified successfully for:', normalizedEmail);

    // Generate JWT token
    const token = jwt.sign(
      { id: caregiver._id, email: caregiver.email },
      process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production',
      { expiresIn: '7d' }
    );

    console.log('Token generated successfully for:', normalizedEmail);

    res.json({
      message: 'Login successful',
      token,
      caregiver: {
        id: caregiver._id,
        name: caregiver.name,
        email: caregiver.email,
        phone: caregiver.phone,
        emergency_contact: caregiver.emergency_contact,
        hasProfile: !!caregiver.emergency_contact
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Current Caregiver Profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const caregiver = await Caregiver.findById(req.user.id)
      .select('name email phone emergency_contact created_at');

    if (!caregiver) {
      return res.status(404).json({ error: 'Caregiver not found' });
    }

    res.json({ caregiver: { id: caregiver._id, ...caregiver.toObject() } });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Caregiver Profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone, emergency_contact } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (emergency_contact) updateData.emergency_contact = emergency_contact;

    const caregiver = await Caregiver.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true, select: 'name email phone emergency_contact' }
    );

    res.json({
      message: 'Profile updated successfully',
      caregiver: { id: caregiver._id, ...caregiver.toObject() }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Caregiver Change Password (requires current password)
router.post('/change-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Email, current password, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Find caregiver
    const caregiver = await Caregiver.findOne({ email: normalizedEmail });

    if (!caregiver) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, caregiver.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await Caregiver.findByIdAndUpdate(caregiver._id, {
      $set: { password_hash: newPasswordHash }
    });

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Patient Login
router.post('/patient/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Patient login attempt for email:', email);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();
    console.log('Normalized email:', normalizedEmail);

    // Find patient by email
    const patient = await Patient.findOne({
      patient_credentials_email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') },
      is_active: true
    });

    if (!patient) {
      console.log('No patient found with email:', normalizedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('Patient found:', patient.name, 'Email:', patient.patient_credentials_email);
    console.log('Password hash exists:', !!patient.patient_credentials_password);

    // Verify password
    const isValidPassword = await bcrypt.compare(password, patient.patient_credentials_password);
    console.log('Password verification result:', isValidPassword);

    if (!isValidPassword) {
      console.log('Invalid password for patient:', normalizedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('Password verified successfully for patient:', normalizedEmail);

    // Generate JWT token for patient
    const token = jwt.sign(
      { id: patient._id, email: patient.patient_credentials_email, type: 'patient' },
      process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production',
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login successful',
      token,
      patient: {
        id: patient._id,
        name: patient.name,
        email: patient.patient_credentials_email,
        password_changed: patient.password_changed
      }
    });
  } catch (error) {
    console.error('Patient login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Patient Change Password
router.post('/patient/change-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Email, current password, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Find patient
    const patient = await Patient.findOne({
      patient_credentials_email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') },
      is_active: true
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, patient.patient_credentials_password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password and mark as changed
    await Patient.findByIdAndUpdate(patient._id, {
      $set: {
        patient_credentials_password: newPasswordHash,
        password_changed: true
      }
    });

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
