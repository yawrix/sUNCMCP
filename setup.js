#!/usr/bin/env node

/**
 * PotassiumMCP Setup Script
 * 
 * Run: node setup.js
 * 
 * Automatically:
 * 1. Installs npm dependencies
 * 2. Asks for your executor's workspace path
 * 3. Generates the correct MCP config for your editor
 * 4. Tells you exactly what to do next
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = __dirname;

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

function log(msg) { console.log(`  ${msg}`); }
function success(msg) { console.log(`  ✔ ${msg}`); }
function fail(msg) { console.log(`  ✖ ${msg}`); }
function header(msg) { console.log(`\n  ${msg}\n  ${'─'.repeat(msg.length)}`); }

async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║     ⚗️  PotassiumMCP Setup           ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');

  // Step 1: Install dependencies
  header('Step 1: Dependencies');
  const bridgeDir = join(PROJECT_ROOT, 'bridge');
  const modulesExist = existsSync(join(bridgeDir, 'node_modules'));

  if (modulesExist) {
    success('Dependencies already installed');
  } else {
    log('Installing npm packages...');
    try {
      execSync('npm install', { cwd: bridgeDir, stdio: 'pipe' });
      success('Dependencies installed');
    } catch (e) {
      fail('npm install failed. Run it manually: cd bridge && npm install');
      process.exit(1);
    }
  }

  // Step 2: Get workspace path from user
  header('Step 2: Executor workspace');
  log('PotassiumMCP needs to know where your executor reads/writes files.');
  log('This is your executor\'s workspace or filesystem directory.');
  log('');
  log('To find it: open your executor → Settings → look for');
  log('"workspace", "filesystem", or "files" directory.');
  log('');

  let workspace = await ask('  Paste the full path here: ');
  workspace = workspace.trim().replace(/"/g, '');

  if (!workspace) {
    fail('No path provided.');
    log('You can set EXECUTOR_WORKSPACE manually in your MCP config later.');
    rl.close();
    process.exit(1);
  }

  if (!existsSync(workspace)) {
    fail(`That path doesn't exist: ${workspace}`);
    log('');
    log('Double-check the path and run setup.js again,');
    log('or set EXECUTOR_WORKSPACE manually in your MCP config.');
    rl.close();
    process.exit(1);
  }

  success(`Workspace: ${workspace}`);

  // Step 3: Generate editor configs
  header('Step 3: Editor config');
  const serverPath = resolve(join(PROJECT_ROOT, 'bridge', 'src', 'mcp-server.js'));
  const escapedWorkspace = workspace.replace(/\\/g, '\\\\');
  const escapedServer = serverPath.replace(/\\/g, '\\\\');

  // VS Code config
  const vscodeDir = join(PROJECT_ROOT, '.vscode');
  if (!existsSync(vscodeDir)) mkdirSync(vscodeDir, { recursive: true });

  const vscodeMcp = {
    servers: {
      PotassiumMCP: {
        type: 'stdio',
        command: 'node',
        args: [serverPath],
        env: {
          EXECUTOR_WORKSPACE: workspace
        }
      }
    }
  };

  writeFileSync(join(vscodeDir, 'mcp.json'), JSON.stringify(vscodeMcp, null, 2));
  success('Created .vscode/mcp.json (VS Code / Copilot)');

  // Cursor config
  const cursorDir = join(PROJECT_ROOT, '.cursor');
  if (!existsSync(cursorDir)) mkdirSync(cursorDir, { recursive: true });

  const cursorMcp = {
    mcpServers: {
      PotassiumMCP: {
        command: 'node',
        args: [serverPath],
        env: {
          EXECUTOR_WORKSPACE: workspace
        }
      }
    }
  };

  writeFileSync(join(cursorDir, 'mcp.json'), JSON.stringify(cursorMcp, null, 2));
  success('Created .cursor/mcp.json (Cursor)');

  // Show config for other editors
  header('Step 4: Done!');
  console.log('');
  log('VS Code / Copilot → configured automatically');
  log('Cursor            → configured automatically');
  console.log('');
  log('For Claude Desktop, Codex, or any other MCP client,');
  log('add this to your MCP config:');
  console.log('');
  console.log(`  {`);
  console.log(`    "PotassiumMCP": {`);
  console.log(`      "command": "node",`);
  console.log(`      "args": ["${escapedServer}"],`);
  console.log(`      "env": {`);
  console.log(`        "EXECUTOR_WORKSPACE": "${escapedWorkspace}"`);
  console.log(`      }`);
  console.log(`    }`);
  console.log(`  }`);
  console.log('');

  header('Next steps');
  log('1. Open Roblox and join a game');
  log('2. Paste agent/dispatcher.lua into your executor and run it');
  log('3. Open your AI editor and start chatting');
  console.log('');

  rl.close();
}

main().catch(e => {
  console.error('Setup failed:', e.message);
  process.exit(1);
});
