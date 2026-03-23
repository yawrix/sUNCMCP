# Contributing

This page explains how to add custom tools to PotassiumMCP and how to contribute improvements back to the project.

---

## Adding a Custom Tool

Every tool in PotassiumMCP has two parts that must both be updated:

1. **The Lua implementation** in `agent/dispatcher.lua` — runs inside Roblox
2. **The MCP schema** in `bridge/src/mcp-server.js` — exposes the tool to the AI
3. **The tool name registration** in `bridge/src/protocol.js`

### Step 1 — Write the Lua Implementation

Open `agent/dispatcher.lua` and add your tool function. Find the section where the other tool implementations live (look for `-- tool: scan_remotes` style comments) and add yours nearby.

**Function signature:**
```lua
local function my_tool(params)
  -- params is a Lua table of the parameters from the MCP schema
  -- return a Lua table that will be JSON-serialized as the result
  return {
    my_field = "some value"
  }
end
```

**Register it in the dispatcher table** (find the `handlers` or `dispatch` table near the bottom of the file):
```lua
handlers["my_tool"] = my_tool
```

**Error handling:** Wrap risky calls in `pcall`. The dispatcher wraps each tool call in `pcall` at the top level, but inner errors benefit from their own handling for better error messages.

```lua
local function my_tool(params)
  local ok, result = pcall(function()
    -- your logic here
    return { value = someRobloxCall() }
  end)
  if not ok then
    return { error = tostring(result) }
  end
  return result
end
```

### Step 2 — Add the MCP Schema

Open `bridge/src/mcp-server.js` and add a new `server.tool(...)` call. Copy the pattern from an existing tool:

```js
server.tool(
  'my_tool',
  'One-sentence description of what this tool does.',
  {
    // Zod schema for your parameters
    my_param: z.string().describe('Description of my_param'),
    optional_param: z.number().optional().describe('An optional number (default: 10)'),
  },
  async ({ my_param, optional_param }) => {
    const result = await callTool('my_tool', { my_param, optional_param });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);
```

**Available Zod types:** `z.string()`, `z.number()`, `z.boolean()`, `z.array(...)`, `z.record(...)`, `z.enum([...])`, `z.any()`. Chain `.optional()` for optional parameters and `.describe('...')` for the AI's parameter documentation.

### Step 3 — Register the Tool Name

Open `bridge/src/protocol.js` and add your tool name to the `KNOWN_TOOLS` array:

```js
export const KNOWN_TOOLS = [
  'scan_remotes',
  // ... existing tools ...
  'my_tool',  // ← add this
];
```

### Step 4 — Test Your Tool

1. Re-inject the updated `dispatcher.lua` into Roblox
2. Restart the MCP server (your AI client will restart it automatically if configured for stdio)
3. Ask your AI to call the new tool

---

## Project Structure Quick Reference

| File | What to edit |
|---|---|
| `agent/dispatcher.lua` | Add the Lua tool function and register it in the handler table |
| `bridge/src/mcp-server.js` | Add `server.tool(...)` with Zod schema |
| `bridge/src/protocol.js` | Add the tool name to `KNOWN_TOOLS` |
| `config/default.json` | Adjust safety or IPC settings if your tool needs it |

---

## Code Style

### Lua (`dispatcher.lua`)

- Use `local` for all variables
- Use `pcall` for any Roblox API calls that might error
- Return a plain Lua table from every tool function
- Keep functions focused — one responsibility per function
- Use the existing `json_encode` helper (already available as a global inside the dispatcher) to serialize data

### JavaScript (`bridge/src/`)

- ES modules (`import`/`export`) — the project uses `"type": "module"` in `package.json`
- Use `async`/`await` — all tool handlers are async
- Use Zod for all parameter validation — never pass unvalidated input to `callTool()`
- Follow the existing pattern: validate → call → return `{ content: [{ type: 'text', text: JSON.stringify(...) }] }`

---

## Submitting a Pull Request

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-tool`
3. Make your changes (see above)
4. Test against a live Roblox game session
5. Open a pull request against `main` with a clear description of what your tool does and why it's useful

**Before opening a PR:**
- Make sure the tool works end-to-end (Lua → IPC → MCP → AI)
- Make sure existing tools still work (don't break the dispatcher loop)
- Keep the change minimal — one tool per PR is ideal

---

## Reporting Bugs

Open an issue on [GitHub](https://github.com/yawrix/PotassiumMCP/issues) with:
- A description of what you expected to happen
- A description of what actually happened
- Relevant log entries from `POTASSIUM_WORKSPACE/potassiumMCP/logs/`
- Your executor name and OS

---

## License

PotassiumMCP is MIT licensed. Contributions you submit are also licensed under MIT.
