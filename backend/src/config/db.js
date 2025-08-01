const { MongoClient } = require('mongodb');
const { logger } = require('../utils/secureLogger');
logger.debug('MongoDB module loaded');

// MongoDB Connection URL
const url = process.env.MONGODB_URI || 'mongodb://localhost:27017/SNAGZ';
logger.debug('Attempting to connect to MongoDB at:', url);

// Create a new MongoClient with options
const client = new MongoClient(url, {
  serverSelectionTimeoutMS: 5000, // 5 second timeout
  connectTimeoutMS: 5000,
  socketTimeoutMS: 5000,
  monitorCommands: true
});

// Add command monitoring
client.on('commandStarted', (event) => logger.debug('MongoDB command started:', event.commandName));
client.on('commandSucceeded', (event) => logger.debug('MongoDB command succeeded:', event.commandName));
client.on('commandFailed', (event) => logger.debug('MongoDB command failed:', event.commandName, event.failure));

logger.debug('MongoDB client created with timeout options');

// Connection function
async function connectToDatabase() {
  logger.debug('connectToDatabase function called');
  try {
    // Connect to the MongoDB server
    logger.debug('Attempting to connect...');
    await client.connect();
    logger.debug('Connected successfully to MongoDB server');
    
    // Test the connection
    const db = client.db();
    logger.debug('Got database instance');
    
    await db.command({ ping: 1 });
    logger.debug('Database ping successful');
    
    return db;
  } catch (error) {
    console.error('Detailed error connecting to MongoDB:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    process.exit(1); // Exit if we can't connect to the database
  }
}

// Get the customers collection
async function getCustomersCollection() {
  const db = await connectToDatabase();
  return db.collection('customers');
}

// Close the connection
async function closeConnection() {
  try {
    await client.close();
    logger.debug('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
    throw error;
  }
}

module.exports = {
  connectToDatabase,
  getCustomersCollection,
  closeConnection
};
