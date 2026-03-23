# Architecture

This page explains how PotassiumMCP is structured, how the components communicate, and what each piece does.

---

## System Overview

```
┌─────────────────┐      MCP        ┌──────────────────┐    File IPC     ┌──────────────────┐
│   AI Assistant   │ ◄────────────► │   MCP Server     │ ◄────────────► │  In-Game Agent   │
│  (your editor)   │    (stdio)      │  (Node.js)       │  (temp files)  │  (dispatcher.lua)│
└─────────────────┘                 └──────────────────┘                └──────────────────┘
```

There are three tiers:

1. **AI Assistant Layer** — Your editor or chat client (VS Code, Cursor, Claude, etc.)
2. **MCP Server Layer** — A Node.js process that speaks the MCP protocol and manages safety/logging
3. **In-Game Agent Layer** — A Lua script injected into Roblox that executes the actual tool logic

---

## Request / Response Flow

```
1. User → AI: "scan all remotes"
   ↓
2. AI → MCP Server: calls tool "scan_remotes" via MCP (stdio JSON-RPC)
   ↓
3. MCP Server: validates params (Zod), checks safety policy
   ↓
4. MCP Server → File IPC: writes request JSON to WORKSPACE/potassiumMCP/in/<uuid>.json
   ↓
5. In-Game Agent: polls for files, reads request (every 250ms)
   ↓
6. Dispatcher executes scan_remotes() in Roblox
   ↓
7. Agent → File IPC: writes response JSON to WORKSPACE/potassiumMCP/out/<uuid>.json
   ↓
8. MCP Server: polls/watches, reads response, deletes both temp files
   ↓
9. MCP Server → AI: returns result content
   ↓
10. AI → User: displays formatted results
```

All temp files are deleted immediately after processing. Nothing accumulates on disk.

---

## File Structure

```
PotassiumMCP/
├── agent/
│   └── dispatcher.lua       # In-game Lua agent (1,660 lines)
├── bridge/
│   ├── package.json
│   └── src/
│       ├── mcp-server.js    # MCP server entry point
│       ├── transport.js     # File-based IPC transport
│       ├── protocol.js      # Message envelope definitions
│       ├── logger.js        # Audit logging
│       └── safety.js        # Rate limiting and safety checks
├── config/
│   └── default.json         # Default configuration
├── .vscode/
│   └── mcp.json             # VS Code MCP config (auto-generated)
├── .cursor/
│   └── mcp.json             # Cursor MCP config (auto-generated)
└── setup.js                 # One-command installer
```

---

## Component Deep-Dives

### MCP Server (`bridge/src/mcp-server.js`)

The MCP server is the bridge between your AI and the in-game agent.

**Responsibilities:**
- Register all 21 tools with the MCP SDK
- Validate tool parameters using [Zod](https://zod.dev) schemas
- Enforce safety policies before dispatching any request
- Route calls through the file transport layer
- Validate response envelopes before returning to the AI
- Log all audit events

**Workspace detection:** On startup, the server looks for the executor workspace in this order:
1. `POTASSIUM_WORKSPACE` environment variable
2. Common Windows install paths (`Documents\Potassium\workspace`, etc.)
3. Common macOS/Linux paths (`~/Documents/Potassium/workspace`, etc.)

**AI instructions:** The server includes a `SERVER_INSTRUCTIONS` block that gives the AI a recommended workflow (recon → analyze → monitor → test → exploit), tool selection guidance, and safety reminders.

---

### File Transport (`bridge/src/transport.js`)

Implements file-based IPC between the Node.js server and the Roblox executor.

**Why file-based IPC?** Executors run inside the Roblox process and cannot open sockets or named pipes. File I/O is the only reliable communication channel.

**How it works:**
1. For each tool call, a unique UUID is generated
2. The request JSON is written to `WORKSPACE/potassiumMCP/in/<timestamp>_<uuid>.json`
3. The transport polls `WORKSPACE/potassiumMCP/out/` every 250ms and also uses `fs.watch` for faster detection
4. When the matching response file appears, it is read, parsed, and the temp files are deleted
5. A 30-second timeout cancels the call if no response is received

**File locations:**

| Directory | Purpose |
|---|---|
| `potassiumMCP/in/` | Bridge writes requests here; agent reads from here |
| `potassiumMCP/out/` | Agent writes responses here; bridge reads from here |
| `potassiumMCP/logs/` | JSONL audit logs |
| `potassiumMCP/archive/` | Optional archive of processed files |

---

### Safety Policy Engine (`bridge/src/safety.js`)

Enforces constraints before any tool call reaches the agent.

**Checks performed (in order):**
1. **Rate limit** — Maximum 10 calls per second (configurable). Excess calls are rejected immediately.
2. **Remote firewall** — Any `call_remote`, `fuzz_remote`, or `execute_probe` targeting a remote that matches a blocked pattern (`*Purchase*`, `*Payment*`, `*Ban*`, `*Kick*`, `*Admin*`, `*Moderate*`, `*Delete*`) is blocked.
3. **Destructive operations gate** — `execute_lua`, `fuzz_remote`, and similar tools can be disabled globally via `destructive_operations_enabled: false`.

All safety blocks are logged with a reason.

---

### Audit Logger (`bridge/src/logger.js`)

JSONL append-only audit log for every session.

**Events logged:**
- Session start and stop
- Every tool request (method, params, timestamp)
- Every tool response (status, timing)
- Safety blocks (tool name, block reason)
- Parse errors

**Log format:** JSONL (one JSON object per line) — easy to grep, import into analytics tools, or replay.

**Location:** `WORKSPACE/potassiumMCP/logs/session_<timestamp>.jsonl`

---

### Protocol Definitions (`bridge/src/protocol.js`)

Defines the message envelope format shared between the bridge and the agent.

**Message types:** `REQUEST`, `RESPONSE`, `ERROR`, `LOG`

**Request envelope fields:**

| Field | Description |
|---|---|
| `version` | Protocol version (`"1.0"`) |
| `request_id` | UUID for request/response correlation |
| `timestamp` | ISO 8601 timestamp |
| `type` | `"request"` |
| `method` | Tool name (e.g. `"scan_remotes"`) |
| `params` | Tool parameters object |

**Error codes:** `INSTANCE_NOT_FOUND`, `TIMEOUT`, `PERMISSION_DENIED`, `SAFETY_BLOCKED`, `PARSE_ERROR`, `EXECUTOR_ERROR`

---

### In-Game Agent (`agent/dispatcher.lua`)

The Lua script injected into Roblox. It implements all 21 tools using the Roblox API and executor globals.

**Key characteristics:**
- **Self-contained** — Zero external dependencies. Includes an inline JSON encoder/decoder.
- **1,660 lines** of Lua
- **250ms poll cycle** — Reads from `potassiumMCP/in/`, executes the requested tool, writes to `potassiumMCP/out/`
- **Error isolation** — Each tool call is wrapped in `pcall`. Errors return a structured error envelope instead of crashing the dispatcher.

**Executor API used:**

| Global | Purpose |
|---|---|
| `writefile` / `readfile` / `delfile` / `listfiles` | File I/O for IPC |
| `hookmetamethod` | Hook `__namecall` for `spy_remotes` |
| `firesignal` | Simulate UI clicks for `fire_signal` |
| `getgenv()` | Read global environment for `execute_lua` |
| `decompile()` | Decompile scripts for `decompile_script` |
| `getsenv()` | Get script environment for `get_environment` |
| `getscriptclosure()` | Read closure upvalues for `get_upvalues` |

**Stopping the agent:**
```lua
getgenv()._pmcp_stop = true
```

---

## IPC Message Example

### Request (written by bridge to `potassiumMCP/in/`)
```json
{
  "version": "1.0",
  "request_id": "abc-123",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "type": "request",
  "method": "scan_remotes",
  "params": {
    "filter": "Buy",
    "include_path": true
  }
}
```

### Response (written by agent to `potassiumMCP/out/`)
```json
{
  "version": "1.0",
  "request_id": "abc-123",
  "timestamp": "2024-01-01T12:00:00.250Z",
  "type": "response",
  "result": {
    "remotes": [
      {
        "name": "BuyItem",
        "class": "RemoteEvent",
        "path": "ReplicatedStorage.Remotes.BuyItem"
      }
    ]
  }
}
```

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| AI protocol | MCP (stdio JSON-RPC) | Standard tool protocol |
| MCP server | Node.js 18+ | Server runtime |
| Schema validation | Zod | Parameter validation |
| In-game agent | Lua 5.1 (Roblox) | Tool execution |
| IPC transport | Local filesystem | Executor-compatible IPC |
| Logging | JSONL | Structured audit trail |
