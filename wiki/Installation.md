# Installation

This page covers everything you need to get PotassiumMCP installed and running.

---

## Prerequisites

Before you begin, make sure you have:

| Requirement | Notes |
|---|---|
| **Roblox Executor** | [Potassium](https://voxlis.net/) or any sUNC-compatible executor (Krnl, Synapse, etc.) |
| **Node.js v18+** | Download from [nodejs.org](https://nodejs.org). Verify with `node --version`. |
| **Git** | Optional — you can also download a ZIP from GitHub |
| **MCP-compatible AI client** | VS Code, Cursor, Claude Desktop, Claude Code, or Antigravity |

---

## 1. Clone the Repository

```bash
git clone https://github.com/yawrix/PotassiumMCP.git
cd PotassiumMCP
```

Or download the ZIP from GitHub and extract it anywhere on your machine.

---

## 2. Run the Setup Wizard

```bash
node setup.js
```

The setup script does the following automatically:

1. **Installs npm dependencies** in the `bridge/` directory (`@modelcontextprotocol/sdk`, `zod`)
2. **Auto-detects your executor's workspace directory** by checking common install locations:
   - **Windows:** `C:\Users\<USER>\Documents\Potassium\workspace`, `AppData\Local\Potassium\workspace`
   - **macOS/Linux:** `~/Documents/Potassium/workspace`, `~/.potassium/workspace`
3. **Generates `.vscode/mcp.json`** — pre-configured for VS Code / GitHub Copilot
4. **Generates `.cursor/mcp.json`** — pre-configured for Cursor
5. **Prints ready-to-paste configs** for Claude Desktop, Claude Code, and other clients

That's it. One command and you're ready.

---

## 3. Manual Dependency Install (if needed)

If you prefer not to use the setup wizard, install dependencies manually:

```bash
cd bridge
npm install
```

---

## 4. Configure Your AI Client

After setup, configure your AI client to point at the MCP server. See [Client Setup](Client-Setup.md) for per-client instructions.

---

## 5. Find Your Executor Workspace Path

Both the MCP server and the Lua agent must use the **same workspace directory**. This is the folder where your executor reads and writes files.

To find it:
1. Open your executor (Potassium, etc.)
2. Go to **Settings** and look for a **Workspace** or **Files** directory setting
3. Copy that absolute path

If workspace auto-detection fails, set the `POTASSIUM_WORKSPACE` environment variable in your MCP config to the correct path.

---

## 6. Verify the Installation

Start the MCP server manually to check for errors:

```bash
cd bridge
node src/mcp-server.js
```

If it starts without errors, you'll see a log line confirming the workspace path and tool count.

---

## Updating

To update to the latest version:

```bash
git pull
cd bridge
npm install
```

Re-run `node setup.js` from the project root if you want to regenerate your editor configs.

---

## Uninstalling

1. Remove the `PotassiumMCP` entry from your AI client's MCP config
2. Delete the cloned directory
3. Remove the `PotassiumMCP` entry from `.vscode/mcp.json` or `.cursor/mcp.json` if you kept them

---

## Next Steps

- [Client Setup](Client-Setup.md) — Configure your AI client
- [Usage Guide](Usage-Guide.md) — Run your first security test
