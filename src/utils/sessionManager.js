/**
 * Session Manager
 * 
 * Manages active sessions and provides a way to identify the current session
 * based on the active transport connection.
 */

// Map of transport instances to session IDs
const transportSessionMap = new WeakMap();

// Currently active transport (for stdio)
let activeTransport = null;
let activeSessionId = 'local-user';

/**
 * Register a transport with its session ID
 * @param {object} transport - Transport instance
 * @param {string} sessionId - Session ID
 */
export function registerTransportSession(transport, sessionId) {
  if (transport && sessionId) {
    transportSessionMap.set(transport, sessionId);
  }
}

/**
 * Get session ID for a transport
 * @param {object} transport - Transport instance
 * @returns {string} Session ID or 'local-user' as default
 */
export function getTransportSessionId(transport) {
  if (!transport) {
    return activeSessionId;
  }
  return transportSessionMap.get(transport) || 'local-user';
}

/**
 * Set the active transport (for stdio mode)
 * @param {object} transport - Transport instance
 * @param {string} sessionId - Session ID (optional)
 */
export function setActiveTransport(transport, sessionId = 'local-user') {
  activeTransport = transport;
  activeSessionId = sessionId;
}

/**
 * Get the current session ID
 * This is a fallback method when we can't determine the transport
 * @returns {string} Session ID
 */
export function getCurrentSessionId() {
  // For stdio transport or when we can't determine the transport
  return activeSessionId;
}

/**
 * Clear session for a transport
 * @param {object} transport - Transport instance
 */
export function clearTransportSession(transport) {
  if (transport) {
    transportSessionMap.delete(transport);
  }
}