# PotassiumMCP Wiki

> **Talk to your AI. It hacks the game.**

Welcome to the PotassiumMCP wiki. PotassiumMCP connects any MCP-compatible AI assistant directly to a live Roblox game, giving it **21 built-in tools** to scan, decompile, fuzz, monitor, and exploit — all through natural conversation. No scripting required.

---

## Quick Navigation

| Page | Description |
|---|---|
| [Installation](Installation.md) | How to clone, install dependencies, and run the setup wizard |
| [Client Setup](Client-Setup.md) | Configure VS Code, Cursor, Claude Desktop, Claude Code, and Antigravity |
| [Usage Guide](Usage-Guide.md) | Step-by-step walkthrough from joining a game to running your first test |
| [Tools Reference](Tools-Reference.md) | Full reference for all 21 tools — inputs, outputs, and examples |
| [Architecture](Architecture.md) | How the pieces fit together: MCP server, file IPC, and the in-game agent |
| [Configuration](Configuration.md) | All config options, environment variables, and tuning guide |
| [Security & Safety](Security-and-Safety.md) | Rate limiting, remote firewall, destructive-op gates, and audit logging |
| [Troubleshooting](Troubleshooting.md) | Fixes for the most common setup and runtime problems |
| [Contributing](Contributing.md) | How to add custom tools and contribute to the project |

---

## What is PotassiumMCP?

PotassiumMCP is an **AI-powered Roblox game security testing toolkit**. It bridges any MCP-compatible AI assistant (GitHub Copilot, Cursor, Claude, etc.) to a live Roblox game session via:

- A **Node.js MCP server** that exposes 21 tools to the AI
- A **Lua agent** (`dispatcher.lua`) injected into Roblox through an executor
- A **file-based IPC layer** that passes requests and responses through temp files

The AI can autonomously perform reconnaissance, analyze scripts, monitor network traffic, fuzz remotes, and execute Lua code — all from a chat window.

---

## Tool Categories at a Glance

| Category | Tools | Purpose |
|---|---|---|
| **Recon** | 6 | Map the game's structure — remotes, scripts, instances |
| **Analysis** | 4 | Read source code, closures, environments, anti-cheat |
| **Monitoring** | 3 | Spy on remote calls, HTTP traffic, and property changes |
| **Testing** | 5 | Fire remotes, fuzz payloads, probe rate limits, diff state |
| **Exploit** | 3 | Simulate UI, run Lua, read debug logs |

See [Tools Reference](Tools-Reference.md) for the full list.

---

## At a Glance

```
┌─────────────────┐      MCP        ┌──────────────────┐    File IPC     ┌──────────────────┐
│   AI Assistant   │ ◄────────────► │   MCP Server     │ ◄────────────► │  In-Game Agent   │
│  (your editor)   │    (stdio)      │  (Node.js)       │  (temp files)  │  (dispatcher.lua)│
└─────────────────┘                 └──────────────────┘                └──────────────────┘
```

See [Architecture](Architecture.md) for an in-depth breakdown.

---

## Prerequisites

| Requirement | Minimum Version / Notes |
|---|---|
| **Roblox Executor** | Potassium or any sUNC-compatible executor |
| **Node.js** | v18 or newer |
| **AI Client** | Any MCP-compatible client (VS Code, Cursor, Claude, etc.) |

---

## License

MIT — free to use, modify, and distribute.
