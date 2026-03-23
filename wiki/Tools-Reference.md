# Tools Reference

Complete reference for all 21 PotassiumMCP tools. Tools are organized by category, matching the phases of a typical security testing session.

---

## Recon Tools

These tools map the game's structure. Start here before analyzing or testing anything.

---

### `scan_remotes`

Scan all client-visible `RemoteEvent` and `RemoteFunction` instances in the game. Returns their names, class types, and full instance paths.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filter` | `string` | No | Lua pattern to filter remote names (e.g. `"Buy"` to match any remote with "Buy" in the name) |
| `include_path` | `boolean` | No | Include the full instance path in results (default: `true`) |

**Example AI prompt:** *"Scan all remotes and flag any that look purchase-related."*

---

### `search_scripts`

Find scripts by name pattern, source content, or class type. Can optionally decompile and return full source.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name_pattern` | `string` | No | Lua pattern to match script names |
| `content_pattern` | `string` | No | Lua pattern to search within decompiled source |
| `class_filter` | `"LocalScript" \| "ModuleScript" \| "all"` | No | Filter by script class (default: `"all"`) |
| `max_results` | `number` | No | Maximum results to return (default: `20`) |
| `include_source` | `boolean` | No | Include full decompiled source in results (default: `false`) |

**Example AI prompt:** *"Search for scripts that contain the word 'currency' or 'coins'."*

---

### `find_instances`

Deep recursive search across the entire instance tree — including all services and nil-parented objects. Useful for finding hidden admin panels, dev tools, or game objects.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name_pattern` | `string` | No | Lua pattern to match instance names |
| `class_name` | `string` | No | Exact `ClassName` to filter by (e.g. `"Frame"`, `"Part"`) |
| `property_name` | `string` | No | Property name to check for existence or value match |
| `property_value` | `string` | No | Expected property value (string comparison) |
| `max_results` | `number` | No | Maximum results to return (default: `50`) |
| `search_nil` | `boolean` | No | Include nil-parented instances (default: `true`) |

**Example AI prompt:** *"Find all instances with 'admin' in their name, including nil-parented ones."*

---

### `inspect_instance`

Get the detailed properties and children of a specific instance by its full path.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | **Yes** | Full instance path (e.g. `"Workspace.Map.Door"`) |
| `properties` | `string[]` | No | Specific property names to read |
| `children_depth` | `number` | No | Depth of children to include (default: `1`) |

**Example AI prompt:** *"Inspect `ReplicatedStorage.GameData` and list all its children and values."*

---

### `get_game_info`

Get metadata about the currently running game: Game ID, Place ID, version, player count, and executor info.

**Parameters:** None

**Example AI prompt:** *"What game am I in? Give me the full metadata."*

---

### `get_connections`

List all script connections on a specific `RemoteEvent`, `RemoteFunction`, or signal.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | **Yes** | Full instance path to the remote |
| `signal` | `string` | No | Signal name to inspect (default: `"OnClientEvent"`) |

**Example AI prompt:** *"What scripts are connected to `ReplicatedStorage.Remotes.BuyItem`?"*

---

## Analysis Tools

These tools help you understand the game's code and runtime state.

---

### `decompile_script`

Fully decompile a script and return its source code, line count, and size.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | **Yes** | Full instance path to the script (e.g. `"ReplicatedStorage.Modules.GameManager"`) |

**Example AI prompt:** *"Decompile the script at `ReplicatedStorage.Modules.CurrencyHandler` and find where it validates purchase amounts."*

---

### `get_upvalues`

Inspect a script's closure to read its upvalues (hidden state variables like coin counts, multipliers, or admin flags) and constants. Uses `getscriptclosure` + `debug.getupvalue` + `getconstants`.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | **Yes** | Full instance path to the script |

**Example AI prompt:** *"Read the upvalues of the economy module. Are there any admin flags or hardcoded price constants?"*

---

### `get_environment`

Read a running script's environment using `getsenv()`. Returns globals, functions, tables, and their values — effectively showing what the script has imported and what runtime state it holds.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | **Yes** | Full instance path to a running script |

**Example AI prompt:** *"What's in the environment of the `ShopHandler` LocalScript? What modules has it required?"*

---

### `detect_anticheat`

Scan the game for anti-cheat systems. Checks for executor detection globals in scripts, `__namecall` hooks, heartbeat/integrity remotes, and `RunService` monitoring patterns. Returns a risk level (`low` / `medium` / `high`) and a list of findings.

**Parameters:** None

**Example AI prompt:** *"Before I start testing, check if this game has any anti-cheat that might kick me."*

---

## Monitoring Tools

These tools let you observe what happens in real-time without actively interfering.

---

### `spy_remotes`

Monitor all `RemoteEvent`/`RemoteFunction` traffic in real-time by hooking `__namecall`. Captures the remote name, arguments, and call stack for every `FireServer`/`InvokeServer` call.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | `"start" \| "stop" \| "read" \| "clear"` | No | Action to perform (default: `"read"`) |
| `max_entries` | `number` | No | Max entries to keep in the capture buffer (default: `200`) |
| `count` | `number` | No | Number of entries to return when reading (default: `50`) |
| `filter` | `string` | No | Lua pattern to filter by remote name |

**Workflow:**
1. Call with `action: "start"` to begin capturing
2. Play the game normally (buy something, open a shop, level up)
3. Call with `action: "read"` to retrieve captured calls
4. Call with `action: "stop"` or `"clear"` when done

**Example AI prompt:** *"Start spying on remotes. I'm going to buy an item in the shop, then you read what fired."*

---

### `http_spy`

Monitor HTTP requests made by the game. Hooks `HttpService:RequestAsync` to capture URLs, methods, headers, and body data.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | `"start" \| "stop" \| "read"` | No | Action to perform (default: `"read"`) |

**Example AI prompt:** *"Start HTTP spy and tell me what external APIs this game calls."*

---

### `monitor_changes`

Watch a specific instance property for changes over a time window. Ideal for cause-and-effect analysis: fire a remote, then see which values change.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | **Yes** | Full instance path to the instance to monitor |
| `property` | `string` | **Yes** | Property name to watch (e.g. `"Value"`) |
| `duration_ms` | `number` | No | How long to monitor in milliseconds (default: `5000`, max: `30000`) |

**Example AI prompt:** *"Watch `Players.LocalPlayer.leaderstats.Coins.Value` for 10 seconds while I try to exploit something."*

---

## Testing Tools

These tools actively interact with the game to probe for vulnerabilities.

---

### `call_remote`

Fire a `RemoteEvent` or invoke a `RemoteFunction` with specified arguments. Use this to test how the server handles client calls directly.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | **Yes** | Full instance path to the remote (e.g. `"ReplicatedStorage.Remotes.BuyItem"`) |
| `args` | `any[]` | No | Arguments to pass to the remote |
| `timeout_ms` | `number` | No | Timeout for `RemoteFunction` responses in milliseconds (default: `5000`) |

**Example AI prompt:** *"Call the `PurchaseItem` remote with argument `{itemId = 'SwordOfDoom', price = 0}`."*

---

### `fuzz_remote`

Automated economy-breaking fuzzer. Fires a remote with 13 malicious payloads (e.g. `nil`, `0`, `-1`, `-999999`, `MAX_INT`, `NaN`, `Inf`, wrong types) at a specified argument position. Captures `leaderstats` before and after to detect economy impact.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | **Yes** | Full instance path to the remote |
| `base_args` | `any[]` | No | Normal arguments the remote expects; the `fuzz_index` position will be replaced with each payload |
| `fuzz_index` | `number` | No | Which argument position (1-indexed) to fuzz (default: `1`) |
| `payloads` | `{ label: string, value: any }[]` | No | Custom payloads to use instead of the built-in defaults |

**Built-in payloads:** `nil`, `0`, `-1`, `-999999`, `2147483647` (MAX_INT), `NaN`, `Inf`, `-Inf`, `""` (empty string), `{}` (empty table), `true`, `false`, random large string

**Example AI prompt:** *"Fuzz the `BuyItem` remote at argument position 2 (the price). Base args are `{'SwordOfDoom', 100}`. Did my coins change?"*

---

### `execute_probe`

Run a predefined security micro-test against a target remote.

**Available probes:**

| Probe | Description |
|---|---|
| `remote_echo_test` | Fires the remote and checks if the response echoes back sensitive data |
| `rate_limit_check` | Rapidly fires the remote multiple times to check if the server enforces rate limits |

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `probe` | `"remote_echo_test" \| "rate_limit_check"` | **Yes** | Probe to run |
| `target` | `string` | **Yes** | Full instance path of the remote to test |
| `params` | `Record<string, any>` | No | Probe-specific parameters |

**Example AI prompt:** *"Run a rate limit check on the `PurchaseItem` remote. Does it let me fire it 50 times in a row?"*

---

### `snapshot_state`

Capture a structured snapshot of the local player's full state, including character, backpack, leaderstats, and `PlayerGui`.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sections` | `string[]` | No | Sections to capture: `"character"`, `"backpack"`, `"leaderstats"`, `"playergui"`, `"playerdata"` |
| `depth` | `number` | No | Instance tree depth for each section (default: `3`) |

**Example AI prompt:** *"Snapshot my full player state before I start testing. I want a baseline."*

---

### `snapshot_diff`

Take a state snapshot, wait a specified duration, then report what changed. Perfect for observing the effects of a remote call without manually comparing values.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sections` | `string[]` | No | State sections to diff: `"character"`, `"leaderstats"` |
| `wait_ms` | `number` | No | Milliseconds to wait between snapshots (default: `2000`) |
| `description` | `string` | No | Description of what is being observed (included in the report) |

**Example AI prompt:** *"Take a 5-second diff of my leaderstats while I fire the BuyItem remote."*

---

## Exploit Tools

These tools provide direct execution capabilities for situations no other tool covers.

---

### `fire_signal`

Simulate a UI interaction by firing a signal on a GUI element. Useful for satisfying prerequisites — like opening a shop or accepting a dialog — before testing a remote that requires those steps.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | **Yes** | Full instance path to the GUI element (e.g. `"Players.LocalPlayer.PlayerGui.ScreenGui.shop.buyButton"`) |
| `signal` | `string` | No | Signal name to fire (default: `"MouseButton1Click"`). Others: `"MouseButton2Click"`, `"Activated"`, `"MouseEnter"` |
| `args` | `any[]` | No | Arguments to pass to the signal |
| `wait_ms` | `number` | No | Milliseconds to wait after firing so the game can react (default: `0`) |

**Example AI prompt:** *"Click the 'Open Shop' button in the PlayerGui, wait 500ms for the server to register it, then fire the BuyItem remote."*

---

### `execute_lua`

Execute arbitrary Lua code in the game context. Runs with full executor API access. Use `return {...}` to pass data back to the AI.

**Pre-injected variables:** `player`, `rs` (ReplicatedStorage), `workspace`, `json_encode`

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `code` | `string` | **Yes** | Lua code to execute. Use `return {...}` to send data back as JSON. |
| `description` | `string` | No | Human-readable description of what the code does (logged in the audit trail) |

**Example AI prompt:** *"Run `return {coins = player.leaderstats.Coins.Value}` and tell me my current coin count."*

> ⚠️ **Safety note:** This tool is gated by `destructive_operations_enabled` in the safety config. See [Security & Safety](Security-and-Safety.md).

---

### `read_log`

Read recent log entries from the agent's debug log for troubleshooting and audit purposes.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `level` | `"debug" \| "info" \| "warn" \| "error"` | No | Filter by log level |
| `max_entries` | `number` | No | Maximum entries to return (default: `50`) |

**Example AI prompt:** *"Read the last 20 error-level log entries from the agent."*

---

## Summary Table

| Tool | Category | Description |
|---|---|---|
| `scan_remotes` | Recon | List all RemoteEvents/Functions |
| `search_scripts` | Recon | Find scripts by name or source content |
| `find_instances` | Recon | Deep search across the full instance tree |
| `inspect_instance` | Recon | Read properties and children of an instance |
| `get_game_info` | Recon | Game ID, Place ID, version, executor info |
| `get_connections` | Recon | Scripts connected to a remote or signal |
| `decompile_script` | Analysis | Full source code of a script |
| `get_upvalues` | Analysis | Hidden upvalues and constants in a closure |
| `get_environment` | Analysis | Runtime globals and imports of a script |
| `detect_anticheat` | Analysis | Scan for anti-cheat patterns and risk level |
| `spy_remotes` | Monitoring | Capture all FireServer/InvokeServer calls |
| `http_spy` | Monitoring | Capture all HttpService requests |
| `monitor_changes` | Monitoring | Watch a property for changes over time |
| `call_remote` | Testing | Fire a remote with custom arguments |
| `fuzz_remote` | Testing | Blast a remote with 13 malicious payloads |
| `execute_probe` | Testing | Run a predefined micro-test on a remote |
| `snapshot_state` | Testing | Capture the full player state |
| `snapshot_diff` | Testing | Before/after diff of player state |
| `fire_signal` | Exploit | Simulate clicking a UI element |
| `execute_lua` | Exploit | Execute arbitrary Lua in the game |
| `read_log` | Exploit | Read the agent's debug log |
