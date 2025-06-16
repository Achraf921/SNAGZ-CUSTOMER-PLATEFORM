const { MongoClient } = require('mongodb');

// MongoDB Connection URL
const url = process.env.MONGODB_URI || 'mongodb://localhost:27017/SNAGZ';

// Create a new MongoClient
const client = new MongoClient(url);

// Connection function
async function connectToDatabase() {
  try {
    // Connect to the MongoDB server
    await client.connect();
    console.log('Connected successfully to MongoDB server');
    
    // Return the database instance
    return client.db();
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}

// Get the customers collection
async function getCustomersCollection() {
  const db = await connectToDatabase();
  return db.collection('customers');
}

// Close the connection
async function closeConnection() {
  await client.close();
  console.log('MongoDB connection closed');
}

module.exports = {
  connectToDatabase,
  getCustomersCollection,
  closeConnection
};
