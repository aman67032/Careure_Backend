const connectDB = require('./database');

// Import all models to ensure they are registered with Mongoose
require('../models');

const initDatabase = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    
    await connectDB();
    
    console.log('✅ Database connected and models registered successfully');
    console.log('📋 Collections will be auto-created on first document insert');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
};

module.exports = initDatabase;
