#!/usr/bin/env node
/* eslint-disable */
// =============================================================================
// Audit Dashboard - ONE cross-platform setup script (Windows / macOS / Linux)
//
// This single file loops through every prerequisite and starts the app:
//   1. Ensures Node.js is present (if you can run this, it already is)
//   2. Locates / downloads the app source
//   3. Installs npm dependencies
//   4. Runs a TestRail connectivity preflight (the #1 cause of the
//      "Failed to load projects / Connect Timeout" error)
//   5. Starts the server and auto-opens the browser once it is ready
//
// HOW TO RUN (any OS):
//   node setup.js
//
// If you do NOT have Node yet, install it once from https://nodejs.org,
// then run the line above. Everything else is automated.
// =============================================================================

'use strict';

const { spawn, spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');

// ---- Config -----------------------------------------------------------------
const REPO_URL = 'https://github.com/Jasurya00/audit-dashboard.git';
const INSTALL_DIR = process.env.AUDIT_INSTALL_DIR || path.join(require('os').homedir(), 'audit-dashboard');
const MIN_NODE_MAJOR = 18;
const TESTRAIL_HOST = 'public.testrail.appstore.amazon.dev';
const PREFERRED_PORT = parseInt(process.env.PORT || '3001', 10);
const OPEN_BROWSER = process.env.OPEN_BROWSER !== 'false';
const IS_WIN = process.platform === 'win32';

// These are finalized right before the server starts (port may change if busy).
let PORT = String(PREFERRED_PORT);
let URL = `http://localhost:${PORT}`;

// ---- Pretty output -----------------------------------------------------------
const C = { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', blue: '\x1b[34m' };
const step = (m) => console.log(`${C.blue}==>${C.reset} ${m}`);
const ok = (m) => console.log(`${C.green}  OK:${C.reset} ${m}`);
const warn = (m) => console.log(`${C.yellow}  WARN:${C.reset} ${m}`);
const errlog = (m) => console.log(`${C.red}  ERROR:${C.reset} ${m}`);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: IS_WIN, ...opts });
  return r.status === 0;
}

function has(cmd) {
  const r = spawnSync(IS_WIN ? 'where' : 'which', [cmd], { stdio: 'ignore', shell: IS_WIN });
  return r.status === 0;
}

// ---- 1. Node.js check --------------------------------------------------------
step('Checking Node.js');
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < MIN_NODE_MAJOR) {
  errlog(`Node.js ${process.version} is too old. Install Node.js >= ${MIN_NODE_MAJOR} from https://nodejs.org and re-run.`);
  process.exit(1);
}
ok(`Node.js ${process.version}`);

// ---- 2. Locate / download the app source ------------------------------------
let appDir;
if (fs.existsSync('server.js') && fs.existsSync('public')) {
  appDir = process.cwd();
  step(`Using app in current directory: ${appDir}`);
} else if (fs.existsSync(path.join(INSTALL_DIR, '.git'))) {
  step(`Updating existing installation at ${INSTALL_DIR}`);
  if (!run('git', ['-C', INSTALL_DIR, 'pull', '--ff-only'])) warn('Could not update (continuing with existing copy)');
  appDir = INSTALL_DIR;
} else {
  if (!has('git')) {
    errlog('git is required to download the app. Install git from https://git-scm.com and re-run.');
    process.exit(1);
  }
  step(`Downloading Audit Dashboard to ${INSTALL_DIR}`);
  if (!run('git', ['clone', REPO_URL, INSTALL_DIR])) {
    errlog('Failed to clone the repository.');
    process.exit(1);
  }
  appDir = INSTALL_DIR;
}
process.chdir(appDir);

// ---- 3. Install dependencies -------------------------------------------------
step('Installing dependencies');
const installArgs = fs.existsSync('package-lock.json')
  ? ['ci', '--no-audit', '--no-fund']
  : ['install', '--no-audit', '--no-fund'];
if (!run('npm', installArgs)) {
  // ci can fail if lockfile is out of sync; fall back to install
  if (!run('npm', ['install', '--no-audit', '--no-fund'])) {
    errlog('Dependency installation failed.');
    process.exit(1);
  }
}
ok('Dependencies installed');

// ---- 4. TestRail connectivity preflight --------------------------------------
step(`Checking connectivity to TestRail (${TESTRAIL_HOST})`);
(async () => {
  const reach = await new Promise((resolve) => {
    const done = (v) => resolve(v);
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctrl) ctrl.abort(); done('TIMEOUT'); }, 9000);
    fetch(`https://${TESTRAIL_HOST}`, ctrl ? { signal: ctrl.signal } : {})
      .then((r) => { clearTimeout(timer); done('OK:' + r.status); })
      .catch((e) => { clearTimeout(timer); const c = (e.cause && (e.cause.code || e.cause.message)) || e.message; done('FAIL:' + c); });
  });

  if (reach.startsWith('OK:')) {
    ok(`TestRail is reachable (HTTP ${reach.slice(3)} - auth handled in the app)`);
  } else {
    warn(`TestRail is NOT reachable from this machine (${reach}).`);
    warn("This is the cause of 'Failed to load projects / Connect Timeout'.");
    warn('To fix it, before using the dashboard make sure you:');
    warn('   - are connected to the Amazon network / VPN (Cisco Secure Client)');
    warn(`   - can open https://${TESTRAIL_HOST} in your browser`);
    warn('The server will still start so you can retry once connected.');
  }

  startServer();
})();

// ---- 5. Start server + auto-open browser when ready --------------------------
function openBrowser() {
  try {
    if (IS_WIN) spawn('cmd', ['/c', 'start', '""', URL], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [URL], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [URL], { detached: true, stdio: 'ignore' }).unref();
  } catch (_) { /* ignore */ }
}

function waitThenOpen() {
  let tries = 0;
  const poll = () => {
    tries += 1;
    const req = http.get(URL, (res) => { res.resume(); openBrowser(); });
    req.on('error', () => { if (tries < 40) setTimeout(poll, 500); });
    req.setTimeout(2000, () => req.destroy());
  };
  poll();
}

// Returns true if a TCP port is free to bind on this machine.
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '0.0.0.0');
  });
}

// Picks the preferred port, or the next free one if it is already in use.
async function pickPort() {
  for (let p = PREFERRED_PORT; p < PREFERRED_PORT + 50; p++) {
    if (await isPortFree(p)) return p;
  }
  return PREFERRED_PORT; // give up gracefully; server.js will report the real error
}

async function startServer() {
  const chosen = await pickPort();
  if (chosen !== PREFERRED_PORT) {
    warn(`Port ${PREFERRED_PORT} is busy — using ${chosen} instead.`);
  }
  PORT = String(chosen);
  URL = `http://localhost:${PORT}`;

  console.log('');
  step(`Launching Audit Dashboard on ${URL}`);
  console.log('');

  if (OPEN_BROWSER) waitThenOpen();

  // Let server.js skip its own (premature) browser open - we handle readiness here.
  const child = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: { ...process.env, OPEN_BROWSER: 'false', PORT },
  });
  child.on('exit', (code) => process.exit(code || 0));
}
