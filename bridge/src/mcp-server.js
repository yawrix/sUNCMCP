/**
 * PotassiumMCP — MCP Server
 * 
 * Exposes game security tools as MCP tools so your AI assistant
 * can call them directly from the chat window.
 * 
 * Your AI client (VS Code, Cursor, etc.) starts this automatically.
 * You never need to run it manually.
 * 
 * Environment:
 *   EXECUTOR_WORKSPACE — Path to your executor's workspace directory
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
import { FileTransport } from './transport.js';
import { SafetyPolicy } from './safety.js';
import { AuditLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Configuration ────────────────────────────────────────────

const WORKSPACE_DIR = process.env.EXECUTOR_WORKSPACE;
if (!WORKSPACE_DIR) {
  console.error('');
  console.error('  ✖ EXECUTOR_WORKSPACE is not set.');
  console.error('');
  console.error('  This should point to your executor\'s workspace directory —');
  console.error('  the folder where your executor reads and writes files.');
  console.error('');
  console.error('  Run "node setup.js" to configure it automatically,');
  console.error('  or set it manually in your MCP config.');
  console.error('');
  process.exit(1);
}

const configPath = join(__dirname, '..', '..', 'config', 'default.json');
let config = { safety: {}, logging: { level: 'info' }, ipc: {} };
if (existsSync(configPath)) {
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
}

// ── Initialize bridge internals ──────────────────────────────

const logDir = join(WORKSPACE_DIR, 'potassiumMCP', 'logs');
const logger = new AuditLogger(logDir);
logger.consoleLevel = 'error';

const safety = new SafetyPolicy(config);
const transport = new FileTransport(WORKSPACE_DIR, {
  pollIntervalMs: config.ipc?.poll_interval_ms ?? 250,
});

const TIMEOUT_MS = config.ipc?.timeout_ms ?? 30000;

// ── Helper: call a tool through the file transport ───────────

import { createRequest, validateEnvelope, Tools } from './protocol.js';

async function callTool(method, params = {}) {
  // Safety check
  const safetyResult = safety.check(method, params);
  if (!safetyResult.allowed) {
    logger.logSafety('mcp-' + Date.now(), safetyResult.reason);
    throw new Error(`[SAFETY BLOCKED] ${safetyResult.reason}`);
  }

  const envelope = createRequest(method, params);
  logger.logRequest(envelope.request_id, method, params);

  const startTime = Date.now();
  const response = await transport.send(envelope, TIMEOUT_MS);
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

// ── Create MCP Server ────────────────────────────────────────

const SERVER_INSTRUCTIONS = `You are connected to a live Roblox game through PotassiumMCP. You have 21 tools that let you interact with the game directly. The in-game agent (dispatcher.lua) must be running in the player's executor for tools to work.

IMPORTANT: Use the MCP tools below. Do NOT try to write files, create scripts manually, or use any other method. The tools handle everything.

## Workflow for testing a game

1. RECON — Understand the game
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
   - fuzz_remote: blast a remote with 13 malicious payloads (price=0, -1, MAX_INT, NaN, etc.)
   - call_remote: targeted tests with specific arguments
   - snapshot_diff: measure before/after state changes

4. CUSTOM — For anything else
   - execute_lua: run arbitrary Lua code in the game context
   - Use "return {...}" in your code to get data back

## Tool reference

RECON: scan_remotes, search_scripts, find_instances, inspect_instance, get_game_info, get_connections
ANALYSIS: decompile_script, get_upvalues, get_environment, detect_anticheat
MONITORING: spy_remotes, http_spy, monitor_changes
TESTING: call_remote, fuzz_remote, execute_probe, snapshot_state, snapshot_diff
EXPLOIT: fire_signal, execute_lua, read_log

## Tips
- Instance paths use dots: "ReplicatedStorage.Remotes.BuyItem"
- fire_signal simulates UI clicks (open shops) before testing purchase remotes
- fuzz_remote auto-diffs leaderstats — look for "ECONOMY CHANGE DETECTED"
- execute_lua is the nuclear option — write any Lua for game-specific situations
- Always start with recon. Understand the game before testing.`;

const server = new McpServer({
  name: 'PotassiumMCP',
  version: '1.0.0',
  instructions: SERVER_INSTRUCTIONS,
});

// ── Tool: scan_remotes ───────────────────────────────────────

server.tool(
  'scan_remotes',
  'Scan all client-visible RemoteEvents and RemoteFunctions in the Roblox game. Returns their names, classes, and full instance paths.',
  {
    filter: z.string().optional().describe('Lua pattern to filter remote names'),
    include_path: z.boolean().optional().describe('Include full Instance path (default: true)'),
  },
  async ({ filter, include_path }) => {
    const result = await callTool('scan_remotes', { filter, include_path });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: call_remote ────────────────────────────────────────

server.tool(
  'call_remote',
  'Fire a RemoteEvent or invoke a RemoteFunction with specified arguments. Use this to test server-side handling of client calls.',
  {
    path: z.string().describe('Full Instance path, e.g. "ReplicatedStorage.Remotes.MyEvent"'),
    args: z.array(z.any()).optional().describe('Arguments to pass to the remote'),
    timeout_ms: z.number().optional().describe('Timeout for RemoteFunction response (default: 5000)'),
  },
  async ({ path, args, timeout_ms }) => {
    const result = await callTool('call_remote', { path, args, timeout_ms });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: snapshot_state ─────────────────────────────────────

server.tool(
  'snapshot_state',
  'Capture a structured snapshot of the local player state including character, backpack, leaderstats, and PlayerGui.',
  {
    sections: z.array(z.string()).optional().describe('Sections to capture: "character", "backpack", "leaderstats", "playergui", "playerdata"'),
    depth: z.number().optional().describe('Instance tree depth (default: 3)'),
  },
  async ({ sections, depth }) => {
    const result = await callTool('snapshot_state', { sections, depth });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: search_scripts ─────────────────────────────────────

server.tool(
  'search_scripts',
  'Search client-visible scripts by name pattern, content pattern, or class. Can decompile and return source code.',
  {
    name_pattern: z.string().optional().describe('Lua pattern to match script names'),
    content_pattern: z.string().optional().describe('Lua pattern to search in decompiled source'),
    class_filter: z.enum(['LocalScript', 'ModuleScript', 'all']).optional().describe('Filter by script class (default: "all")'),
    max_results: z.number().optional().describe('Max results to return (default: 20)'),
    include_source: z.boolean().optional().describe('Include full decompiled source (default: false)'),
  },
  async ({ name_pattern, content_pattern, class_filter, max_results, include_source }) => {
    const result = await callTool('search_scripts', { name_pattern, content_pattern, class_filter, max_results, include_source });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: get_connections ────────────────────────────────────

server.tool(
  'get_connections',
  'List all script connections on a specific RemoteEvent, RemoteFunction, or signal.',
  {
    path: z.string().describe('Full Instance path to the remote'),
    signal: z.string().optional().describe('Signal name, e.g. "OnClientEvent" (default: "OnClientEvent")'),
  },
  async ({ path, signal }) => {
    const result = await callTool('get_connections', { path, signal });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: inspect_instance ───────────────────────────────────

server.tool(
  'inspect_instance',
  'Get detailed properties and children of a specific Roblox Instance by path.',
  {
    path: z.string().describe('Full Instance path, e.g. "Workspace.Map.Door"'),
    properties: z.array(z.string()).optional().describe('Specific properties to read'),
    children_depth: z.number().optional().describe('Depth of children to include (default: 1)'),
  },
  async ({ path, properties, children_depth }) => {
    const result = await callTool('inspect_instance', { path, properties, children_depth });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: snapshot_diff ──────────────────────────────────────

server.tool(
  'snapshot_diff',
  'Take a state snapshot, wait a specified duration, then report what changed. Useful for observing effects of remote calls.',
  {
    sections: z.array(z.string()).optional().describe('State sections to diff: "character", "leaderstats"'),
    wait_ms: z.number().optional().describe('Milliseconds to wait between snapshots (default: 2000)'),
    description: z.string().optional().describe('Description of what is being observed'),
  },
  async ({ sections, wait_ms, description }) => {
    const result = await callTool('snapshot_diff', { sections, wait_ms, description });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: get_game_info ──────────────────────────────────────

server.tool(
  'get_game_info',
  'Get metadata about the current Roblox game: Game ID, Place ID, version, player count, and executor info.',
  {},
  async () => {
    const result = await callTool('get_game_info', {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: execute_probe ──────────────────────────────────────

server.tool(
  'execute_probe',
  'Run a predefined security probe (micro-test) against a target remote. Available probes: "remote_echo_test", "rate_limit_check".',
  {
    probe: z.string().describe('Probe name: "remote_echo_test" or "rate_limit_check"'),
    target: z.string().describe('Full Instance path of the remote to test'),
    params: z.record(z.any()).optional().describe('Probe-specific parameters'),
  },
  async ({ probe, target, params }) => {
    const result = await callTool('execute_probe', { probe, target, params });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: read_log ───────────────────────────────────────────

server.tool(
  'read_log',
  'Read recent agent log entries for debugging and audit purposes.',
  {
    level: z.enum(['debug', 'info', 'warn', 'error']).optional().describe('Filter by log level'),
    max_entries: z.number().optional().describe('Max entries to return (default: 50)'),
  },
  async ({ level, max_entries }) => {
    const result = await callTool('read_log', { level, max_entries });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: spy_remotes ────────────────────────────────────────

server.tool(
  'spy_remotes',
  'Monitor all RemoteEvent/Function traffic in real-time by hooking __namecall. Actions: "start" (begin capture), "stop" (pause), "read" (get captured entries), "clear" (wipe log). Returns remote name, args, call stack for every FireServer/InvokeServer call.',
  {
    action: z.enum(['start', 'stop', 'read', 'clear']).optional().describe('Action to perform (default: "read")'),
    max_entries: z.number().optional().describe('Max entries to keep in buffer (default: 200)'),
    count: z.number().optional().describe('Number of entries to return when reading (default: 50)'),
    filter: z.string().optional().describe('Lua pattern to filter by remote name'),
  },
  async ({ action, max_entries, count, filter }) => {
    const result = await callTool('spy_remotes', { action, max_entries, count, filter });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: decompile_script ───────────────────────────────────

server.tool(
  'decompile_script',
  'Fully decompile a script by its Instance path. Returns complete source code, line count, and size. Essential for understanding game logic and finding validation gaps.',
  {
    path: z.string().describe('Full Instance path to the script, e.g. "ReplicatedStorage.Modules.GameManager"'),
  },
  async ({ path }) => {
    const result = await callTool('decompile_script', { path });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: get_upvalues ───────────────────────────────────────

server.tool(
  'get_upvalues',
  'Inspect a script closure to read its upvalues (hidden state like coins, multipliers, admin flags) and constants. Uses getscriptclosure + debug.getupvalue + getconstants.',
  {
    path: z.string().describe('Full Instance path to the script'),
  },
  async ({ path }) => {
    const result = await callTool('get_upvalues', { path });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: get_environment ────────────────────────────────────

server.tool(
  'get_environment',
  'Read a running script\'s environment using getsenv(). Returns globals, functions, tables, and their values. Shows what modules are imported and what state the script holds.',
  {
    path: z.string().describe('Full Instance path to a running script'),
  },
  async ({ path }) => {
    const result = await callTool('get_environment', { path });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: detect_anticheat ───────────────────────────────────

server.tool(
  'detect_anticheat',
  'Scan the game for anti-cheat systems. Checks for: executor detection globals in scripts, __namecall hooks, heartbeat/integrity remotes, and RunService monitoring. Returns risk level (low/medium/high) and findings.',
  {},
  async () => {
    const result = await callTool('detect_anticheat', {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: http_spy ───────────────────────────────────────────

server.tool(
  'http_spy',
  'Monitor HTTP requests made by the game. Hooks HttpService:RequestAsync to capture URLs, methods, headers, and body data. Actions: "start", "stop", "read".',
  {
    action: z.enum(['start', 'stop', 'read']).optional().describe('Action to perform (default: "read")'),
  },
  async ({ action }) => {
    const result = await callTool('http_spy', { action });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: find_instances ─────────────────────────────────────

server.tool(
  'find_instances',
  'Deep recursive search across the entire Instance tree (all services + nil-parented). Find instances by name pattern, class, or property value. Use this to find hidden admin panels, dev tools, or game objects.',
  {
    name_pattern: z.string().optional().describe('Lua pattern to match instance names'),
    class_name: z.string().optional().describe('Exact ClassName to filter by'),
    property_name: z.string().optional().describe('Property name to check exists or match value'),
    property_value: z.string().optional().describe('Expected property value (string comparison)'),
    max_results: z.number().optional().describe('Max results to return (default: 50)'),
    search_nil: z.boolean().optional().describe('Include nil-parented instances (default: true)'),
  },
  async ({ name_pattern, class_name, property_name, property_value, max_results, search_nil }) => {
    const result = await callTool('find_instances', { name_pattern, class_name, property_name, property_value, max_results, search_nil });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: monitor_changes ────────────────────────────────────

server.tool(
  'monitor_changes',
  'Watch a specific Instance property for changes over a time window. Useful for understanding cause-and-effect: fire a remote, then see what values change.',
  {
    path: z.string().describe('Full Instance path to monitor'),
    property: z.string().describe('Property name to watch'),
    duration_ms: z.number().optional().describe('How long to monitor in milliseconds (default: 5000, max: 30000)'),
  },
  async ({ path, property, duration_ms }) => {
    const result = await callTool('monitor_changes', { path, property, duration_ms });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: fire_signal ────────────────────────────────────────

server.tool(
  'fire_signal',
  'Simulate a UI interaction by firing a signal (e.g. MouseButton1Click) on a GUI element. Use this to satisfy prerequisites — like opening a shop or clicking a button — before testing a remote. Uses Potassium\'s firesignal.',
  {
    path: z.string().describe('Full Instance path to the GUI element, e.g. "Players.urwhack.PlayerGui.ScreenGui.shop.buyButton"'),
    signal: z.string().optional().describe('Signal name to fire (default: "MouseButton1Click"). Others: "MouseButton2Click", "Activated", "MouseEnter"'),
    args: z.array(z.any()).optional().describe('Arguments to pass to the signal'),
    wait_ms: z.number().optional().describe('Milliseconds to wait after firing (let game react). Default: 0'),
  },
  async ({ path, signal, args, wait_ms }) => {
    const result = await callTool('fire_signal', { path, signal, args, wait_ms });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: fuzz_remote ────────────────────────────────────────

server.tool(
  'fuzz_remote',
  'Automated economy-breaking fuzzer. Fires a remote with 13 different malicious payloads (nil, 0, -1, -999999, MAX_INT, NaN, Inf, wrong types, etc.) at a specified argument position. Captures leaderstats before/after to detect economy impact. Use base_args to set the normal args and fuzz_index to pick which position to fuzz.',
  {
    path: z.string().describe('Full Instance path to the remote'),
    base_args: z.array(z.any()).optional().describe('Normal arguments the remote expects. The fuzz_index position will be replaced with test payloads.'),
    fuzz_index: z.number().optional().describe('Which argument position (1-indexed) to fuzz. Default: 1'),
    payloads: z.array(z.object({
      label: z.string(),
      value: z.any(),
    })).optional().describe('Custom payloads to test instead of defaults'),
  },
  async ({ path, base_args, fuzz_index, payloads }) => {
    const result = await callTool('fuzz_remote', { path, base_args, fuzz_index, payloads });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: execute_lua ────────────────────────────────────────

server.tool(
  'execute_lua',
  'Execute arbitrary Lua code in the game context. The nuclear option for game-specific situations no other tool handles. Code runs with full Potassium API access. Return a value to get it back as JSON. Pre-injected vars: player, rs (ReplicatedStorage), workspace, json_encode.',
  {
    code: z.string().describe('Lua code to execute. Use "return {...}" to send data back.'),
    description: z.string().optional().describe('What this code does (for logging)'),
  },
  async ({ code, description }) => {
    const result = await callTool('execute_lua', { code, description });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Start server ─────────────────────────────────────────────

async function main() {
  // Start file transport (watching for agent responses)
  transport.start();
  logger.info('MCP Server starting', { workspace: WORKSPACE_DIR });

  // Connect MCP server to stdio
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  
  logger.info('MCP Server connected via stdio');
}

main().catch(err => {
  console.error('MCP Server fatal error:', err);
  process.exit(1);
});
