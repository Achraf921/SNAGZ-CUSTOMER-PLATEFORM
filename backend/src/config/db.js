const { MongoClient } = require('mongodb');
console.log('MongoDB module loaded');

// MongoDB Connection URL
const url = process.env.MONGODB_URI || 'mongodb://localhost:27017/SNAGZ';
console.log('Attempting to connect to MongoDB at:', url);

// Create a new MongoClient with options
const client = new MongoClient(url, {
  serverSelectionTimeoutMS: 5000, // 5 second timeout
  connectTimeoutMS: 5000,
  socketTimeoutMS: 5000,
  monitorCommands: true
});

// Add command monitoring
client.on('commandStarted', (event) => console.log('MongoDB command started:', event.commandName));
client.on('commandSucceeded', (event) => console.log('MongoDB command succeeded:', event.commandName));
client.on('commandFailed', (event) => console.log('MongoDB command failed:', event.commandName, event.failure));

console.log('MongoDB client created with timeout options');

// Connection function
async function connectToDatabase() {
  console.log('connectToDatabase function called');
  try {
    // Connect to the MongoDB server
    console.log('Attempting to connect...');
    await client.connect();
    console.log('Connected successfully to MongoDB server');
    
    // Test the connection
    const db = client.db();
    console.log('Got database instance');
    
    await db.command({ ping: 1 });
    console.log('Database ping successful');
    
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
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    throw error;
  }
}

module.exports = {
  connectToDatabase,
  getCustomersCollection,
  closeConnection
};
