# Configuration

PotassiumMCP is configured through `config/default.json` and environment variables. This page describes every option.

---

## Configuration File

**Location:** `config/default.json`

```json
{
  "version": "1.0.0",
  "safety": {
    "max_calls_per_second": 10,
    "blocked_remote_patterns": [
      "*Purchase*",
      "*Payment*",
      "*Ban*",
      "*Kick*",
      "*Admin*",
      "*Moderate*",
      "*Delete*"
    ],
    "destructive_operations_enabled": false,
    "confirm_destructive": true,
    "max_fuzz_calls": 50,
    "target_self_only": true
  },
  "ipc": {
    "transport": "file",
    "poll_interval_ms": 250,
    "timeout_ms": 10000,
    "file_paths": {
      "agent_out": "potassiumMCP/out",
      "agent_in": "potassiumMCP/in",
      "archive": "potassiumMCP/archive"
    }
  },
  "logging": {
    "level": "info",
    "persist_to_file": true,
    "log_directory": "potassiumMCP/logs",
    "include_params_in_log": true
  },
  "agent": {
    "version": "0.1.0",
    "auto_cleanup_processed_files": true,
    "max_decompile_size_chars": 50000,
    "max_search_results": 50
  }
}
```

---

## `safety` Section

Controls the safety policy engine. All tool calls are validated against these settings before being dispatched.

| Option | Type | Default | Description |
|---|---|---|---|
| `max_calls_per_second` | `number` | `10` | Maximum tool calls per second. Calls that exceed this rate are rejected with a `SAFETY_BLOCKED` error. |
| `blocked_remote_patterns` | `string[]` | See above | Glob-style patterns. Any `call_remote`, `fuzz_remote`, or `execute_probe` targeting a remote whose name matches one of these patterns is blocked. Prevents accidental interaction with payment, ban, or admin remotes. |
| `destructive_operations_enabled` | `boolean` | `false` | Master switch for destructive tools (`execute_lua`, `fuzz_remote`). Set to `true` to enable them. |
| `confirm_destructive` | `boolean` | `true` | When `destructive_operations_enabled` is `true`, require an additional confirmation step before executing destructive operations. |
| `max_fuzz_calls` | `number` | `50` | Maximum number of payload iterations the `fuzz_remote` tool will fire in a single session. |
| `target_self_only` | `boolean` | `true` | Restrict all tools to only affect the local player. Prevents tools from targeting other players in the game. |

### Blocked Remote Patterns

The default blocked patterns prevent accidental or malicious interaction with sensitive game systems:

| Pattern | What it blocks |
|---|---|
| `*Purchase*` | Purchase and transaction remotes |
| `*Payment*` | Payment processing remotes |
| `*Ban*` | Player ban remotes |
| `*Kick*` | Player kick remotes |
| `*Admin*` | Admin panel remotes |
| `*Moderate*` | Moderation system remotes |
| `*Delete*` | Data deletion remotes |

To add a custom blocked pattern, add a new entry to the array using Lua glob syntax (e.g. `"*Currency*"`, `"*Give*"`).

---

## `ipc` Section

Controls the file-based IPC transport between the Node.js bridge and the Lua agent.

| Option | Type | Default | Description |
|---|---|---|---|
| `transport` | `"file"` | `"file"` | IPC transport type. Currently only `"file"` is supported. |
| `poll_interval_ms` | `number` | `250` | How often (in milliseconds) the bridge polls the output directory for new response files. Lower values reduce latency but increase CPU usage. |
| `timeout_ms` | `number` | `10000` | How long (in milliseconds) the bridge waits for a response before returning a timeout error. Increase this for slow games or heavy decompile operations. |
| `file_paths.agent_out` | `string` | `"potassiumMCP/out"` | Subdirectory (relative to `POTASSIUM_WORKSPACE`) where the agent writes responses. |
| `file_paths.agent_in` | `string` | `"potassiumMCP/in"` | Subdirectory (relative to `POTASSIUM_WORKSPACE`) where the bridge writes requests. |
| `file_paths.archive` | `string` | `"potassiumMCP/archive"` | Optional archive directory for processed files. |

---

## `logging` Section

Controls the audit logger.

| Option | Type | Default | Description |
|---|---|---|---|
| `level` | `"debug" \| "info" \| "warn" \| "error"` | `"info"` | Minimum log level. `"debug"` is the most verbose; `"error"` is the least. |
| `persist_to_file` | `boolean` | `true` | Write audit logs to JSONL files on disk. |
| `log_directory` | `string` | `"potassiumMCP/logs"` | Subdirectory (relative to `POTASSIUM_WORKSPACE`) for log files. |
| `include_params_in_log` | `boolean` | `true` | Include tool call parameters in log entries. Set to `false` if you want to reduce log verbosity or avoid storing argument data. |

**Log file naming:** `session_<ISO-timestamp>.jsonl`

**Log entry format:**
```json
{"level":"info","event":"tool_request","method":"scan_remotes","params":{"filter":null},"timestamp":"2024-01-01T12:00:00.000Z"}
{"level":"info","event":"tool_response","method":"scan_remotes","status":"ok","elapsed_ms":312,"timestamp":"2024-01-01T12:00:00.312Z"}
```

---

## `agent` Section

Settings that control the in-game Lua agent's behavior.

| Option | Type | Default | Description |
|---|---|---|---|
| `version` | `string` | `"0.1.0"` | Agent version (for compatibility checking). |
| `auto_cleanup_processed_files` | `boolean` | `true` | Automatically delete temp request/response files after processing. Disable only for debugging. |
| `max_decompile_size_chars` | `number` | `50000` | Maximum character length of decompiled script source that will be returned. Scripts larger than this are truncated. |
| `max_search_results` | `number` | `50` | Maximum number of results returned by search and scan tools. |

---

## Environment Variables

| Variable | Description | Fallback |
|---|---|---|
| `POTASSIUM_WORKSPACE` | Absolute path to the executor's workspace directory. This is where the IPC temp files and logs are created. | Auto-detected from common executor install paths |

### Setting `POTASSIUM_WORKSPACE`

Set it in your AI client's MCP config under `env`:

**VS Code (`.vscode/mcp.json`):**
```json
{
  "servers": {
    "PotassiumMCP": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/PotassiumMCP/bridge/src/mcp-server.js"],
      "env": {
        "POTASSIUM_WORKSPACE": "/path/to/executor/workspace"
      }
    }
  }
}
```

**Or set it as a system environment variable:**
```bash
export POTASSIUM_WORKSPACE="/path/to/executor/workspace"
```

---

## Performance Tuning

| Goal | Setting |
|---|---|
| Reduce tool call latency | Lower `ipc.poll_interval_ms` (e.g. `100`) |
| Support slow/large games | Increase `ipc.timeout_ms` (e.g. `30000`) |
| Reduce log verbosity | Set `logging.level` to `"warn"` |
| Reduce disk usage | Set `logging.persist_to_file` to `false` |
| Allow more fuzz iterations | Increase `safety.max_fuzz_calls` |
| Allow higher call throughput | Increase `safety.max_calls_per_second` |
