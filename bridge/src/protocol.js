/**
 * PotassiumMCP Bridge — Protocol definitions
 * 
 * Shared constants and helpers for the JSON-RPC-style protocol
 * used between the bridge and the in-game agent.
 */

import { randomUUID } from 'node:crypto';

// ── Message types ──────────────────────────────────────────────

export const MessageType = {
  REQUEST:  'request',
  RESPONSE: 'response',
  ERROR:    'error',
  LOG:      'log',
};

// ── Error codes ────────────────────────────────────────────────

export const ErrorCode = {
  INSTANCE_NOT_FOUND: 'INSTANCE_NOT_FOUND',
  TIMEOUT:            'TIMEOUT',
  PERMISSION_DENIED:  'PERMISSION_DENIED',
  SAFETY_BLOCKED:     'SAFETY_BLOCKED',
  SERIALIZE_ERROR:    'SERIALIZE_ERROR',
  INTERNAL_ERROR:     'INTERNAL_ERROR',
  UNKNOWN_METHOD:     'UNKNOWN_METHOD',
  INVALID_PARAMS:     'INVALID_PARAMS',
};

// ── Known tools ────────────────────────────────────────────────

export const Tools = [
  'scan_remotes',
  'call_remote',
  'snapshot_state',
  'search_scripts',
  'get_connections',
  'inspect_instance',
  'snapshot_diff',
  'get_game_info',
  'execute_probe',
  'read_log',
  // Advanced tools
  'spy_remotes',
  'decompile_script',
  'get_upvalues',
  'get_environment',
  'detect_anticheat',
  'http_spy',
  'find_instances',
  'monitor_changes',
  // Exploit tools
  'fire_signal',
  'fuzz_remote',
  'execute_lua',
];

// ── Envelope helpers ───────────────────────────────────────────

/**
 * Create a request envelope to send to the agent.
 * @param {string} method - Tool name
 * @param {object} params - Tool parameters
 * @returns {object} Request envelope
 */
export function createRequest(method, params = {}) {
  return {
    version: '1.0',
    request_id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: MessageType.REQUEST,
    method,
    params,
  };
}

/**
 * Create an error envelope.
 * @param {string} requestId
 * @param {string} code - ErrorCode value
 * @param {string} message
 * @returns {object}
 */
export function createError(requestId, code, message) {
  return {
    version: '1.0',
    request_id: requestId,
    timestamp: new Date().toISOString(),
    type: MessageType.ERROR,
    error: { code, message },
  };
}

/**
 * Validate that a message has the expected envelope shape.
 * @param {object} msg
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateEnvelope(msg) {
  if (!msg || typeof msg !== 'object') {
    return { valid: false, reason: 'Message is not an object' };
  }
  if (!msg.request_id) {
    return { valid: false, reason: 'Missing request_id' };
  }
  if (!msg.type || !Object.values(MessageType).includes(msg.type)) {
    return { valid: false, reason: `Invalid type: ${msg.type}` };
  }
  return { valid: true };
}
