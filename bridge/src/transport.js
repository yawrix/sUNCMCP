/**
 * PotassiumMCP — File-based IPC Transport
 * 
 * Communicates with the in-game Lua agent via temporary files in
 * Potassium's workspace directory. Files are automatically cleaned
 * up after processing — nothing accumulates on disk.
 * 
 * File layout (inside Potassium workspace):
 *   potassiumMCP/in/   ← bridge writes requests here
 *   potassiumMCP/out/  ← agent writes responses here
 * 
 * Both directories are auto-cleaned: the agent deletes requests
 * after reading, and the bridge deletes responses after reading.
 */

import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync, watch } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

export class FileTransport extends EventEmitter {
  /**
   * @param {string} workspaceDir - Potassium's workspace directory on the host filesystem
   * @param {object} [options]
   * @param {number} [options.pollIntervalMs=250]
   * @param {boolean} [options.useWatcher=true] - Use fs.watch in addition to polling
   */
  constructor(workspaceDir, options = {}) {
    super();
    this.workspaceDir = workspaceDir;
    this.baseDir = join(workspaceDir, 'potassiumMCP');
    this.inDir = join(this.baseDir, 'in');
    this.outDir = join(this.baseDir, 'out');

    this.pollIntervalMs = options.pollIntervalMs ?? 250;
    this.useWatcher = options.useWatcher ?? true;

    this._pollTimer = null;
    this._watcher = null;
    this._processing = false;
    this._pendingCallbacks = new Map(); // request_id → { resolve, reject, timeout }
  }

  /**
   * Initialize directories and start watching for responses.
   */
  start() {
    for (const dir of [this.baseDir, this.inDir, this.outDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Start polling for responses
    this._pollTimer = setInterval(() => this._pollResponses(), this.pollIntervalMs);

    // Optionally use fs.watch for faster response detection
    if (this.useWatcher) {
      try {
        this._watcher = watch(this.outDir, (eventType, filename) => {
          if (filename && filename.endsWith('.json')) {
            this._pollResponses();
          }
        });
      } catch {
        // Watcher failed; polling will handle it
      }
    }

    this.emit('started', { inDir: this.inDir, outDir: this.outDir });
  }

  /**
   * Stop watching and clean up.
   */
  stop() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
    for (const [id, cb] of this._pendingCallbacks) {
      clearTimeout(cb.timeout);
      cb.reject(new Error('Transport stopped'));
    }
    this._pendingCallbacks.clear();
    this.emit('stopped');
  }

  /**
   * Send a request to the agent and wait for the response.
   * @param {object} envelope - Request envelope from protocol.createRequest()
   * @param {number} [timeoutMs=10000]
   * @returns {Promise<object>} Response envelope
   */
  send(envelope, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const requestId = envelope.request_id;
      const filename = `${Date.now()}_${requestId}.json`;
      const filepath = join(this.inDir, filename);

      try {
        writeFileSync(filepath, JSON.stringify(envelope, null, 2));
      } catch (err) {
        reject(new Error(`Failed to write request file: ${err.message}`));
        return;
      }

      const timer = setTimeout(() => {
        this._pendingCallbacks.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this._pendingCallbacks.set(requestId, { resolve, reject, timeout: timer });
      this.emit('request_sent', { request_id: requestId, filename });
    });
  }

  // ── Internal ───────────────────────────────────────────────

  _pollResponses() {
    if (this._processing) return;
    this._processing = true;

    try {
      if (!existsSync(this.outDir)) return;

      const files = readdirSync(this.outDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        const filepath = join(this.outDir, file);
        try {
          const content = readFileSync(filepath, 'utf-8');
          const msg = JSON.parse(content);

          // Delete the file immediately — no archiving, zero disk buildup
          try { unlinkSync(filepath); } catch { /* already gone */ }

          // Match to pending request
          if (msg.request_id && this._pendingCallbacks.has(msg.request_id)) {
            const cb = this._pendingCallbacks.get(msg.request_id);
            clearTimeout(cb.timeout);
            this._pendingCallbacks.delete(msg.request_id);
            cb.resolve(msg);
          }

          this.emit('response_received', msg);
        } catch (err) {
          this.emit('parse_error', { file, error: err.message });
        }
      }
    } finally {
      this._processing = false;
    }
  }
}

