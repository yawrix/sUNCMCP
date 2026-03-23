# Troubleshooting

This page covers the most common problems and how to fix them.

---

## Tools Not Showing Up in Your AI

**Symptoms:** You open your AI client and don't see any PotassiumMCP tools in the tool picker / agent mode.

**Fixes:**

1. **Check the path is absolute.** The `args` path in your MCP config must be a full absolute path, not a relative one.
   - ❌ `"args": ["bridge/src/mcp-server.js"]`
   - ✅ `"args": ["C:\\Users\\you\\Desktop\\PotassiumMCP\\bridge\\src\\mcp-server.js"]`

2. **Verify Node.js is in your PATH.** Open a terminal and run:
   ```bash
   node --version
   ```
   If this fails, [install Node.js v18+](https://nodejs.org) and restart your terminal and editor.

3. **Restart your editor completely.** After adding or changing the MCP config, quit and relaunch your editor — a simple window reload is not enough.

4. **Check JSON syntax.** Even a single missing comma or unmatched bracket silently breaks the config. Use a JSON validator or your editor's built-in JSON linter.

5. **VS Code specific:** VS Code uses `"servers"` as the top-level key, **not** `"mcpServers"`. Double-check you're using the right key.

6. **Run the server manually** to see any startup errors:
   ```bash
   cd /path/to/PotassiumMCP/bridge
   node src/mcp-server.js
   ```

---

## `POTASSIUM_WORKSPACE` Not Found

**Symptoms:** The MCP server starts but logs a warning that it cannot find the workspace directory.

**Fix:**

1. Open your executor (Potassium, etc.) and go to **Settings**
2. Find the **workspace** or **files directory** setting and copy the path
3. Set it in your MCP config's `env` block:
   ```json
   "env": {
     "POTASSIUM_WORKSPACE": "C:\\Users\\you\\Documents\\Potassium\\workspace"
   }
   ```
4. **Both the MCP server and the Lua agent must point to the same directory.** The agent hard-codes paths relative to the workspace — if they don't match, requests and responses will never be found.

---

## Tools Time Out or Return Nothing

**Symptoms:** You call a tool and it hangs until the timeout error, or returns an empty result.

**Fixes:**

1. **Make sure the agent is running.** Open your executor and check the console — you should see the connection banner when `dispatcher.lua` is active. If not, re-execute the script.

2. **Make sure you're in a game.** The agent only works inside an active Roblox game session, not on the home screen or in studio.

3. **Check the executor console for errors.** Errors in the Lua agent print to the executor's console, not the Node.js logs.

4. **Confirm the workspace path matches.** The bridge writes to `POTASSIUM_WORKSPACE/potassiumMCP/in/` and the agent reads from the same path. If they differ, requests pile up but are never processed.

5. **Increase the timeout.** For large games with many scripts, `decompile_script` or `find_instances` can take longer than the default 10 seconds. Increase `ipc.timeout_ms` in `config/default.json`:
   ```json
   "ipc": {
     "timeout_ms": 30000
   }
   ```

---

## Tool is Blocked by Safety Policy

**Symptoms:** A tool call returns a `SAFETY_BLOCKED` error immediately.

**Fixes:**

- **Rate limit hit:** You're calling tools too fast. The default limit is 10 per second. Wait a moment and try again, or increase `safety.max_calls_per_second`.

- **Remote firewall:** The target remote name matches a blocked pattern (e.g. it contains "Purchase" or "Admin"). If you're sure you want to test this remote, remove or adjust the matching pattern in `safety.blocked_remote_patterns`.

- **Destructive ops disabled:** `execute_lua` and `fuzz_remote` require `safety.destructive_operations_enabled: true`. Enable it in `config/default.json`.

---

## `npm install` Fails

**Symptoms:** Running `node setup.js` or `npm install` in `bridge/` produces errors.

**Fixes:**

1. **Check your Node.js version:**
   ```bash
   node --version   # must be v18 or higher
   npm --version
   ```

2. **Run install manually:**
   ```bash
   cd bridge
   npm install
   ```

3. **Check for network issues.** If you're behind a corporate proxy, configure npm's proxy settings:
   ```bash
   npm config set proxy http://your-proxy:port
   npm config set https-proxy http://your-proxy:port
   ```

4. **Clear npm cache and retry:**
   ```bash
   npm cache clean --force
   npm install
   ```

---

## Agent Crashes After Injection

**Symptoms:** The executor console shows a Lua error shortly after executing `dispatcher.lua`.

**Fixes:**

1. **Check executor compatibility.** The agent requires these globals: `writefile`, `readfile`, `listfiles`, `delfile`, `hookmetamethod`, `firesignal`, `getgenv`, `decompile`, `getsenv`, `getscriptclosure`. If your executor doesn't support all of them, some tools will fail.

2. **Re-copy the script.** Make sure you're using the latest version of `dispatcher.lua` and didn't accidentally truncate it when copying.

3. **Check the workspace path.** If the workspace directory doesn't exist, `writefile` calls will fail. Create it manually if needed.

---

## `spy_remotes` Not Capturing Calls

**Symptoms:** You started `spy_remotes` with `action: "start"` but `read` returns nothing.

**Fixes:**

1. The spy hooks `__namecall` at the time `start` is called. **Calls made before starting the spy are not captured.**
2. Play the game and trigger the remotes *after* calling `spy_remotes` with `action: "start"`.
3. Some games hook `__namecall` themselves (anti-cheat) which can interfere. Run `detect_anticheat` first to check.

---

## High Latency on Every Tool Call

**Symptoms:** Every tool call takes 250–500ms longer than expected.

**Cause:** The default poll interval is 250ms, so the bridge can take up to 250ms just to detect the response file.

**Fix:** Lower `ipc.poll_interval_ms` in `config/default.json`:
```json
"ipc": {
  "poll_interval_ms": 50
}
```

This increases CPU usage slightly but reduces perceived latency.

---

## Need More Help?

- Check the [audit logs](Configuration.md#logging-section) at `POTASSIUM_WORKSPACE/potassiumMCP/logs/` for detailed per-request information.
- Set `logging.level` to `"debug"` to get verbose output from the MCP server.
- Read the [Architecture](Architecture.md) page to understand the full request/response flow.
- Open an issue on [GitHub](https://github.com/yawrix/PotassiumMCP/issues).
