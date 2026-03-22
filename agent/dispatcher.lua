--[[
  PotassiumMCP — Interactive Agent Dispatcher v0.1.0
  ===================================================
  Runs inside Roblox via Potassium. Listens for commands from the
  host-side bridge via file-based IPC and dispatches tool calls.
  
  HOW IT WORKS:
  1. Bridge writes request JSON to: workspace/potassiumMCP/in/<id>.json
  2. Agent polls the in/ directory, reads and deletes request files.
  3. Agent executes the requested tool and writes response to out/<id>.json
  4. Bridge reads the response file.
  
  HOW TO RUN:
  1. Start the bridge on your PC:
       node bridge/src/index.js --workspace <PotassiumWorkspacePath>
  2. Join the target game in Roblox.
  3. Execute this script in Potassium.
  4. The agent will begin polling for commands.
  
  STOP: Execute getgenv()._pmcp_stop = true to gracefully stop.
  
  AUTHORIZATION REQUIRED: Only use on games with written permission.
]]

-- ============================================================================
-- Configuration
-- ============================================================================

local CONFIG = {
    VERSION = "0.1.0",
    BASE_DIR = "potassiumMCP",
    IN_DIR = "potassiumMCP/in",
    OUT_DIR = "potassiumMCP/out",
    LOG_DIR = "potassiumMCP/logs",
    POLL_INTERVAL = 0.25,  -- seconds
    MAX_LOG_ENTRIES = 500,
}

-- ============================================================================
-- Inline JSON encoder (self-contained)
-- ============================================================================

local json_encode
do
    local esc = {
        ["\\"] = "\\\\", ['"'] = '\\"', ["\n"] = "\\n",
        ["\r"] = "\\r", ["\t"] = "\\t", ["\b"] = "\\b", ["\f"] = "\\f",
    }
    local function escape(s)
        return s:gsub('[\\"%c]', function(c)
            return esc[c] or string.format("\\u%04x", string.byte(c))
        end)
    end
    local function is_arr(t)
        local i = 0
        for _ in pairs(t) do i += 1; if t[i] == nil then return false end end
        return true
    end
    local enc
    enc = function(v, ind, lvl)
        local t = type(v)
        if v == nil then return "null"
        elseif t == "boolean" then return v and "true" or "false"
        elseif t == "number" then
            if v ~= v then return "null" end
            return tostring(v)
        elseif t == "string" then return '"' .. escape(v) .. '"'
        elseif t == "table" then
            local nl = ind and "\n" or ""
            local sp = ind and string.rep("  ", lvl + 1) or ""
            local cl = ind and string.rep("  ", lvl) or ""
            if is_arr(v) then
                if #v == 0 then return "[]" end
                local p = {}
                for i, item in ipairs(v) do p[i] = sp .. enc(item, ind, lvl + 1) end
                return "[" .. nl .. table.concat(p, "," .. nl) .. nl .. cl .. "]"
            else
                local p = {}
                for k, val in pairs(v) do
                    if type(k) == "string" then
                        table.insert(p, sp .. '"' .. escape(k) .. '": ' .. enc(val, ind, lvl + 1))
                    end
                end
                if #p == 0 then return "{}" end
                return "{" .. nl .. table.concat(p, "," .. nl) .. nl .. cl .. "}"
            end
        else return "null" end
    end
    json_encode = function(v) return enc(v, true, 0) end
end

-- Minimal JSON decoder for reading request files
local json_decode
do
    local function skip_ws(s, i)
        return s:match("^%s*()", i)
    end
    
    local parse_value -- forward decl
    
    local function parse_string(s, i)
        local j = i + 1 -- skip opening "
        local parts = {}
        while j <= #s do
            local c = s:sub(j, j)
            if c == '"' then
                return table.concat(parts), j + 1
            elseif c == '\\' then
                j += 1
                local esc_c = s:sub(j, j)
                if esc_c == 'n' then table.insert(parts, '\n')
                elseif esc_c == 'r' then table.insert(parts, '\r')
                elseif esc_c == 't' then table.insert(parts, '\t')
                elseif esc_c == '"' then table.insert(parts, '"')
                elseif esc_c == '\\' then table.insert(parts, '\\')
                elseif esc_c == '/' then table.insert(parts, '/')
                elseif esc_c == 'u' then
                    -- Skip unicode escapes (basic)
                    table.insert(parts, '?')
                    j += 4
                else
                    table.insert(parts, esc_c)
                end
            else
                table.insert(parts, c)
            end
            j += 1
        end
        error("Unterminated string")
    end
    
    local function parse_number(s, i)
        local j = s:match("^%-?%d+%.?%d*[eE]?[+-]?%d*()", i)
        return tonumber(s:sub(i, j - 1)), j
    end
    
    local function parse_array(s, i)
        local arr = {}
        i = skip_ws(s, i + 1) -- skip [
        if s:sub(i, i) == ']' then return arr, i + 1 end
        while true do
            local val
            val, i = parse_value(s, i)
            table.insert(arr, val)
            i = skip_ws(s, i)
            local c = s:sub(i, i)
            if c == ']' then return arr, i + 1
            elseif c == ',' then i = skip_ws(s, i + 1)
            else error("Expected , or ] in array at " .. i) end
        end
    end
    
    local function parse_object(s, i)
        local obj = {}
        i = skip_ws(s, i + 1) -- skip {
        if s:sub(i, i) == '}' then return obj, i + 1 end
        while true do
            i = skip_ws(s, i)
            if s:sub(i, i) ~= '"' then error("Expected string key at " .. i) end
            local key
            key, i = parse_string(s, i)
            i = skip_ws(s, i)
            if s:sub(i, i) ~= ':' then error("Expected : at " .. i) end
            i = skip_ws(s, i + 1)
            local val
            val, i = parse_value(s, i)
            obj[key] = val
            i = skip_ws(s, i)
            local c = s:sub(i, i)
            if c == '}' then return obj, i + 1
            elseif c == ',' then i = skip_ws(s, i + 1)
            else error("Expected , or } in object at " .. i) end
        end
    end
    
    parse_value = function(s, i)
        i = skip_ws(s, i)
        local c = s:sub(i, i)
        if c == '"' then return parse_string(s, i)
        elseif c == '{' then return parse_object(s, i)
        elseif c == '[' then return parse_array(s, i)
        elseif c == 't' then return true, i + 4
        elseif c == 'f' then return false, i + 5
        elseif c == 'n' then return nil, i + 4
        elseif c == '-' or (c >= '0' and c <= '9') then return parse_number(s, i)
        else error("Unexpected character at " .. i .. ": " .. c) end
    end
    
    json_decode = function(s)
        local val, _ = parse_value(s, 1)
        return val
    end
end

-- ============================================================================
-- Utility helpers
-- ============================================================================

local function safe(fn)
    local ok, result = pcall(fn)
    return ok and result or nil
end

local function get_path(inst)
    local ok, p = pcall(function() return inst:GetFullName() end)
    return ok and p or "(unknown)"
end

local function timestamp()
    local ok, t = pcall(function() return os.date("!%Y-%m-%dT%H:%M:%SZ") end)
    return ok and t or tostring(os.time())
end

local function resolve_instance(path_str)
    local parts = path_str:split(".")
    local current = game
    for i, part in ipairs(parts) do
        if i == 1 and part == "game" then
            continue
        end
        local child = current:FindFirstChild(part)
        if not child then
            -- Try service
            local ok, svc = pcall(function() return game:GetService(part) end)
            if ok and svc then
                current = svc
            else
                return nil, "Instance not found at: " .. path_str .. " (failed at '" .. part .. "')"
            end
        else
            current = child
        end
    end
    return current, nil
end

-- ============================================================================
-- Internal log buffer
-- ============================================================================

local log_buffer = {}

local function log(level, source, message)
    table.insert(log_buffer, {
        timestamp = timestamp(),
        level = level,
        source = source,
        message = message,
    })
    -- Trim if too large
    if #log_buffer > CONFIG.MAX_LOG_ENTRIES then
        table.remove(log_buffer, 1)
    end
    -- Console output
    if level == "error" then
        warn("[PMCP:" .. source .. "] " .. message)
    else
        print("[PMCP:" .. source .. "] " .. message)
    end
end

-- ============================================================================
-- Tool implementations
-- ============================================================================

local tools = {}

function tools.scan_remotes(params)
    local filter_pattern = params and params.filter or nil
    local include_path = params and params.include_path
    if include_path == nil then include_path = true end
    
    local result = { events = {}, functions = {}, count = 0 }
    local seen = {}
    local start = os.clock()
    
    local search_roots = {}
    for _, name in ipairs({"ReplicatedStorage", "ReplicatedFirst", "Workspace", "StarterPlayer", "StarterGui", "StarterPack", "Lighting", "SoundService"}) do
        pcall(function() table.insert(search_roots, game:GetService(name)) end)
    end
    
    local function scan(root)
        pcall(function()
            for _, obj in ipairs(root:GetDescendants()) do
                if seen[obj] then continue end
                seen[obj] = true
                local class = safe(function() return obj.ClassName end)
                local name = safe(function() return obj.Name end) or "?"
                
                if filter_pattern and not name:match(filter_pattern) then continue end
                
                if class == "RemoteEvent" or class == "UnreliableRemoteEvent" then
                    table.insert(result.events, {
                        name = name,
                        class = class,
                        path = include_path and get_path(obj) or nil,
                    })
                elseif class == "RemoteFunction" then
                    table.insert(result.functions, {
                        name = name,
                        class = "RemoteFunction",
                        path = include_path and get_path(obj) or nil,
                    })
                end
            end
        end)
    end
    
    for _, root in ipairs(search_roots) do scan(root) end
    pcall(function()
        for _, obj in ipairs(getnilinstances()) do
            if seen[obj] then continue end
            seen[obj] = true
            local class = safe(function() return obj.ClassName end)
            local name = safe(function() return obj.Name end) or "?"
            if filter_pattern and not name:match(filter_pattern) then continue end
            if class == "RemoteEvent" or class == "UnreliableRemoteEvent" or class == "RemoteFunction" then
                local dest = class == "RemoteFunction" and result.functions or result.events
                table.insert(dest, { name = name, class = class, path = get_path(obj), note = "nil-parented" })
            end
        end
    end)
    
    result.count = #result.events + #result.functions
    result.scan_time_ms = math.floor((os.clock() - start) * 1000)
    log("info", "scan_remotes", "Found " .. result.count .. " remotes")
    return result
end

function tools.call_remote(params)
    if not params or not params.path then
        return nil, "Missing required parameter: path"
    end
    
    local instance, err = resolve_instance(params.path)
    if not instance then return nil, err end
    
    local class = instance.ClassName
    local args = params.args or {}
    local start = os.clock()
    
    if class == "RemoteEvent" or class == "UnreliableRemoteEvent" then
        local ok, fire_err = pcall(function()
            instance:FireServer(unpack(args))
        end)
        return {
            success = ok,
            response = nil,
            error = not ok and tostring(fire_err) or nil,
            elapsed_ms = math.floor((os.clock() - start) * 1000),
        }
    elseif class == "RemoteFunction" then
        local timeout_ms = params.timeout_ms or 5000
        local ok, response = pcall(function()
            return instance:InvokeServer(unpack(args))
        end)
        return {
            success = ok,
            response = ok and response or nil,
            error = not ok and tostring(response) or nil,
            elapsed_ms = math.floor((os.clock() - start) * 1000),
        }
    else
        return nil, "Instance is not a Remote: " .. class
    end
end

function tools.snapshot_state(params)
    local sections = params and params.sections or {"character", "backpack", "leaderstats"}
    local player = game:GetService("Players").LocalPlayer
    if not player then return nil, "LocalPlayer not found" end
    
    local state = { player_name = player.Name }
    
    for _, section in ipairs(sections) do
        if section == "character" then
            local char = safe(function() return player.Character end)
            if char then
                local hum = safe(function() return char:FindFirstChildOfClass("Humanoid") end)
                local root = safe(function() return char:FindFirstChild("HumanoidRootPart") end)
                state.character = {
                    health = hum and safe(function() return hum.Health end),
                    max_health = hum and safe(function() return hum.MaxHealth end),
                    walk_speed = hum and safe(function() return hum.WalkSpeed end),
                    jump_power = hum and safe(function() return hum.JumpPower end),
                    position = root and safe(function()
                        local p = root.Position
                        return {math.floor(p.X*10)/10, math.floor(p.Y*10)/10, math.floor(p.Z*10)/10}
                    end),
                }
            end
        elseif section == "backpack" then
            state.backpack = {}
            pcall(function()
                for _, item in ipairs(player.Backpack:GetChildren()) do
                    table.insert(state.backpack, { name = item.Name, class = item.ClassName })
                end
            end)
        elseif section == "leaderstats" then
            local ls = safe(function() return player:FindFirstChild("leaderstats") end)
            if ls then
                state.leaderstats = {}
                pcall(function()
                    for _, s in ipairs(ls:GetChildren()) do
                        state.leaderstats[s.Name] = safe(function() return s.Value end)
                    end
                end)
            end
        elseif section == "playergui" then
            state.player_gui = {}
            pcall(function()
                for _, gui in ipairs(player.PlayerGui:GetChildren()) do
                    table.insert(state.player_gui, {
                        name = gui.Name, class = gui.ClassName,
                        enabled = safe(function() return gui.Enabled end),
                    })
                end
            end)
        elseif section == "playerdata" then
            -- Attempt to find common data stores
            state.player_data = {}
            for _, name in ipairs({"Data", "PlayerData", "Stats", "SaveData"}) do
                local child = safe(function() return player:FindFirstChild(name) end)
                if child then
                    state.player_data[name] = {}
                    pcall(function()
                        for _, v in ipairs(child:GetChildren()) do
                            state.player_data[name][v.Name] = safe(function() return v.Value end)
                        end
                    end)
                end
            end
        end
    end
    
    return state
end

function tools.search_scripts(params)
    local name_pattern = params and params.name_pattern
    local content_pattern = params and params.content_pattern
    local class_filter = params and params.class_filter or "all"
    local max_results = params and params.max_results or 20
    local include_source = params and params.include_source or false
    
    local scripts_list = {}
    pcall(function() scripts_list = getscripts() end)
    
    if #scripts_list == 0 then
        -- Fallback scan
        local roots = {}
        for _, n in ipairs({"ReplicatedStorage","ReplicatedFirst","StarterPlayer","StarterGui","StarterPack"}) do
            pcall(function() table.insert(roots, game:GetService(n)) end)
        end
        for _, root in ipairs(roots) do
            pcall(function()
                for _, obj in ipairs(root:GetDescendants()) do
                    if obj:IsA("LuaSourceContainer") then table.insert(scripts_list, obj) end
                end
            end)
        end
    end
    
    local results = { scripts = {}, total_found = 0 }
    local start = os.clock()
    
    for _, script in ipairs(scripts_list) do
        if #results.scripts >= max_results then break end
        
        local class = safe(function() return script.ClassName end)
        if class_filter ~= "all" and class ~= class_filter then continue end
        
        local name = safe(function() return script.Name end) or "?"
        if name_pattern and not name:match(name_pattern) then continue end
        
        local entry = {
            name = name,
            class = class,
            path = get_path(script),
        }
        
        if content_pattern or include_source then
            local source = nil
            pcall(function() source = decompile(script) end)
            if source then
                entry.size_chars = #source
                if include_source then
                    entry.source = source
                else
                    entry.source_preview = source:sub(1, 200)
                end
                if content_pattern then
                    local match_lines = {}
                    local line_num = 0
                    for line in source:gmatch("[^\n]+") do
                        line_num += 1
                        if line:match(content_pattern) then
                            table.insert(match_lines, line_num)
                        end
                    end
                    if #match_lines == 0 then continue end
                    entry.match_lines = match_lines
                end
            end
        end
        
        table.insert(results.scripts, entry)
    end
    
    results.total_found = #results.scripts
    results.search_time_ms = math.floor((os.clock() - start) * 1000)
    return results
end

function tools.get_connections(params)
    if not params or not params.path then
        return nil, "Missing required parameter: path"
    end
    
    local instance, err = resolve_instance(params.path)
    if not instance then return nil, err end
    
    local signal_name = params.signal or "OnClientEvent"
    local signal = safe(function() return instance[signal_name] end)
    if not signal then
        return nil, "Signal not found: " .. signal_name
    end
    
    local result = { connections = {}, count = 0 }
    pcall(function()
        local conns = getconnections(signal)
        for _, conn in ipairs(conns) do
            table.insert(result.connections, {
                function_name = safe(function() return debug.info(conn.Function, "n") end) or "anonymous",
                enabled = conn.Enabled,
            })
        end
    end)
    
    result.count = #result.connections
    return result
end

function tools.inspect_instance(params)
    if not params or not params.path then
        return nil, "Missing required parameter: path"
    end
    
    local instance, err = resolve_instance(params.path)
    if not instance then return nil, err end
    
    local depth = params.children_depth or 1
    local props_to_read = params.properties
    
    local result = {
        name = safe(function() return instance.Name end),
        class = safe(function() return instance.ClassName end),
    }
    
    -- Read properties
    if props_to_read then
        result.properties = {}
        for _, prop in ipairs(props_to_read) do
            result.properties[prop] = safe(function()
                local val = instance[prop]
                if typeof(val) == "Instance" then return val.Name end
                return val
            end)
        end
    end
    
    -- Children
    if depth > 0 then
        result.children = {}
        pcall(function()
            for _, child in ipairs(instance:GetChildren()) do
                table.insert(result.children, {
                    name = child.Name,
                    class = child.ClassName,
                })
            end
        end)
    end
    
    return result
end

function tools.snapshot_diff(params)
    local sections = params and params.sections or {"character", "leaderstats"}
    local wait_ms = params and params.wait_ms or 2000
    
    local before = tools.snapshot_state({ sections = sections })
    if not before then return nil, "Failed to capture initial snapshot" end
    
    task.wait(wait_ms / 1000)
    
    local after = tools.snapshot_state({ sections = sections })
    if not after then return nil, "Failed to capture final snapshot" end
    
    -- Simple diff
    local changes = {}
    local function diff_tables(path_prefix, t1, t2)
        if type(t1) ~= "table" or type(t2) ~= "table" then
            if t1 ~= t2 then
                table.insert(changes, { path = path_prefix, from = t1, to = t2 })
            end
            return
        end
        local all_keys = {}
        for k in pairs(t1) do all_keys[k] = true end
        for k in pairs(t2) do all_keys[k] = true end
        for k in pairs(all_keys) do
            diff_tables(path_prefix .. "." .. tostring(k), t1[k], t2[k])
        end
    end
    
    for _, section in ipairs(sections) do
        if before[section] or after[section] then
            diff_tables(section, before[section] or {}, after[section] or {})
        end
    end
    
    return {
        before = before,
        after = after,
        changes = changes,
        elapsed_ms = wait_ms,
    }
end

function tools.get_game_info()
    local players = game:GetService("Players")
    local exe_name, exe_version = "Unknown", "?"
    pcall(function() exe_name, exe_version = identifyexecutor() end)
    
    return {
        game_id = safe(function() return game.GameId end),
        place_id = safe(function() return game.PlaceId end),
        place_version = safe(function() return game.PlaceVersion end),
        player_count = #players:GetPlayers(),
        max_players = safe(function() return players.MaxPlayers end),
        executor = { name = exe_name, version = exe_version or "?" },
    }
end

function tools.execute_probe(params)
    if not params or not params.probe then
        return nil, "Missing required parameter: probe"
    end
    
    local probe = params.probe
    local target = params.target
    
    if probe == "remote_echo_test" then
        if not target then return nil, "Missing target for echo test" end
        local instance, err = resolve_instance(target)
        if not instance then return nil, err end
        
        local ok, result = pcall(function()
            if instance.ClassName == "RemoteFunction" then
                return instance:InvokeServer()
            else
                instance:FireServer()
                return "fired"
            end
        end)
        
        return {
            probe = probe,
            result = ok and "success" or "error",
            observations = { ok and ("Response: " .. tostring(result)) or ("Error: " .. tostring(result)) },
        }
    elseif probe == "rate_limit_check" then
        if not target then return nil, "Missing target for rate limit check" end
        local instance, err = resolve_instance(target)
        if not instance then return nil, err end
        
        local count = params.params and params.params.count or 20
        local successes = 0
        local start = os.clock()
        
        for i = 1, count do
            local ok = pcall(function() instance:FireServer() end)
            if ok then successes += 1 end
        end
        
        local elapsed = math.floor((os.clock() - start) * 1000)
        return {
            probe = probe,
            result = successes == count and "no_rate_limit_detected" or "possible_rate_limit",
            observations = {
                string.format("Sent %d calls in %dms. %d succeeded.", count, elapsed, successes),
            },
            elapsed_ms = elapsed,
        }
    else
        return nil, "Unknown probe: " .. probe
    end
end

function tools.read_log(params)
    local level_filter = params and params.level
    local max_entries = params and params.max_entries or 50
    
    local entries = {}
    for i = math.max(1, #log_buffer - max_entries + 1), #log_buffer do
        local entry = log_buffer[i]
        if level_filter and entry.level ~= level_filter then continue end
        table.insert(entries, entry)
    end
    
    return { entries = entries, total = #entries }
end

-- ============================================================================
-- Advanced Tool implementations
-- ============================================================================

-- Global spy state (persists across calls)
if not getgenv()._pmcp_spy then
    getgenv()._pmcp_spy = { active = false, log = {}, hook = nil, max_entries = 200 }
end
local spy_state = getgenv()._pmcp_spy

function tools.spy_remotes(params)
    local action = params and params.action or "read"
    
    if action == "start" then
        if spy_state.active then
            return { status = "already_running", entries = #spy_state.log }
        end
        
        spy_state.log = {}
        spy_state.active = true
        local max = params and params.max_entries or 200
        spy_state.max_entries = max
        
        -- Hook __namecall to intercept all remote calls
        local old_namecall
        old_namecall = hookmetamethod(game, "__namecall", function(self, ...)
            local method = getnamecallmethod()
            local args = {...}
            
            if spy_state.active and (method == "FireServer" or method == "InvokeServer") then
                local entry = {
                    timestamp = timestamp(),
                    method = method,
                    remote_name = safe(function() return self.Name end) or "?",
                    remote_class = safe(function() return self.ClassName end) or "?",
                    remote_path = get_path(self),
                    arg_count = #args,
                    arg_types = {},
                    arg_preview = {},
                }
                
                for i, arg in ipairs(args) do
                    entry.arg_types[i] = typeof(arg)
                    local preview = tostring(arg)
                    if #preview > 100 then preview = preview:sub(1, 100) .. "..." end
                    entry.arg_preview[i] = preview
                end
                
                -- Get call stack
                entry.caller = safe(function() return debug.info(3, "sn") end) or "unknown"
                
                table.insert(spy_state.log, entry)
                if #spy_state.log > spy_state.max_entries then
                    table.remove(spy_state.log, 1)
                end
            end
            
            return old_namecall(self, ...)
        end)
        
        spy_state.hook = old_namecall
        log("info", "spy_remotes", "Remote spy started")
        return { status = "started", max_entries = max }
        
    elseif action == "stop" then
        spy_state.active = false
        log("info", "spy_remotes", "Remote spy stopped — " .. #spy_state.log .. " entries captured")
        return { status = "stopped", total_captured = #spy_state.log }
        
    elseif action == "read" then
        local count = params and params.count or 50
        local filter = params and params.filter
        
        local entries = {}
        local start_idx = math.max(1, #spy_state.log - count + 1)
        for i = start_idx, #spy_state.log do
            local entry = spy_state.log[i]
            if filter and not entry.remote_name:match(filter) then continue end
            table.insert(entries, entry)
        end
        
        return {
            active = spy_state.active,
            total_captured = #spy_state.log,
            entries = entries,
            returned = #entries,
        }
        
    elseif action == "clear" then
        spy_state.log = {}
        return { status = "cleared" }
    else
        return nil, "Unknown action: " .. action .. ". Use: start, stop, read, clear"
    end
end

function tools.decompile_script(params)
    if not params or not params.path then
        return nil, "Missing required parameter: path"
    end
    
    local instance, err = resolve_instance(params.path)
    if not instance then return nil, err end
    
    if not instance:IsA("LuaSourceContainer") then
        return nil, "Instance is not a script: " .. (safe(function() return instance.ClassName end) or "?")
    end
    
    local start = os.clock()
    local ok, source = pcall(function() return decompile(instance) end)
    local elapsed = math.floor((os.clock() - start) * 1000)
    
    if not ok or not source then
        return nil, "Decompilation failed: " .. tostring(source or "unknown error")
    end
    
    -- Line count
    local line_count = 0
    for _ in source:gmatch("\n") do line_count += 1 end
    line_count += 1
    
    return {
        path = params.path,
        name = safe(function() return instance.Name end),
        class = safe(function() return instance.ClassName end),
        source = source,
        line_count = line_count,
        size_chars = #source,
        decompile_time_ms = elapsed,
    }
end

function tools.get_upvalues(params)
    if not params or not params.path then
        return nil, "Missing required parameter: path"
    end
    
    local instance, err = resolve_instance(params.path)
    if not instance then return nil, err end
    
    if not instance:IsA("LuaSourceContainer") then
        return nil, "Instance is not a script"
    end
    
    local result = {
        path = params.path,
        upvalues = {},
        constants = {},
    }
    
    -- Get the script's function via getsenv or getscriptclosure
    local closure = nil
    pcall(function() closure = getscriptclosure(instance) end)
    
    if closure then
        -- Get upvalues
        pcall(function()
            local idx = 1
            while true do
                local name, value = debug.getupvalue(closure, idx)
                if name == nil then break end
                table.insert(result.upvalues, {
                    index = idx,
                    name = name,
                    type = typeof(value),
                    value = (type(value) == "function" and "function" or
                             type(value) == "table" and ("table[" .. #value .. "]") or
                             type(value) == "userdata" and tostring(value) or
                             tostring(value)),
                })
                idx += 1
            end
        end)
        
        -- Get constants
        pcall(function()
            local consts = getconstants(closure)
            for i, v in ipairs(consts) do
                if v ~= nil then
                    table.insert(result.constants, {
                        index = i,
                        type = type(v),
                        value = tostring(v),
                    })
                end
            end
        end)
    else
        result.note = "Could not get script closure. Try getsenv instead."
    end
    
    result.upvalue_count = #result.upvalues
    result.constant_count = #result.constants
    return result
end

function tools.get_environment(params)
    if not params or not params.path then
        return nil, "Missing required parameter: path"
    end
    
    local instance, err = resolve_instance(params.path)
    if not instance then return nil, err end
    
    local result = {
        path = params.path,
        globals = {},
        functions = {},
        tables = {},
    }
    
    local env = nil
    pcall(function()
        env = getsenv(instance)
    end)
    
    if not env then
        return nil, "Could not get script environment (getsenv failed). Script may not be running."
    end
    
    local count = 0
    for k, v in pairs(env) do
        count += 1
        if count > 200 then break end -- Safety limit
        
        local t = type(v)
        if t == "function" then
            table.insert(result.functions, {
                name = tostring(k),
                info = safe(function() return debug.info(v, "sn") end) or "?",
            })
        elseif t == "table" then
            local size = 0
            pcall(function() for _ in pairs(v) do size += 1; if size > 50 then break end end end)
            table.insert(result.tables, {
                name = tostring(k),
                size = size,
                keys = safe(function()
                    local keys = {}
                    local i = 0
                    for key in pairs(v) do
                        i += 1; if i > 10 then break end
                        table.insert(keys, tostring(key))
                    end
                    return keys
                end) or {},
            })
        else
            result.globals[tostring(k)] = {
                type = t,
                value = tostring(v):sub(1, 200),
            }
        end
    end
    
    result.total_entries = count
    return result
end

function tools.detect_anticheat(params)
    local start = os.clock()
    local findings = {}
    local risk_level = "low"
    
    -- 1. Check for executor detection attempts
    local detection_globals = {
        "syn", "fluxus", "krnl", "getexecutorname", "identifyexecutor",
        "hookfunction", "hookmetamethod", "getnamecallmethod",
        "getrawmetatable", "setreadonly", "getcallingscript",
        "checkcaller", "isexecutorclosure", "iscclosure",
    }
    
    local scripts_checking = {}
    pcall(function()
        local all_scripts = getscripts()
        for _, script in ipairs(all_scripts) do
            if not script:IsA("LocalScript") and not script:IsA("ModuleScript") then continue end
            local src = nil
            pcall(function() src = decompile(script) end)
            if src then
                for _, global_name in ipairs(detection_globals) do
                    if src:find(global_name, 1, true) then
                        table.insert(scripts_checking, {
                            script = get_path(script),
                            detected_pattern = global_name,
                        })
                        risk_level = "high"
                        break
                    end
                end
            end
        end
    end)
    
    if #scripts_checking > 0 then
        table.insert(findings, {
            type = "executor_detection",
            severity = "high",
            description = "Scripts checking for executor globals",
            details = scripts_checking,
        })
    end
    
    -- 2. Check for __namecall hooks (by game, not us)
    local namecall_info = {}
    pcall(function()
        local mt = getrawmetatable(game)
        if mt then
            local nc = rawget(mt, "__namecall")
            if nc then
                local is_c = iscclosure(nc)
                namecall_info = {
                    exists = true,
                    is_c_closure = is_c,
                    is_hooked = not is_c, -- Non-C closures suggest hooking
                }
                if not is_c then risk_level = "medium" end
            end
        end
    end)
    
    if namecall_info.exists then
        table.insert(findings, {
            type = "namecall_hook",
            severity = namecall_info.is_hooked and "medium" or "info",
            description = namecall_info.is_hooked and "Game has custom __namecall (possible monitor)" or "__namecall is default C closure",
            details = namecall_info,
        })
    end
    
    -- 3. Check for heartbeat/anti-idle systems
    local heartbeat_remotes = {}
    pcall(function()
        local function check_name(name)
            local lower = name:lower()
            return lower:find("heartbeat") or lower:find("anticheat") or lower:find("anti_cheat")
                or lower:find("verify") or lower:find("validate") or lower:find("integrity")
                or lower:find("security") or lower:find("check") or lower:find("pulse")
        end
        
        for _, svc in ipairs({"ReplicatedStorage", "Workspace"}) do
            pcall(function()
                for _, obj in ipairs(game:GetService(svc):GetDescendants()) do
                    if (obj:IsA("RemoteEvent") or obj:IsA("RemoteFunction")) and check_name(obj.Name) then
                        table.insert(heartbeat_remotes, {
                            name = obj.Name,
                            class = obj.ClassName,
                            path = get_path(obj),
                        })
                    end
                end
            end)
        end
    end)
    
    if #heartbeat_remotes > 0 then
        table.insert(findings, {
            type = "suspicious_remotes",
            severity = "medium",
            description = "Remotes with anti-cheat/heartbeat naming patterns",
            details = heartbeat_remotes,
        })
        if risk_level == "low" then risk_level = "medium" end
    end
    
    -- 4. Check for RenderStepped/Heartbeat integrity checks
    local integrity_connections = 0
    pcall(function()
        local rs = game:GetService("RunService")
        local conns = getconnections(rs.Heartbeat)
        integrity_connections = #conns
    end)
    
    table.insert(findings, {
        type = "heartbeat_connections",
        severity = "info",
        description = string.format("%d connections on RunService.Heartbeat", integrity_connections),
    })
    
    return {
        risk_level = risk_level,
        findings = findings,
        finding_count = #findings,
        scan_time_ms = math.floor((os.clock() - start) * 1000),
        recommendation = risk_level == "high" and "Executor detection found. Proceed with caution." or
                         risk_level == "medium" and "Some monitoring detected. Be aware of activity logging." or
                         "No significant anti-cheat detected.",
    }
end

function tools.http_spy(params)
    local action = params and params.action or "read"
    
    if not getgenv()._pmcp_http_spy then
        getgenv()._pmcp_http_spy = { active = false, log = {}, max_entries = 100 }
    end
    local state = getgenv()._pmcp_http_spy
    
    if action == "start" then
        if state.active then return { status = "already_running" } end
        
        state.log = {}
        state.active = true
        
        -- Hook request
        pcall(function()
            local http = game:GetService("HttpService")
            local old_request = http.RequestAsync
            hookfunction(old_request, function(self, req_data)
                if state.active then
                    table.insert(state.log, {
                        timestamp = timestamp(),
                        method = req_data.Method or "GET",
                        url = req_data.Url or "?",
                        headers = req_data.Headers,
                        body_preview = req_data.Body and tostring(req_data.Body):sub(1, 500) or nil,
                    })
                    if #state.log > state.max_entries then table.remove(state.log, 1) end
                end
                return old_request(self, req_data)
            end)
        end)
        
        log("info", "http_spy", "HTTP spy started")
        return { status = "started" }
        
    elseif action == "stop" then
        state.active = false
        return { status = "stopped", total_captured = #state.log }
        
    elseif action == "read" then
        return { active = state.active, entries = state.log, total = #state.log }
    else
        return nil, "Unknown action. Use: start, stop, read"
    end
end

function tools.find_instances(params)
    if not params then return nil, "Missing search parameters" end
    
    local name_pattern = params.name_pattern
    local class_name = params.class_name
    local property_name = params.property_name
    local property_value = params.property_value
    local max_results = params.max_results or 50
    local search_nil = params.search_nil ~= false
    
    local results = {}
    local start = os.clock()
    
    local function matches(obj)
        if name_pattern then
            local name = safe(function() return obj.Name end)
            if not name or not name:match(name_pattern) then return false end
        end
        if class_name then
            local class = safe(function() return obj.ClassName end)
            if class ~= class_name then return false end
        end
        if property_name then
            local val = safe(function() return obj[property_name] end)
            if val == nil then return false end
            if property_value ~= nil and tostring(val) ~= tostring(property_value) then return false end
        end
        return true
    end
    
    local function add_result(obj, source)
        if #results >= max_results then return true end
        table.insert(results, {
            name = safe(function() return obj.Name end) or "?",
            class = safe(function() return obj.ClassName end) or "?",
            path = get_path(obj),
            source = source,
            property_value = property_name and safe(function()
                local v = obj[property_name]
                return tostring(v):sub(1, 200)
            end) or nil,
        })
        return #results >= max_results
    end
    
    -- Search all services
    local services = {"Workspace", "ReplicatedStorage", "ReplicatedFirst", "StarterPlayer",
                      "StarterGui", "StarterPack", "Lighting", "SoundService",
                      "Players", "Teams", "Chat"}
    
    for _, svc_name in ipairs(services) do
        pcall(function()
            local svc = game:GetService(svc_name)
            if matches(svc) then
                if add_result(svc, svc_name) then return end
            end
            for _, obj in ipairs(svc:GetDescendants()) do
                if matches(obj) then
                    if add_result(obj, svc_name) then return end
                end
            end
        end)
        if #results >= max_results then break end
    end
    
    -- Search nil instances
    if search_nil and #results < max_results then
        pcall(function()
            for _, obj in ipairs(getnilinstances()) do
                if matches(obj) then
                    if add_result(obj, "nil-parented") then break end
                end
            end
        end)
    end
    
    return {
        results = results,
        total_found = #results,
        capped = #results >= max_results,
        search_time_ms = math.floor((os.clock() - start) * 1000),
    }
end

function tools.monitor_changes(params)
    if not params or not params.path then
        return nil, "Missing required parameter: path"
    end
    if not params.property then
        return nil, "Missing required parameter: property"
    end
    
    local instance, err = resolve_instance(params.path)
    if not instance then return nil, err end
    
    local prop = params.property
    local duration_ms = params.duration_ms or 5000
    local max_duration = 30000
    if duration_ms > max_duration then duration_ms = max_duration end
    
    -- Get initial value
    local initial = safe(function() return instance[prop] end)
    local changes = {}
    
    -- Connect to property change
    local conn
    local ok_conn = pcall(function()
        conn = instance:GetPropertyChangedSignal(prop):Connect(function()
            local new_val = safe(function() return instance[prop] end)
            table.insert(changes, {
                timestamp = timestamp(),
                elapsed_ms = math.floor((os.clock() - os.clock()) * 1000),
                value = tostring(new_val):sub(1, 200),
                type = typeof(new_val),
            })
        end)
    end)
    
    if not ok_conn then
        return nil, "Could not monitor property: " .. prop
    end
    
    -- Wait for the specified duration
    task.wait(duration_ms / 1000)
    
    -- Disconnect
    if conn then conn:Disconnect() end
    
    local final = safe(function() return instance[prop] end)
    
    return {
        path = params.path,
        property = prop,
        initial_value = tostring(initial):sub(1, 200),
        final_value = tostring(final):sub(1, 200),
        changed = tostring(initial) ~= tostring(final),
        change_count = #changes,
        changes = changes,
        duration_ms = duration_ms,
    }
end

function tools.fire_signal(params)
    if not params or not params.path then
        return nil, "Missing required parameter: path"
    end
    
    local instance, err = resolve_instance(params.path)
    if not instance then return nil, err end
    
    local signal_name = params.signal or "MouseButton1Click"
    local signal = safe(function() return instance[signal_name] end)
    if not signal then
        return nil, "Signal not found on instance: " .. signal_name
    end
    
    -- Build args to pass to the signal
    local args = params.args or {}
    
    local ok, fire_err = pcall(function()
        firesignal(signal, unpack(args))
    end)
    
    if not ok then
        return nil, "Failed to fire signal: " .. tostring(fire_err)
    end
    
    -- Optional wait after firing (give game time to react)
    local wait_after = params.wait_ms or 0
    if wait_after > 0 then
        task.wait(wait_after / 1000)
    end
    
    log("info", "fire_signal", "Fired " .. signal_name .. " on " .. params.path)
    return {
        success = true,
        instance = params.path,
        signal = signal_name,
        arg_count = #args,
    }
end

function tools.fuzz_remote(params)
    if not params or not params.path then
        return nil, "Missing required parameter: path"
    end
    
    local instance, err = resolve_instance(params.path)
    if not instance then return nil, err end
    
    local class = safe(function() return instance.ClassName end)
    if class ~= "RemoteEvent" and class ~= "UnreliableRemoteEvent" and class ~= "RemoteFunction" then
        return nil, "Instance is not a Remote: " .. (class or "?")
    end
    
    local base_args = params.base_args or {}
    local fuzz_index = params.fuzz_index or 1 -- which arg position to fuzz
    local custom_payloads = params.payloads -- optional custom payloads
    
    -- Build fuzz payloads - economy-breaking patterns
    local payloads = custom_payloads or {
        { label = "nil", value = nil },
        { label = "zero", value = 0 },
        { label = "negative", value = -1 },
        { label = "large_negative", value = -999999 },
        { label = "max_int", value = 999999999 },
        { label = "float", value = 0.0001 },
        { label = "empty_string", value = "" },
        { label = "true", value = true },
        { label = "false", value = false },
        { label = "empty_table", value = {} },
        { label = "string_number", value = "99999" },
        { label = "nan", value = 0/0 },
        { label = "inf", value = math.huge },
    }
    
    -- Capture before state
    local player = game:GetService("Players").LocalPlayer
    local before_stats = {}
    pcall(function()
        local ls = player:FindFirstChild("leaderstats")
        if ls then
            for _, v in ipairs(ls:GetChildren()) do
                before_stats[v.Name] = safe(function() return v.Value end)
            end
        end
    end)
    
    local results = { tests = {}, remote_path = params.path, remote_class = class }
    
    for _, payload in ipairs(payloads) do
        -- Build args with the fuzzed value
        local test_args = {}
        for i, v in ipairs(base_args) do
            test_args[i] = v
        end
        test_args[fuzz_index] = payload.value
        
        local test = {
            label = payload.label,
            fuzzed_value = tostring(payload.value),
            fuzz_type = typeof(payload.value),
        }
        
        local ok, call_result = pcall(function()
            if class == "RemoteFunction" then
                return instance:InvokeServer(unpack(test_args))
            else
                instance:FireServer(unpack(test_args))
                return "fired"
            end
        end)
        
        test.success = ok
        if ok then
            test.response = tostring(call_result):sub(1, 300)
        else
            test.error = tostring(call_result):sub(1, 300)
        end
        
        table.insert(results.tests, test)
        task.wait(0.1) -- small delay between tests
    end
    
    -- Capture after state and check for changes
    task.wait(0.5) -- wait for server processing
    local after_stats = {}
    local stat_changes = {}
    pcall(function()
        local ls = player:FindFirstChild("leaderstats")
        if ls then
            for _, v in ipairs(ls:GetChildren()) do
                after_stats[v.Name] = safe(function() return v.Value end)
                if before_stats[v.Name] ~= after_stats[v.Name] then
                    table.insert(stat_changes, {
                        stat = v.Name,
                        before = before_stats[v.Name],
                        after = after_stats[v.Name],
                    })
                end
            end
        end
    end)
    
    results.total_tests = #results.tests
    results.successful = 0
    results.failed = 0
    for _, t in ipairs(results.tests) do
        if t.success then results.successful += 1 else results.failed += 1 end
    end
    results.stat_changes = stat_changes
    results.economy_impact = #stat_changes > 0
    
    if #stat_changes > 0 then
        results.warning = "ECONOMY CHANGE DETECTED — leaderstats changed during fuzzing!"
    end
    
    log("info", "fuzz_remote", "Fuzzed " .. params.path .. ": " .. results.successful .. "/" .. results.total_tests .. " succeeded")
    return results
end

function tools.execute_lua(params)
    if not params or not params.code then
        return nil, "Missing required parameter: code"
    end
    
    local code = params.code
    local description = params.description or "custom script"
    
    log("info", "execute_lua", "Executing: " .. description)
    
    local start = os.clock()
    
    -- Compile and run the code
    local fn, compile_err = loadstring(code)
    if not fn then
        return nil, "Compilation error: " .. tostring(compile_err)
    end
    
    -- Set up environment with useful globals
    local env = getfenv(fn)
    env.player = game:GetService("Players").LocalPlayer
    env.rs = game:GetService("ReplicatedStorage")
    env.workspace = game:GetService("Workspace")
    env.json_encode = json_encode
    
    local ok, result = pcall(fn)
    local elapsed = math.floor((os.clock() - start) * 1000)
    
    if not ok then
        log("error", "execute_lua", "Runtime error: " .. tostring(result))
        return {
            success = false,
            error = tostring(result):sub(1, 2000),
            elapsed_ms = elapsed,
            description = description,
        }
    end
    
    -- Try to serialize the result
    local serialized = nil
    if result ~= nil then
        if type(result) == "table" then
            pcall(function() serialized = json_encode(result) end)
            if not serialized then
                -- Fallback: stringify table keys
                serialized = "{"
                local count = 0
                for k, v in pairs(result) do
                    count += 1
                    if count > 50 then serialized = serialized .. "..."; break end
                    serialized = serialized .. tostring(k) .. "=" .. tostring(v) .. ", "
                end
                serialized = serialized .. "}"
            end
        else
            serialized = tostring(result)
        end
    end
    
    log("info", "execute_lua", "Completed in " .. elapsed .. "ms")
    return {
        success = true,
        result = serialized and serialized:sub(1, 5000) or "nil",
        result_type = type(result),
        elapsed_ms = elapsed,
        description = description,
    }
end

-- ============================================================================
-- IPC: File-based message loop
-- ============================================================================

local function ensure_dirs()
    for _, dir in ipairs({CONFIG.BASE_DIR, CONFIG.IN_DIR, CONFIG.OUT_DIR, CONFIG.LOG_DIR}) do
        if not isfolder(dir) then makefolder(dir) end
    end
end

local function send_response(request_id, method, result, err)
    local envelope = {
        version = "1.0",
        request_id = request_id,
        timestamp = timestamp(),
        type = err and "error" or "response",
        method = method,
    }
    
    if err then
        envelope.error = { code = "INTERNAL_ERROR", message = err }
    else
        envelope.result = result
    end
    
    local filename = CONFIG.OUT_DIR .. "/" .. tostring(os.time()) .. "_" .. request_id .. ".json"
    writefile(filename, json_encode(envelope))
end

local function process_request(request)
    local method = request.method
    local params = request.params or {}
    local request_id = request.request_id or "unknown"
    
    log("info", "dispatch", "Processing: " .. method .. " (" .. request_id:sub(1, 8) .. ")")
    
    local tool_fn = tools[method]
    if not tool_fn then
        log("error", "dispatch", "Unknown method: " .. method)
        send_response(request_id, method, nil, "Unknown method: " .. method)
        return
    end
    
    local ok, result, err = pcall(function()
        return tool_fn(params)
    end)
    
    if not ok then
        -- pcall error
        log("error", method, "Tool error: " .. tostring(result))
        send_response(request_id, method, nil, tostring(result))
    elseif err then
        -- Tool returned an error
        log("warn", method, "Tool returned error: " .. err)
        send_response(request_id, method, nil, err)
    else
        log("info", method, "Completed successfully")
        send_response(request_id, method, result, nil)
    end
end

local function poll_once()
    if not isfolder(CONFIG.IN_DIR) then return end
    
    local files = {}
    pcall(function() files = listfiles(CONFIG.IN_DIR) end)
    
    for _, filepath in ipairs(files) do
        if not filepath:match("%.json$") then continue end
        
        local ok, content = pcall(function() return readfile(filepath) end)
        if not ok then continue end
        
        -- Delete the file immediately to avoid re-processing
        pcall(function() delfile(filepath) end)
        
        -- Parse and process
        local parse_ok, request = pcall(function() return json_decode(content) end)
        if not parse_ok or not request then
            log("error", "ipc", "Failed to parse request file: " .. filepath)
            continue
        end
        
        process_request(request)
    end
end

-- ============================================================================
-- Main loop
-- ============================================================================

-- Prevent multiple instances
if getgenv()._pmcp_running then
    warn("[PotassiumMCP] Agent is already running! Set getgenv()._pmcp_stop = true to stop it first.")
    return
end

getgenv()._pmcp_running = true
getgenv()._pmcp_stop = false

ensure_dirs()

print("")
print("═══════════════════════════════════════════")
print("  PotassiumMCP Agent v" .. CONFIG.VERSION)
print("  AUTHORIZED TESTING ONLY")
print("═══════════════════════════════════════════")
print("  Polling: " .. CONFIG.IN_DIR)
print("  Output:  " .. CONFIG.OUT_DIR)
print("  Stop:    getgenv()._pmcp_stop = true")
print("═══════════════════════════════════════════")
print("")

log("info", "agent", "Agent started — waiting for commands")

-- Write a heartbeat file so the bridge knows we're alive
pcall(function()
    writefile(CONFIG.BASE_DIR .. "/agent_status.json", json_encode({
        status = "running",
        version = CONFIG.VERSION,
        started_at = timestamp(),
        game_id = safe(function() return game.GameId end),
        place_id = safe(function() return game.PlaceId end),
    }))
end)

-- Main polling loop
while not getgenv()._pmcp_stop do
    poll_once()
    task.wait(CONFIG.POLL_INTERVAL)
end

-- Cleanup
getgenv()._pmcp_running = false
log("info", "agent", "Agent stopped gracefully")
print("[PotassiumMCP] Agent stopped.")

pcall(function()
    writefile(CONFIG.BASE_DIR .. "/agent_status.json", json_encode({
        status = "stopped",
        version = CONFIG.VERSION,
        stopped_at = timestamp(),
    }))
end)
