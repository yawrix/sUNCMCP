/**
 * PotassiumMCP Bridge — Audit Logger
 * 
 * Append-only JSONL logger for audit trail compliance.
 * Every tool call and response is recorded.
 */

import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export class AuditLogger {
  /** @param {string} logDir - Directory to write logs to */
  constructor(logDir) {
    this.logDir = logDir;
    this.sessionId = `session_${Date.now()}`;
    this.logFile = join(logDir, `${this.sessionId}.jsonl`);
    this.consoleLevel = 'info';

    // Ensure log directory exists
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    this.#write({
      level: 'info',
      event: 'session_start',
      message: `Audit session started: ${this.sessionId}`,
    });
  }

  /**
   * Log levels (ordered): debug < info < warn < error
   */
  static LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

  /**
   * Log a tool request (outgoing to agent).
   */
  logRequest(requestId, method, params) {
    this.#write({
      level: 'info',
      event: 'request',
      request_id: requestId,
      method,
      params,
      tags: ['outgoing'],
    });
  }

  /**
   * Log a tool response (incoming from agent).
   */
  logResponse(requestId, method, result, elapsedMs) {
    this.#write({
      level: 'info',
      event: 'response',
      request_id: requestId,
      method,
      result_summary: result?.error ? 'error' : 'success',
      elapsed_ms: elapsedMs,
      tags: ['incoming'],
    });
  }

  /**
   * Log a safety policy event (blocked call, rate limit, etc).
   */
  logSafety(requestId, reason) {
    this.#write({
      level: 'warn',
      event: 'safety_blocked',
      request_id: requestId,
      reason,
      tags: ['safety'],
    });
  }

  /**
   * General log entry.
   * @param {'debug'|'info'|'warn'|'error'} level
   * @param {string} message
   * @param {object} [extra]
   */
  log(level, message, extra = {}) {
    this.#write({ level, event: 'general', message, ...extra });
  }

  info(message, extra)  { this.log('info', message, extra); }
  warn(message, extra)  { this.log('warn', message, extra); }
  error(message, extra) { this.log('error', message, extra); }
  debug(message, extra) { this.log('debug', message, extra); }

  // ── Internal ───────────────────────────────────────────────

  #write(entry) {
    const record = {
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      ...entry,
    };

    // Append to JSONL file
    try {
      appendFileSync(this.logFile, JSON.stringify(record) + '\n');
    } catch (err) {
      console.error('[AuditLogger] Failed to write log:', err.message);
    }

    // Console output (respecting level filter)
    const levelNum = AuditLogger.LEVELS[entry.level] ?? 1;
    const filterNum = AuditLogger.LEVELS[this.consoleLevel] ?? 1;
    if (levelNum >= filterNum) {
      const prefix = `[${entry.level.toUpperCase().padEnd(5)}]`;
      const msg = entry.message || entry.event || '';
      console.log(`${prefix} ${msg}`, entry.request_id ? `(${entry.request_id.slice(0, 8)})` : '');
    }
  }
}
