const { v4: uuidv4 } = require('uuid');

// Internal map: sessionId -> { page, meta }
const sessions = new Map();

function createSession(page, meta = {}) {
  const id = uuidv4();
  sessions.set(id, { page, meta });
  return id;
}

function getSession(id) {
  return sessions.get(id);
}

function deleteSession(id) {
  sessions.delete(id);
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
}; 