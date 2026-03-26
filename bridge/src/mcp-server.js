/**
 * PotassiumMCP — MCP Server (Multi-Client, WebSocket Transport)
 * 
 * Exposes game security tools as MCP tools so your AI assistant
 * can call them directly from the chat window. Supports multiple
 * simultaneous Roblox client connections via WebSocket.
 * 
 * Your AI client (VS Code, Cursor, etc.) starts this automatically.
 * You never need to run it manually.
 */

// CRITICAL: Redirect console.log to stderr BEFORE anything else.
// MCP stdio transport uses stdout exclusively for JSON-RPC messages.
const originalLog = console.log;
console.log = (...args) => console.error(...args);

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MultiClientTransport } from './transport.js';
import { AuditLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Configuration ────────────────────────────────────────────

const configPath = join(__dirname, '..', '..', 'config', 'default.json');
let config = { safety: {}, logging: { level: 'info' }, ipc: {} };
if (existsSync(configPath)) {
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
}

const WS_PORT = config.ipc?.ws_port ?? 38741;

// ── Initialize bridge internals ──────────────────────────────

// Use a temp dir for logs since we no longer depend on executor workspace
import { tmpdir } from 'node:os';
const logDir = join(tmpdir(), 'potassiumMCP', 'logs');
const logger = new AuditLogger(logDir);
logger.consoleLevel = 'error';

const transport = new MultiClientTransport({
  port: WS_PORT,
});

const TIMEOUT_MS = config.ipc?.timeout_ms ?? 30000;

// ── Helper: call a tool through the multi-client transport ───

import { createRequest, validateEnvelope } from './protocol.js';

/**
 * Call a tool on a specific client (or auto-resolve if only one).
 */
async function callTool(method, params = {}, clientId = null) {
  // Resolve which client to send to
  const resolvedClientId = transport.resolveClient(clientId);
  
  const envelope = createRequest(method, params, resolvedClientId);
  logger.logRequest(envelope.request_id, method, params);

  const startTime = Date.now();
  const response = await transport.send(resolvedClientId, envelope, TIMEOUT_MS);
  const elapsed = Date.now() - startTime;
  logger.logResponse(envelope.request_id, method, response, elapsed);

  const validation = validateEnvelope(response);
  if (!validation.valid) {
    throw new Error(`Invalid response from agent: ${validation.reason}`);
  }

  if (response.type === 'error') {
    throw new Error(`Agent error [${response.error?.code}]: ${response.error?.message}`);
  }

  return response.result ?? response;
}

const SERVER_INSTRUCTIONS = `You are connected to live Roblox games through PotassiumMCP v1.2 with MULTI-CLIENT support via WebSocket. You have 23 tools that let you interact with games directly.

## Multi-Client Usage

Multiple Roblox clients can be connected simultaneously. Each has a unique client_id.

- **client_id is OPTIONAL on all tools.** If only 1 client is connected, it auto-targets that client.
- If multiple clients are connected and you don't specify client_id, you'll get an error listing the options.
- Use **list_clients** to see all connected clients (player names, games, etc.)
- Use **broadcast_lua** to run Lua on ALL clients at once (returns results from each).
- You can also use a player name as client_id — it does partial matching.

## Workflow for testing a game

1. RECON — Understand the game
   - list_clients: see all connected clients  
   - scan_remotes: find all RemoteEvents/Functions
   - search_scripts: find scripts related to economy, shops, trading
   - get_game_info: identify the game
   - detect_anticheat: assess risk before testing

2. ANALYZE — Read the code
   - decompile_script: get full source of any script
   - Look for FireServer calls — these are the attack surface
   - get_upvalues / get_environment: find hidden state and constants

3. TEST — Try to exploit
   - fire_signal FIRST if the game requires opening a shop/menu
   - fuzz_remote: blast a remote with 13 malicious payloads
   - call_remote: targeted tests with specific arguments
   - snapshot_diff: measure before/after state changes

4. CUSTOM — For anything else
   - execute_lua: run arbitrary Lua code on a specific client
   - broadcast_lua: run Lua on ALL clients simultaneously

## Tool reference

RECON: scan_remotes, search_scripts, find_instances, inspect_instance, get_game_info, get_connections
ANALYSIS: decompile_script, get_upvalues, get_environment, detect_anticheat
MONITORING: spy_remotes, http_spy, monitor_changes
TESTING: call_remote, fuzz_remote, execute_probe, snapshot_state, snapshot_diff
EXPLOIT: fire_signal, execute_lua, read_log
MULTI-CLIENT: list_clients, broadcast_lua

## Tips
- Instance paths use dots: "ReplicatedStorage.Remotes.BuyItem"
- execute_lua is the nuclear option — write any Lua for game-specific situations
- broadcast_lua runs on ALL clients — great for coordinated actions
- Always start with recon. Understand the game before testing.`;

const server = new McpServer({
  name: 'PotassiumMCP',
  version: '1.2.0',
  instructions: SERVER_INSTRUCTIONS,
});

// ── Helper: wrap a tool handler to extract and pass client_id ─

function clientTool(name, description, schema, handler) {
  const fullSchema = {
    ...schema,
    client_id: z.string().optional().describe('Target a specific client. Use list_clients to see connected clients. If omitted and only 1 client is connected, auto-targets it.'),
  };

  server.tool(name, description, fullSchema, async (params) => {
    const { client_id, ...toolParams } = params;
    return handler(toolParams, client_id);
  });
}

// Standard handler: forward to agent and return result
function forwardHandler(toolName) {
  return async (params, clientId) => {
    const result = await callTool(toolName, params, clientId);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  };
}

const JsonValue = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(JsonValue),
  z.record(JsonValue),
]));

// ── Tool: list_clients (local — no agent call) ───────────────

server.tool(
  'list_clients',
  'List all connected Roblox clients. Shows client_id, player name, game, and connection time for each. Use client_id from this list to target specific clients with other tools.',
  {},
  async () => {
    const clients = transport.getClients();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          connected: clients.length,
          clients,
        }, null, 2),
      }],
    };
  }
);

// ── Tool: broadcast_lua ──────────────────────────────────────

server.tool(
  'broadcast_lua',
  'Execute Lua code on ALL connected clients simultaneously. Returns results from each client. Great for coordinated actions across multiple accounts.',
  {
    code: z.string().describe('Lua code to execute on all clients. Use "return {...}" to send data back.'),
    description: z.string().optional().describe('What this code does (for logging)'),
  },
  async ({ code, description }) => {
    const envelope = createRequest('execute_lua', { code, description });
    const results = await transport.broadcast(envelope, TIMEOUT_MS);

    const output = {};
    for (const [clientId, response] of results) {
      if (response.error) {
        output[clientId] = { error: response.error };
      } else {
        output[clientId] = response.result ?? response;
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          clients_reached: results.size,
          results: output,
        }, null, 2),
      }],
    };
  }
);

// ── All existing tools (with client_id support) ──────────────

clientTool('scan_remotes',
  'Scan all client-visible RemoteEvents and RemoteFunctions in the Roblox game. Returns their names, classes, and full instance paths.',
  {
    filter: z.string().optional().describe('Lua pattern to filter remote names'),
    include_path: z.boolean().optional().describe('Include full Instance path (default: true)'),
  },
  forwardHandler('scan_remotes')
);

clientTool('call_remote',
  'Fire a RemoteEvent or invoke a RemoteFunction with specified arguments. Use this to test server-side handling of client calls.',
  {
    path: z.string().describe('Full Instance path, e.g. "ReplicatedStorage.Remotes.MyEvent"'),
    args: z.array(JsonValue).optional().describe('Arguments to pass to the remote'),
    timeout_ms: z.number().optional().describe('Timeout for RemoteFunction response (default: 5000)'),
  },
  forwardHandler('call_remote')
);

clientTool('snapshot_state',
  'Capture a structured snapshot of the local player state including character, backpack, leaderstats, and PlayerGui.',
  {
    sections: z.array(z.string()).optional().describe('Sections to capture: "character", "backpack", "leaderstats", "playergui", "playerdata"'),
    depth: z.number().optional().describe('Instance tree depth (default: 3)'),
  },
  forwardHandler('snapshot_state')
);

clientTool('search_scripts',
  'Search client-visible scripts by name pattern, content pattern, or class. Can decompile and return source code.',
  {
    name_pattern: z.string().optional().describe('Lua pattern to match script names'),
    content_pattern: z.string().optional().describe('Lua pattern to search in decompiled source'),
    class_filter: z.enum(['LocalScript', 'ModuleScript', 'all']).optional().describe('Filter by script class (default: "all")'),
    max_results: z.number().optional().describe('Max results to return (default: 20)'),
    include_source: z.boolean().optional().describe('Include full decompiled source (default: false)'),
  },
  forwardHandler('search_scripts')
);

clientTool('get_connections',
  'List all script connections on a specific RemoteEvent, RemoteFunction, or signal.',
  {
    path: z.string().describe('Full Instance path to the remote'),
    signal: z.string().optional().describe('Signal name, e.g. "OnClientEvent" (default: "OnClientEvent")'),
  },
  forwardHandler('get_connections')
);

clientTool('inspect_instance',
  'Get detailed properties and children of a specific Roblox Instance by path.',
  {
    path: z.string().describe('Full Instance path, e.g. "Workspace.Map.Door"'),
    properties: z.array(z.string()).optional().describe('Specific properties to read'),
    children_depth: z.number().optional().describe('Depth of children to include (default: 1)'),
  },
  forwardHandler('inspect_instance')
);

clientTool('snapshot_diff',
  'Take a state snapshot, wait a specified duration, then report what changed. Useful for observing effects of remote calls.',
  {
    sections: z.array(z.string()).optional().describe('State sections to diff: "character", "leaderstats"'),
    wait_ms: z.number().optional().describe('Milliseconds to wait between snapshots (default: 2000)'),
    description: z.string().optional().describe('Description of what is being observed'),
  },
  forwardHandler('snapshot_diff')
);

clientTool('get_game_info',
  'Get metadata about the current Roblox game: Game ID, Place ID, version, player count, and executor info.',
  {},
  forwardHandler('get_game_info')
);

clientTool('execute_probe',
  'Run a predefined security probe (micro-test) against a target remote. Available probes: "remote_echo_test", "rate_limit_check".',
  {
    probe: z.string().describe('Probe name: "remote_echo_test" or "rate_limit_check"'),
    target: z.string().describe('Full Instance path of the remote to test'),
    params: z.record(JsonValue).optional().describe('Probe-specific parameters'),
  },
  forwardHandler('execute_probe')
);

clientTool('read_log',
  'Read recent agent log entries for debugging and audit purposes.',
  {
    level: z.enum(['debug', 'info', 'warn', 'error']).optional().describe('Filter by log level'),
    max_entries: z.number().optional().describe('Max entries to return (default: 50)'),
  },
  forwardHandler('read_log')
);

clientTool('spy_remotes',
  'Monitor all RemoteEvent/Function traffic in real-time by hooking __namecall. Actions: "start" (begin capture), "stop" (pause), "read" (get captured entries), "clear" (wipe log). Returns remote name, args, call stack for every FireServer/InvokeServer call.',
  {
    action: z.enum(['start', 'stop', 'read', 'clear']).optional().describe('Action to perform (default: "read")'),
    max_entries: z.number().optional().describe('Max entries to keep in buffer (default: 200)'),
    count: z.number().optional().describe('Number of entries to return when reading (default: 50)'),
    filter: z.string().optional().describe('Lua pattern to filter by remote name'),
  },
  forwardHandler('spy_remotes')
);

clientTool('decompile_script',
  'Fully decompile a script by its Instance path. Returns complete source code, line count, and size. Essential for understanding game logic and finding validation gaps.',
  {
    path: z.string().describe('Full Instance path to the script, e.g. "ReplicatedStorage.Modules.GameManager"'),
  },
  forwardHandler('decompile_script')
);

clientTool('get_upvalues',
  'Inspect a script closure to read its upvalues (hidden state like coins, multipliers, admin flags) and constants. Uses getscriptclosure + debug.getupvalue + getconstants.',
  {
    path: z.string().describe('Full Instance path to the script'),
  },
  forwardHandler('get_upvalues')
);

clientTool('get_environment',
  'Read a running script\'s environment using getsenv(). Returns globals, functions, tables, and their values. Shows what modules are imported and what state the script holds.',
  {
    path: z.string().describe('Full Instance path to a running script'),
  },
  forwardHandler('get_environment')
);

clientTool('detect_anticheat',
  'Scan the game for anti-cheat systems. Checks for: executor detection globals in scripts, __namecall hooks, heartbeat/integrity remotes, and RunService monitoring. Returns risk level (low/medium/high) and findings.',
  {},
  forwardHandler('detect_anticheat')
);

clientTool('http_spy',
  'Monitor HTTP requests made by the game. Hooks HttpService:RequestAsync to capture URLs, methods, headers, and body data. Actions: "start", "stop", "read".',
  {
    action: z.enum(['start', 'stop', 'read']).optional().describe('Action to perform (default: "read")'),
  },
  forwardHandler('http_spy')
);

clientTool('find_instances',
  'Deep recursive search across the entire Instance tree (all services + nil-parented). Find instances by name pattern, class, or property value. Use this to find hidden admin panels, dev tools, or game objects.',
  {
    name_pattern: z.string().optional().describe('Lua pattern to match instance names'),
    class_name: z.string().optional().describe('Exact ClassName to filter by'),
    property_name: z.string().optional().describe('Property name to check exists or match value'),
    property_value: z.string().optional().describe('Expected property value (string comparison)'),
    max_results: z.number().optional().describe('Max results to return (default: 50)'),
    search_nil: z.boolean().optional().describe('Include nil-parented instances (default: true)'),
  },
  forwardHandler('find_instances')
);

clientTool('monitor_changes',
  'Watch a specific Instance property for changes over a time window. Useful for understanding cause-and-effect: fire a remote, then see what values change.',
  {
    path: z.string().describe('Full Instance path to monitor'),
    property: z.string().describe('Property name to watch'),
    duration_ms: z.number().optional().describe('How long to monitor in milliseconds (default: 5000, max: 30000)'),
  },
  forwardHandler('monitor_changes')
);

clientTool('fire_signal',
  'Simulate a UI interaction by firing a signal (e.g. MouseButton1Click) on a GUI element. Use this to satisfy prerequisites — like opening a shop or clicking a button — before testing a remote. Uses Potassium\'s firesignal.',
  {
    path: z.string().describe('Full Instance path to the GUI element, e.g. "Players.urwhack.PlayerGui.ScreenGui.shop.buyButton"'),
    signal: z.string().optional().describe('Signal name to fire (default: "MouseButton1Click"). Others: "MouseButton2Click", "Activated", "MouseEnter"'),
    args: z.array(JsonValue).optional().describe('Arguments to pass to the signal'),
    wait_ms: z.number().optional().describe('Milliseconds to wait after firing (let game react). Default: 0'),
  },
  forwardHandler('fire_signal')
);

clientTool('fuzz_remote',
  'Automated economy-breaking fuzzer. Fires a remote with 13 different malicious payloads (nil, 0, -1, -999999, MAX_INT, NaN, Inf, wrong types, etc.) at a specified argument position. Captures leaderstats before/after to detect economy impact. Use base_args to set the normal args and fuzz_index to pick which position to fuzz.',
  {
    path: z.string().describe('Full Instance path to the remote'),
    base_args: z.array(JsonValue).optional().describe('Normal arguments the remote expects. The fuzz_index position will be replaced with test payloads.'),
    fuzz_index: z.number().optional().describe('Which argument position (1-indexed) to fuzz. Default: 1'),
    payloads: z.array(z.object({
      label: z.string(),
      value: JsonValue,
    })).optional().describe('Custom payloads to test instead of defaults'),
  },
  forwardHandler('fuzz_remote')
);

clientTool('execute_lua',
  'Execute arbitrary Lua code in the game context. The nuclear option for game-specific situations no other tool handles. Code runs with full Potassium API access. Return a value to get it back as JSON. Pre-injected vars: player, rs (ReplicatedStorage), workspace, json_encode.',
  {
    code: z.string().describe('Lua code to execute. Use "return {...}" to send data back.'),
    description: z.string().optional().describe('What this code does (for logging)'),
  },
  forwardHandler('execute_lua')
);

// ── Start server ─────────────────────────────────────────────

async function main() {
  // Start WebSocket transport
  transport.start();
  
  transport.on('started', ({ port }) => {
    logger.info('WebSocket server listening', { port });
  });
  transport.on('client_connected', ({ client_id, player_name }) => {
    logger.info('Client connected', { client_id, player_name });
  });
  transport.on('client_disconnected', ({ client_id }) => {
    logger.info('Client disconnected', { client_id });
  });

  logger.info('MCP Server starting (WebSocket transport)', { port: WS_PORT });

  // Connect MCP server to stdio
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  
  logger.info('MCP Server connected via stdio');
}

main().catch(err => {
  console.error('MCP Server fatal error:', err);
  process.exit(1);
});
