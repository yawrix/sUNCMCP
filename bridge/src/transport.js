/**
 * PotassiumMCP — WebSocket-based Multi-Client Transport
 * 
 * Runs a local WebSocket server. In-game Lua dispatchers connect
 * to it using sUNC's WebSocket.connect(). No filesystem dependency,
 * no workspace paths — works with ANY executor.
 * 
 * Architecture:
 *   Bridge (this)          ← ws://localhost:PORT →          Dispatcher (Lua)
 *   Sends requests                                          Sends responses
 *   Tracks clients                                          Auto-registers on connect
 */

import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { WebSocketServer } from 'ws';

export class MultiClientTransport extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.port=38741]
   */
  constructor(options = {}) {
    super();
    this.port = options.port ?? 38741;

    /** @type {Map<string, ClientInfo>} client_id → { id, ws, status, player_name, ... } */
    this.clients = new Map();
    this._pendingCallbacks = new Map(); // request_id → { resolve, reject, timeout, client_id }
    this._wss = null;
    this._httpServer = null;
  }

  /**
   * Start the WebSocket server.
   */
  start() {
    this._httpServer = createServer();
    this._wss = new WebSocketServer({ server: this._httpServer });

    this._wss.on('connection', (ws) => {
      let clientId = null;

      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return; // ignore unparseable messages
        }

        // ── Registration message ──
        if (msg.type === 'register') {
          clientId = msg.client_id;
          if (!clientId) return;

          // If a client with this ID already exists, close the old connection
          if (this.clients.has(clientId)) {
            const old = this.clients.get(clientId);
            try { old.ws.close(); } catch { /* ignore */ }
          }

          this.clients.set(clientId, {
            id: clientId,
            ws,
            status: 'running',
            player_name: msg.player_name || 'Unknown',
            display_name: msg.display_name,
            place_id: msg.place_id,
            game_id: msg.game_id,
            game_name: msg.game_name,
            started_at: msg.started_at,
            version: msg.version,
          });

          this.emit('client_connected', {
            client_id: clientId,
            player_name: msg.player_name,
          });
          return;
        }

        // ── Response message (match to pending request) ──
        if (msg.request_id && this._pendingCallbacks.has(msg.request_id)) {
          const cb = this._pendingCallbacks.get(msg.request_id);
          clearTimeout(cb.timeout);
          this._pendingCallbacks.delete(msg.request_id);
          cb.resolve(msg);
        }

        this.emit('response_received', { client_id: clientId, ...msg });
      });

      ws.on('close', () => {
        if (clientId && this.clients.has(clientId)) {
          this.clients.delete(clientId);
          this.emit('client_disconnected', { client_id: clientId });
        }
      });

      ws.on('error', () => {
        if (clientId && this.clients.has(clientId)) {
          this.clients.delete(clientId);
          this.emit('client_disconnected', { client_id: clientId });
        }
      });
    });

    this._httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n[FATAL] Port ${this.port} is already in use.`);
        console.error(`[FATAL] This usually means another AI editor (or another instance of this MCP server) is already running and holding the WebSocket open.`);
        console.error(`[FATAL] Close other AI editors, or manually kill stray 'node.exe' processes in your task manager to force-release the port.\n`);
        process.exit(1);
      } else {
        console.error(`[FATAL] HTTP server error: ${err.message}`);
        process.exit(1);
      }
    });

    this._httpServer.listen(this.port, '127.0.0.1', () => {
      this.emit('started', { port: this.port });
    });
  }

  /**
   * Stop the WebSocket server and clean up.
   */
  stop() {
    for (const [id, cb] of this._pendingCallbacks) {
      clearTimeout(cb.timeout);
      cb.reject(new Error('Transport stopped'));
    }
    this._pendingCallbacks.clear();

    for (const [id, client] of this.clients) {
      try { client.ws.close(); } catch { /* ignore */ }
    }
    this.clients.clear();

    if (this._wss) {
      this._wss.close();
      this._wss = null;
    }
    if (this._httpServer) {
      this._httpServer.close();
      this._httpServer = null;
    }
    this.emit('stopped');
  }

  // ── Client Management ──────────────────────────────────────

  /**
   * Get all currently connected clients.
   */
  getClients() {
    return Array.from(this.clients.values())
      .filter(c => c.status === 'running')
      .map(c => ({
        client_id: c.id,
        player_name: c.player_name,
        display_name: c.display_name,
        place_id: c.place_id,
        game_id: c.game_id,
        game_name: c.game_name,
        started_at: c.started_at,
        version: c.version,
      }));
  }

  /**
   * Resolve a client_id. If null/undefined and only one client is connected,
   * auto-resolves. Throws if ambiguous.
   */
  resolveClient(clientId) {
    const running = this.getClients();

    if (clientId) {
      // Exact match
      if (this.clients.has(clientId) && this.clients.get(clientId).status === 'running') {
        return clientId;
      }
      // Partial match on player name (case-insensitive)
      const match = running.find(c =>
        c.player_name.toLowerCase() === clientId.toLowerCase() ||
        c.client_id.toLowerCase().startsWith(clientId.toLowerCase())
      );
      if (match) return match.client_id;
      throw new Error(`Client not found: "${clientId}". Connected clients: ${running.map(c => c.client_id).join(', ') || 'none'}`);
    }

    // Auto-resolve
    if (running.length === 0) {
      throw new Error('No clients connected. Inject the dispatcher into a Roblox game first.');
    }
    if (running.length === 1) {
      return running[0].client_id;
    }
    throw new Error(
      `Multiple clients connected — specify client_id. Use list_clients to see options.\n` +
      `Connected: ${running.map(c => `${c.client_id} (${c.player_name})`).join(', ')}`
    );
  }

  /**
   * Send a request to a specific client via its WebSocket connection.
   */
  send(clientId, envelope, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const client = this.clients.get(clientId);
      if (!client) {
        reject(new Error(`Client not found: ${clientId}`));
        return;
      }

      if (client.ws.readyState !== 1 /* WebSocket.OPEN */) {
        reject(new Error(`Client ${clientId} WebSocket is not open`));
        return;
      }

      const requestId = envelope.request_id;

      try {
        client.ws.send(JSON.stringify(envelope));
      } catch (err) {
        reject(new Error(`Failed to send to client: ${err.message}`));
        return;
      }

      const timer = setTimeout(() => {
        this._pendingCallbacks.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this._pendingCallbacks.set(requestId, { resolve, reject, timeout: timer, client_id: clientId });
      this.emit('request_sent', { request_id: requestId, client_id: clientId });
    });
  }

  /**
   * Broadcast a request to ALL connected clients.
   */
  async broadcast(envelope, timeoutMs = 10000) {
    const running = this.getClients();
    if (running.length === 0) {
      throw new Error('No clients connected.');
    }

    const results = new Map();
    const promises = running.map(async (client) => {
      const clientEnvelope = {
        ...envelope,
        request_id: `${envelope.request_id}_${client.client_id.slice(-4)}`,
      };
      try {
        const response = await this.send(client.client_id, clientEnvelope, timeoutMs);
        results.set(client.client_id, response);
      } catch (err) {
        results.set(client.client_id, { error: err.message });
      }
    });

    await Promise.all(promises);
    return results;
  }
}

// Backward compat
export { MultiClientTransport as FileTransport };
