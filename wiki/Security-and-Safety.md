# Security & Safety

PotassiumMCP is a security testing toolkit. This page documents the built-in safety systems, their purpose, and how to configure them responsibly.

---

## Safety Philosophy

PotassiumMCP is designed for **authorized security testing of your own Roblox games or games you have explicit permission to test**. The built-in safety systems exist to:

1. Prevent accidental damage to sensitive game systems
2. Protect other players from being affected by your tests
3. Enforce reasonable rate limits to avoid detection and abuse
4. Provide an auditable trail of all actions taken

> **Important:** Only test games you own or have explicit written permission to test. Unauthorized testing of other players' games is a violation of Roblox's Terms of Service.

---

## Safety Controls

All safety enforcement happens in `bridge/src/safety.js` before any request is dispatched to the in-game agent.

### Rate Limiting

**Default:** 10 tool calls per second

Calls that exceed this rate are rejected immediately with a `SAFETY_BLOCKED` error. This prevents:
- Accidental DoS-style remote spam
- Rapid-fire exploitation that could flag anti-cheat systems
- CPU/memory spikes from runaway AI loops

To adjust: set `safety.max_calls_per_second` in `config/default.json`.

---

### Remote Firewall

Calls to `call_remote`, `fuzz_remote`, and `execute_probe` are blocked if the target remote's name matches any of the blocked patterns:

| Pattern | What it guards |
|---|---|
| `*Purchase*` | In-game purchase remotes |
| `*Payment*` | Payment processing |
| `*Ban*` | Player ban commands |
| `*Kick*` | Player kick commands |
| `*Admin*` | Admin panel operations |
| `*Moderate*` | Moderation actions |
| `*Delete*` | Data deletion |

Blocked calls are logged with the pattern that triggered the block.

**To customize:** Edit the `blocked_remote_patterns` array in `config/default.json`. Add Lua glob-style patterns (e.g. `"*Currency*"`) to block additional remotes.

---

### Destructive Operations Gate

By default, `destructive_operations_enabled` is `false`. This disables:
- `execute_lua` — arbitrary Lua execution
- `fuzz_remote` — bulk malicious payload fuzzing

To enable them, set `destructive_operations_enabled: true` in `config/default.json`. When `confirm_destructive` is also `true`, an additional confirmation step is required.

> Use the minimum permissions needed for your testing session. Re-disable destructive operations when you're done.

---

### Self-Targeting Only

`target_self_only: true` (default) restricts all tools to only affect the local player. This prevents:
- Accidentally modifying another player's data
- Griefing other players during testing
- Escalating from single-player testing to multi-player impact

---

### Fuzz Call Cap

`max_fuzz_calls: 50` limits the number of payload iterations the `fuzz_remote` tool will fire in a single call. This prevents runaway fuzzing that could trigger anti-cheat or exhaust server resources.

---

## Audit Logging

Every tool call is logged to a JSONL audit file. This creates a tamper-evident record of all actions taken during a session.

**Log location:** `POTASSIUM_WORKSPACE/potassiumMCP/logs/session_<timestamp>.jsonl`

**What is logged:**
- Session start/stop with timestamp
- Every tool request: method, parameters, timestamp
- Every tool response: status, timing in ms
- Every safety block: tool name and block reason
- Parse and protocol errors

**Log entry examples:**

```json
{"level":"info","event":"session_start","timestamp":"2024-01-01T12:00:00.000Z"}
{"level":"info","event":"tool_request","method":"scan_remotes","params":{"filter":null},"timestamp":"2024-01-01T12:00:00.100Z"}
{"level":"info","event":"tool_response","method":"scan_remotes","status":"ok","elapsed_ms":312,"timestamp":"2024-01-01T12:00:00.412Z"}
{"level":"warn","event":"safety_block","method":"call_remote","reason":"Remote name matches blocked pattern: *Purchase*","timestamp":"2024-01-01T12:00:01.000Z"}
```

To reduce what is stored, set `logging.include_params_in_log: false` or `logging.level: "warn"`.

---

## Executor-Level Security

The Lua agent runs inside the Roblox client with executor-level privileges. This means:

- It can read files in the executor's workspace directory
- It can hook Roblox metamethods (`__namecall`)
- It can decompile scripts using the executor's `decompile()` global
- It can execute arbitrary Lua using the executor's globals

**The agent does not:**
- Write to files outside the executor's workspace
- Contact external network endpoints
- Modify other players' data (enforced by `target_self_only`)
- Persist state between game sessions

---

## Responsible Use Guidelines

1. **Get permission first.** Only test games you own or have explicit authorization to test.
2. **Start with recon.** Use non-destructive tools (`scan_remotes`, `detect_anticheat`) before enabling destructive operations.
3. **Use `detect_anticheat` early.** Some games kick players on executor detection. Know before you act.
4. **Keep `destructive_operations_enabled: false` when not needed.** Enable it only for the duration of a specific test.
5. **Review audit logs after each session.** The JSONL logs let you audit exactly what the AI did.
6. **Report vulnerabilities responsibly.** If you find a vulnerability in a game you don't own, contact the developer privately before disclosing publicly.

---

## Security Summary for the Toolkit Itself

| Concern | Mitigation |
|---|---|
| MCP server process isolation | Runs as a separate stdio process; does not share memory with your editor |
| No credentials stored | No API keys, tokens, or passwords are required or stored |
| No outbound network calls | The MCP server and agent communicate only via local filesystem |
| Audit trail | All calls logged in JSONL; no silent operations |
| Rate limiting | Prevents runaway AI loops from spamming calls |
| Blocked remote patterns | Prevents accidental interaction with sensitive game systems |
| Destructive ops gate | Destructive tools disabled by default |
