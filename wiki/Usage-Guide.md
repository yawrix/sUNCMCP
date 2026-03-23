# Usage Guide

This page walks you through a complete security testing session from start to finish.

---

## Overview

A typical PotassiumMCP session has three phases:

1. **Setup** — Join a game and inject the agent
2. **Connect** — Open your AI client and confirm tools are available
3. **Test** — Let the AI guide the reconnaissance and testing workflow

---

## Step 1 — Join a Roblox Game

Open Roblox and join any game you want to test. The agent can only interact with a game that is actively running in your Roblox client.

---

## Step 2 — Inject the Agent

1. Open your executor (Potassium or any sUNC-compatible executor)
2. Copy the full contents of `agent/dispatcher.lua` from this repository
3. Paste it into the executor's script editor
4. Click **Execute**

You should see a connection banner in the executor console confirming the agent is running and polling for requests.

> **Note:** If you need to stop the agent, run this in your executor:
> ```lua
> getgenv()._pmcp_stop = true
> ```

---

## Step 3 — Open Your AI Client

Open your AI assistant (VS Code Copilot, Cursor, Claude Desktop, etc.) and confirm that the PotassiumMCP tools are visible. In most clients you'll see them listed in an MCP tools panel or the agent/tool picker.

If tools aren't showing, see [Troubleshooting](Troubleshooting.md).

---

## Step 4 — Start a Session

Simply chat with your AI. It knows all 21 tools and can call them autonomously. A good starting point is to ask it to perform reconnaissance:

> "Scan all remotes in this game and look for anything related to currency or purchases."

The AI will:
1. Call `scan_remotes` to get the list
2. Identify interesting remotes
3. Call `decompile_script` or `get_connections` to understand how they work
4. Suggest next steps (fuzzing, state diffing, etc.)

---

## Recommended Workflow

The tools are designed to be used in a progressive workflow:

### Phase 1 — Reconnaissance

| Goal | Tools to use |
|---|---|
| Find all remotes | `scan_remotes` |
| Find scripts by name | `search_scripts` |
| Get game metadata | `get_game_info` |
| Explore instance tree | `find_instances`, `inspect_instance` |
| Check for anti-cheat | `detect_anticheat` |

**Example prompts:**
- "Give me a full scan of all remotes in this game."
- "Search for scripts that contain the word 'currency'."
- "Is this game running any anti-cheat checks?"

---

### Phase 2 — Analysis

| Goal | Tools to use |
|---|---|
| Read script source | `decompile_script` |
| Understand a remote handler | `get_connections` + `decompile_script` |
| Read hidden variables | `get_upvalues` |
| Inspect script runtime state | `get_environment` |

**Example prompts:**
- "Decompile the script connected to the BuyItem remote and explain what it validates."
- "What are the upvalues of the CurrencyHandler script?"

---

### Phase 3 — Monitoring

| Goal | Tools to use |
|---|---|
| Watch all remote calls | `spy_remotes` |
| Observe HTTP calls | `http_spy` |
| Track property changes | `monitor_changes` |

**Example prompts:**
- "Start spying on all remotes. I'll go buy something in-game and you tell me what fires."
- "Watch the `leaderstats.Coins.Value` property and tell me when it changes."

---

### Phase 4 — Testing

| Goal | Tools to use |
|---|---|
| Take a baseline snapshot | `snapshot_state` |
| Fire a remote manually | `call_remote` |
| Fuzz a remote | `fuzz_remote` |
| Quick echo/rate-limit probe | `execute_probe` |
| See what changed | `snapshot_diff` |

**Example prompts:**
- "Snapshot my current state, then fuzz the BuyItem remote with all payloads, then show me the diff."
- "Fire the GiveCurrency remote with argument `{amount = 99999}` and tell me what happens."

---

### Phase 5 — Exploitation (when authorized)

| Goal | Tools to use |
|---|---|
| Simulate UI interaction | `fire_signal` |
| Run custom Lua | `execute_lua` |
| Read agent debug log | `read_log` |

**Example prompts:**
- "Click the 'Open Shop' button so the server thinks I've opened the shop UI, then fire the BuyItem remote."
- "Run `print(game:GetService('Players').LocalPlayer.leaderstats.Coins.Value)` and tell me what it returns."

---

## Stopping the Agent

To stop the agent without leaving the game:

```lua
getgenv()._pmcp_stop = true
```

The dispatcher will exit its polling loop and clean up any pending files.

---

## Tips

- **Let the AI drive.** Give it a goal and let it decide which tools to call and in what order.
- **Use `snapshot_state` before any destructive test** so you can measure what changed.
- **Use `detect_anticheat` first** in games you don't know — some games kick on executor detection.
- **Use `spy_remotes` while playing normally** to learn how the game's remotes work before calling them directly.
- **Temp files are automatically cleaned up** — no manual housekeeping needed.

---

## Next Steps

- [Tools Reference](Tools-Reference.md) — Full documentation for all 21 tools
- [Configuration](Configuration.md) — Tune timeouts, rate limits, and safety settings
- [Troubleshooting](Troubleshooting.md) — Fix common issues
