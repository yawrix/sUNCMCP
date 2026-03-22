# 🧪 PotassiumMCP

**Talk to your AI. It hacks the game.**

PotassiumMCP connects any MCP-compatible AI directly to a live Roblox game. 21 built-in tools give your AI the ability to scan, decompile, fuzz, and exploit — all from a chat window. No scripting required.

You bring the game. The AI does the rest.

---

## What can it do?

- **Decompile any script** in the game and read its source code
- **Scan every remote** the game uses and test them with malicious inputs
- **Fuzz purchase remotes** with economy-breaking payloads (price = -1, quantity = MAX_INT, etc.)
- **Simulate clicking buttons** so the game thinks you opened a shop before you fire the remote
- **Detect anti-cheat systems** before you start testing
- **Monitor all network traffic** in real-time
- **Run arbitrary Lua** for anything the built-in tools don't cover

The toolkit works with any game. Your AI figures out the game's specific logic, finds the vulnerabilities, and tests them — all through conversation.

---

## Prerequisites

1. **A sUNC-compatible Roblox executor** with a workspace/filesystem directory
2. **[Node.js](https://nodejs.org)** v18 or newer
3. **An MCP-compatible AI client** — VS Code, Cursor, Claude Desktop, Claude Code, Antigravity, or any MCP client

---

## Quick start

```bash
git clone https://github.com/yawrix/PotassiumMCP.git
cd PotassiumMCP
node setup.js
```

The setup script will:
- Install npm dependencies automatically
- Ask you to paste your executor's workspace path
- Generate `.vscode/mcp.json` and `.cursor/mcp.json` with the correct paths
- Print ready-to-paste configs for Claude Desktop and other clients

**That's the entire install.** One command.

---

## Connect your client

PotassiumMCP uses **stdio transport** — your AI client starts the MCP server process automatically. You just need to tell your client where the server is.

Most editors use a JSON MCP configuration. Here are the complete configs — you can use them as-is, or copy just the `PotassiumMCP` entry if you have other MCP servers configured.

> **Note:** Replace `YOUR_USERNAME` with your actual system username and adjust the path to wherever you cloned PotassiumMCP.

### JSON configuration

**Windows:**
```json
{
  "mcpServers": {
    "PotassiumMCP": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\Desktop\\PotassiumMCP\\bridge\\src\\mcp-server.js"],
      "env": {
        "EXECUTOR_WORKSPACE": "C:\\path\\to\\your\\executor\\workspace"
      }
    }
  }
}
```

**macOS / Linux:**
```json
{
  "mcpServers": {
    "PotassiumMCP": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/Desktop/PotassiumMCP/bridge/src/mcp-server.js"],
      "env": {
        "EXECUTOR_WORKSPACE": "/path/to/your/executor/workspace"
      }
    }
  }
}
```

> **Important:** VS Code uses `"servers"` as its top-level key instead of `"mcpServers"`. See the VS Code section below.

> **Finding your workspace path:** Open your executor, go to Settings, and look for the workspace or files directory. That's the path you need for `EXECUTOR_WORKSPACE`.

---

### VS Code (GitHub Copilot)

VS Code supports MCP servers through `.vscode/mcp.json` files. The repo ships with one pre-configured — just open the folder.

> **Important:** VS Code uses `"servers"` as its top-level key, **not** `"mcpServers"`.

#### Option A: Workspace config (recommended)

The repo already includes `.vscode/mcp.json`. If you ran `node setup.js`, it's configured with your absolute paths. Just open the PotassiumMCP folder in VS Code.

#### Option B: Create manually

Create `.vscode/mcp.json` in the project root:

**Windows:**
```json
{
  "servers": {
    "PotassiumMCP": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\Desktop\\PotassiumMCP\\bridge\\src\\mcp-server.js"],
      "env": {
        "EXECUTOR_WORKSPACE": "C:\\path\\to\\your\\executor\\workspace"
      }
    }
  }
}
```

**macOS / Linux:**
```json
{
  "servers": {
    "PotassiumMCP": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/Desktop/PotassiumMCP/bridge/src/mcp-server.js"],
      "env": {
        "EXECUTOR_WORKSPACE": "/path/to/your/executor/workspace"
      }
    }
  }
}
```

#### Option C: Global config

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **MCP: Open User Configuration**
3. Add the server entry

#### Verify

Open GitHub Copilot Chat, switch to **Agent Mode**, and click the **Tools** icon. Confirm that PotassiumMCP tools appear in the list.

---

### Cursor

Cursor supports MCP servers through its settings UI or by editing config files directly.

The repo ships with `.cursor/mcp.json` pre-configured. If you ran `node setup.js`, it's ready to go.

#### Option A: Project config (recommended)

Open the PotassiumMCP folder in Cursor — the `.cursor/mcp.json` is already there.

#### Option B: Settings UI

1. Go to **File** > **Preferences** > **Cursor Settings**
2. Select **MCP** in the sidebar
3. Click **Add new global MCP server**
4. Paste the JSON configuration from above (use `mcpServers` format)

#### Option C: Global config file

Edit `~/.cursor/mcp.json` and add the PotassiumMCP entry.

#### Verify

In **Cursor Settings** > **MCP**, the server should show a green status indicator.

---

### Claude Desktop

1. Open **Claude** > **Settings...**
2. Go to the **Developer** tab and click **Edit Config**
3. Add the JSON configuration from above to `claude_desktop_config.json`
4. Restart Claude Desktop completely (quit and relaunch)
5. Click the hammer icon below the chat input to verify PotassiumMCP tools appear

Config file locations:
- **Windows:** `C:\Users\YOUR_USERNAME\AppData\Roaming\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

---

### Claude Code

Register the MCP server using the `claude mcp add` command:

**Windows:**
```bash
claude mcp add PotassiumMCP -- node C:\Users\YOUR_USERNAME\Desktop\PotassiumMCP\bridge\src\mcp-server.js
```

**macOS / Linux:**
```bash
claude mcp add PotassiumMCP -- node /Users/YOUR_USERNAME/Desktop/PotassiumMCP/bridge/src/mcp-server.js
```

Set the workspace env var:
```bash
claude mcp add-env PotassiumMCP EXECUTOR_WORKSPACE /path/to/your/executor/workspace
```

Verify by running `/mcp` in Claude Code — you should see `PotassiumMCP: connected`.

---

### Google Antigravity

1. Click the three dots (**…**) at the top of the Agent pane and select **MCP Servers**
2. Click **Manage MCP Servers** > **View raw config**
3. Add the JSON configuration from above
4. Refresh the MCP Servers panel and verify PotassiumMCP tools appear

Config file locations:
- **macOS:** `~/.gemini/antigravity/mcp_config.json`
- **Windows:** `C:\Users\YOUR_USERNAME\.gemini\antigravity\mcp_config.json`

---

### Other MCP clients

PotassiumMCP works with **any client that supports stdio transport**. Use the JSON configuration or CLI command from above and consult your client's documentation for where to place it.

---

## Using it

1. Open Roblox and join any game
2. Paste `agent/dispatcher.lua` into your executor and hit Execute
3. You'll see the connection banner in the executor console
4. Open your AI and start chatting — it has access to the game

No background processes, no terminal windows. Your AI client launches the MCP server automatically behind the scenes.

---

## How it works

```
┌─────────────────┐      MCP        ┌──────────────────┐    File IPC     ┌──────────────────┐
│   AI Assistant   │ ◄────────────► │   MCP Server     │ ◄────────────► │  In-Game Agent   │
│  (your editor)   │    (stdio)      │  (Node.js)       │  (temp files)  │  (dispatcher.lua)│
└─────────────────┘                 └──────────────────┘                └──────────────────┘
```

1. You ask your AI to do something ("scan all remotes in this game")
2. Your AI calls a PotassiumMCP tool via MCP
3. The MCP server writes a small JSON request to a temp file
4. The dispatcher (running inside Roblox) picks it up, runs the tool, writes the result
5. The MCP server reads the result and sends it back to your AI
6. Your AI interprets the result and decides what to do next

**All temp files are automatically deleted after processing.** Nothing accumulates on disk.

---

## All 21 tools

### Recon — figure out what the game has
| Tool | What it does |
|---|---|
| `scan_remotes` | Lists every RemoteEvent and RemoteFunction the game exposes |
| `search_scripts` | Finds scripts by name or by searching their decompiled source |
| `find_instances` | Deep search across all services, including hidden/nil-parented objects |
| `inspect_instance` | Reads properties and children of any instance in the game |
| `get_game_info` | Game ID, place version, player count, executor info |
| `get_connections` | Shows what scripts are connected to a remote |

### Analysis — understand the code
| Tool | What it does |
|---|---|
| `decompile_script` | Gets the full source code of any script |
| `get_upvalues` | Reads hidden variables and constants inside a script's closure |
| `get_environment` | Reads a running script's globals and imports |
| `detect_anticheat` | Scans for executor detection, hooks, and integrity checks |

### Monitoring — watch what happens
| Tool | What it does |
|---|---|
| `spy_remotes` | Captures every FireServer/InvokeServer call in real-time |
| `http_spy` | Logs all HTTP requests the game makes |
| `monitor_changes` | Watches a specific property and reports when it changes |

### Testing — break things
| Tool | What it does |
|---|---|
| `call_remote` | Fires any remote with whatever arguments you want |
| `fuzz_remote` | Blasts a remote with 13 malicious payloads and checks if your stats changed |
| `execute_probe` | Quick echo test and rate limit check on a remote |
| `snapshot_state` | Captures your full player state (coins, items, everything) |
| `snapshot_diff` | Takes a before/after snapshot to see what changed |

### Exploit — make it happen
| Tool | What it does |
|---|---|
| `fire_signal` | Simulates clicking UI buttons (open shops, accept dialogs) |
| `execute_lua` | Runs any Lua code you want inside the game |
| `read_log` | Reads the agent's debug log |

---

## Compatibility

PotassiumMCP works with any executor that supports sUNC (Semi-Unified Naming Convention). If your executor has the required globals below, it should work.

**Required globals:** `writefile`, `readfile`, `listfiles`, `delfile`, `hookmetamethod`, `firesignal`, `getgenv`, `decompile`, `getsenv`, `getscriptclosure`

---

## Troubleshooting

### Tools not showing up in your AI

1. Make sure the MCP server path in your config is an **absolute path** (not relative)
2. Check that `node` is in your system PATH — run `node --version` to verify
3. Restart your editor completely after adding the MCP config
4. Check your JSON syntax — even a missing comma will silently break the config

### "EXECUTOR_WORKSPACE is not set"

1. Open your executor and find the workspace/files directory in Settings
2. Run `node setup.js` again and paste the correct path
3. Or set `EXECUTOR_WORKSPACE` manually in your MCP config
4. Both the MCP server and the dispatcher must point to the same directory

### Tools timeout or return nothing

1. Make sure `dispatcher.lua` is running in your executor
2. Make sure you're in a game (not just on the Roblox home page)
3. Check the executor console for error messages

---

## Project structure

```
PotassiumMCP/
├── agent/
│   └── dispatcher.lua       # Runs inside Roblox — all 21 tools
├── bridge/
│   ├── package.json
│   └── src/
│       ├── mcp-server.js    # MCP server — your AI talks to this
│       ├── transport.js     # Handles temp file communication
│       ├── protocol.js      # Message format definitions
│       ├── logger.js        # Audit logging
│       └── safety.js        # Rate limiting and safety checks
├── config/
│   └── default.json         # Default settings
├── .vscode/
│   └── mcp.json             # VS Code MCP config (pre-configured)
├── .cursor/
│   └── mcp.json             # Cursor MCP config (pre-configured)
├── setup.js                 # One-command setup script
├── .gitignore
├── LICENSE
└── README.md
```

---

## Adding your own tools

Every tool has two parts: the Lua implementation and the MCP definition.

1. Write your tool function in `agent/dispatcher.lua`
2. Add the MCP schema in `bridge/src/mcp-server.js`
3. Add the tool name to the array in `bridge/src/protocol.js`

---

## License

MIT — do whatever you want with it.
