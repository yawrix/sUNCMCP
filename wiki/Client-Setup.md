# Client Setup

PotassiumMCP works with any AI client that supports **stdio MCP transport**. This page covers setup for every officially supported client.

> **Replace `YOUR_USERNAME`** with your actual system username in all path examples below.

---

## JSON Configuration Templates

All clients use a JSON config. The format differs slightly per client, but the core values are the same.

### Windows

```json
{
  "mcpServers": {
    "PotassiumMCP": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\Desktop\\PotassiumMCP\\bridge\\src\\mcp-server.js"],
      "env": {
        "POTASSIUM_WORKSPACE": "C:\\Users\\YOUR_USERNAME\\Documents\\Potassium\\workspace"
      }
    }
  }
}
```

### macOS / Linux

```json
{
  "mcpServers": {
    "PotassiumMCP": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/Desktop/PotassiumMCP/bridge/src/mcp-server.js"],
      "env": {
        "POTASSIUM_WORKSPACE": "/Users/YOUR_USERNAME/Documents/Potassium/workspace"
      }
    }
  }
}
```

> **Tip:** If `node setup.js` ran successfully, the configs for VS Code and Cursor are already generated with your correct absolute paths.

---

## VS Code (GitHub Copilot)

VS Code reads MCP server config from `.vscode/mcp.json`. Note: VS Code uses **`"servers"`** as the top-level key, not `"mcpServers"`.

### Option A — Use the pre-configured file (recommended)

If you ran `node setup.js`, `.vscode/mcp.json` is already generated. Just open the PotassiumMCP folder in VS Code.

### Option B — Create manually

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
        "POTASSIUM_WORKSPACE": "C:\\Users\\YOUR_USERNAME\\Documents\\Potassium\\workspace"
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
        "POTASSIUM_WORKSPACE": "/Users/YOUR_USERNAME/Documents/Potassium/workspace"
      }
    }
  }
}
```

### Option C — Global user config

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **MCP: Open User Configuration**
3. Add the server entry using the `"servers"` format

### Verify

1. Open GitHub Copilot Chat
2. Switch to **Agent Mode**
3. Click the **Tools** icon
4. Confirm PotassiumMCP tools appear in the list

---

## Cursor

Cursor reads MCP server config from `.cursor/mcp.json`. It uses the standard `"mcpServers"` key format.

### Option A — Use the pre-configured file (recommended)

If you ran `node setup.js`, `.cursor/mcp.json` is already generated. Open the PotassiumMCP folder in Cursor.

### Option B — Settings UI

1. Go to **File > Preferences > Cursor Settings**
2. Select **MCP** in the sidebar
3. Click **Add new global MCP server**
4. Paste the `mcpServers` JSON config from above

### Option C — Edit global config

Edit `~/.cursor/mcp.json` directly and add the `PotassiumMCP` entry.

### Verify

In **Cursor Settings > MCP**, the PotassiumMCP server should show a green status indicator.

---

## Claude Desktop

1. Open **Claude > Settings...**
2. Go to the **Developer** tab and click **Edit Config**
3. Add the JSON from the templates above (use the `mcpServers` format)
4. **Quit and relaunch** Claude Desktop completely
5. Click the **hammer icon** below the chat input to verify tools appear

**Config file locations:**

| OS | Path |
|---|---|
| Windows | `C:\Users\YOUR_USERNAME\AppData\Roaming\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |

---

## Claude Code

Register the MCP server from the command line:

**Windows:**
```bash
claude mcp add PotassiumMCP -- node C:\Users\YOUR_USERNAME\Desktop\PotassiumMCP\bridge\src\mcp-server.js
```

**macOS / Linux:**
```bash
claude mcp add PotassiumMCP -- node /Users/YOUR_USERNAME/Desktop/PotassiumMCP/bridge/src/mcp-server.js
```

Set the workspace environment variable:
```bash
claude mcp add-env PotassiumMCP POTASSIUM_WORKSPACE /path/to/your/executor/workspace
```

**Verify:** Run `/mcp` in Claude Code — you should see `PotassiumMCP: connected`.

---

## Google Antigravity

1. Click the **three dots (…)** at the top of the Agent pane and select **MCP Servers**
2. Click **Manage MCP Servers > View raw config**
3. Add the JSON from the templates above (use the `mcpServers` format)
4. Refresh the MCP Servers panel and verify PotassiumMCP tools appear

**Config file locations:**

| OS | Path |
|---|---|
| macOS | `~/.gemini/antigravity/mcp_config.json` |
| Windows | `C:\Users\YOUR_USERNAME\.gemini\antigravity\mcp_config.json` |

---

## Other MCP Clients

PotassiumMCP works with any client that supports **stdio transport**. Use the JSON template above and consult your client's documentation for where to place the config.

---

## Next Steps

- [Usage Guide](Usage-Guide.md) — Run your first security test
- [Troubleshooting](Troubleshooting.md) — Fix common setup issues
