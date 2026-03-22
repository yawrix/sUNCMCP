# 🧪 PotassiumMCP

**AI-powered Roblox game security toolkit.** Connect any MCP-compatible AI assistant directly to a live Roblox game through the Potassium executor. 21 tools for recon, decompilation, exploitation, and testing — no scripting knowledge required.

> Talk to the AI. It does the hacking.

---

## ✨ Features

- 🔍 **Full Recon** — Scan remotes, search scripts, find hidden instances, detect anti-cheat systems
- 📖 **Script Decompilation** — Decompile any game script, read upvalues and environment state
- 🕵️ **Traffic Monitoring** — Spy on all RemoteEvent/Function traffic and HTTP requests in real-time
- 🎯 **Automated Fuzzing** — Economy-breaking fuzzer tests 13+ malicious payloads with before/after state diffing
- 🖱️ **UI Simulation** — Fire GUI signals (open shops, click buttons) to satisfy prerequisites before testing remotes
- ⚡ **Arbitrary Lua Execution** — Run any Lua code in the game context for game-specific attack vectors
- 🔌 **MCP Native** — Works with any MCP-compatible AI: VS Code Copilot, Cursor, Claude Desktop, etc.

## 🚀 Quick Start

### Prerequisites
- [Potassium](https://potassium.dev) executor (or any UNC-compatible executor)
- [Node.js](https://nodejs.org) v18+
- An MCP-compatible AI client (VS Code w/ GitHub Copilot, Cursor, etc.)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/potassiumMCP.git
cd potassiumMCP

# 2. Install bridge dependencies
cd bridge && npm install && cd ..
```

### Configure MCP

Add to your AI client's MCP configuration (e.g., `.vscode/mcp.json` or `mcp_config.json`):

```json
{
  "servers": {
    "PotassiumMCP": {
      "type": "stdio",
      "command": "node",
      "args": ["bridge/src/mcp-server.js"],
      "env": {
        "POTASSIUM_WORKSPACE": "/path/to/potassiumMCP"
      }
    }
  }
}
```

### Run

1. Open Roblox and join your target game
2. Copy `agent/dispatcher.lua` into Potassium's script editor
3. Execute the script — you'll see `[PotassiumMCP] Agent started`
4. Open your AI client and start chatting — it has full access to the game

## 🛠️ Tool Reference

### Recon
| Tool | Description |
|---|---|
| `scan_remotes` | Find all client-visible RemoteEvents and RemoteFunctions |
| `search_scripts` | Search scripts by name pattern, content, or class |
| `find_instances` | Deep recursive search across all services + nil-parented instances |
| `inspect_instance` | Read properties and children of any instance |
| `get_game_info` | Game ID, Place ID, version, player count, executor info |
| `get_connections` | List all script connections on a remote or signal |

### Analysis
| Tool | Description |
|---|---|
| `decompile_script` | Full source code decompilation of any script |
| `get_upvalues` | Read closure upvalues + constants (hidden state) |
| `get_environment` | Read a running script's environment via getsenv() |
| `detect_anticheat` | Scan for executor detection, hooks, heartbeat monitors |

### Monitoring
| Tool | Description |
|---|---|
| `spy_remotes` | Hook `__namecall` to capture all FireServer/InvokeServer traffic |
| `http_spy` | Monitor all HttpService requests (URLs, headers, bodies) |
| `monitor_changes` | Watch a property for changes over a time window |

### Testing
| Tool | Description |
|---|---|
| `call_remote` | Fire any RemoteEvent/Function with custom arguments |
| `fuzz_remote` | Automated economy-breaking fuzzer with leaderstats diffing |
| `execute_probe` | Remote echo test and rate limit checking |
| `snapshot_state` | Capture full player state (character, backpack, leaderstats) |
| `snapshot_diff` | Before/after state comparison |

### Exploit
| Tool | Description |
|---|---|
| `fire_signal` | Simulate UI clicks via `firesignal` (open shops, menus, etc.) |
| `execute_lua` | Run arbitrary Lua with full Potassium API access |
| `read_log` | Read agent debug logs |

## 🏗️ Architecture

```
┌─────────────────┐     MCP (stdio)     ┌──────────────────┐     File IPC      ┌──────────────────┐
│   AI Assistant   │ ◄───────────────► │   MCP Server     │ ◄──────────────► │  In-Game Agent   │
│  (Copilot, etc.) │                    │  (Node.js)       │                   │  (dispatcher.lua)│
└─────────────────┘                    └──────────────────┘                   └──────────────────┘
                                        bridge/src/          potassiumMCP/      agent/dispatcher.lua
                                        mcp-server.js        ipc_{in,out}/      (runs in Potassium)
```

**How it works:**
1. The AI sends a tool call via MCP
2. `mcp-server.js` writes a JSON request to the IPC directory
3. `dispatcher.lua` (running in Roblox) picks up the request, executes it, writes the response
4. `mcp-server.js` reads the response and returns it to the AI

## 📁 Project Structure

```
potassiumMCP/
├── agent/
│   └── dispatcher.lua        # In-game agent — 21 tools, 1600+ lines
├── bridge/
│   └── src/
│       ├── mcp-server.js     # MCP server — stdio transport
│       ├── transport.js      # File-based IPC transport
│       ├── protocol.js       # JSON-RPC protocol definitions
│       ├── logger.js         # Audit logging
│       └── safety.js         # Safety guardrails
├── app/                      # Electron GUI (optional)
├── config/
│   └── default.json          # Default configuration
├── docs/                     # Architecture documentation
└── README.md
```

## ⚠️ Compatibility

PotassiumMCP works with any executor that supports UNC (Unified Naming Convention):
- ✅ Potassium
- ✅ Any executor with: `hookmetamethod`, `firesignal`, `getgenv`, `decompile`, `getsenv`, `getscriptclosure`

Key requirements: `writefile`/`readfile` for IPC, `hookmetamethod` for remote spy, `firesignal` for UI simulation.

## 📜 License

MIT License — see [LICENSE](LICENSE).

## 🤝 Contributing

Pull requests welcome. If you add a new tool:
1. Add the Lua implementation in `agent/dispatcher.lua`
2. Add the MCP definition with Zod schema in `bridge/src/mcp-server.js`
3. Add the tool name to the array in `bridge/src/protocol.js`

---

**Built with 🧠 by AI + Human collaboration.**
