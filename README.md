# Audit Dashboard

One launcher sets up and opens everything in a single click. Works the same on
**Windows, macOS, and Linux**.

## Launch it (single click)

- **macOS / Linux:** double-click **`Launch Audit Dashboard.command`**
- **Windows:** double-click **`Launch Audit Dashboard.bat`**

That's it — the dashboard installs what it needs, starts, and opens in your
browser automatically. If a terminal prefers a command instead:

```bash
node setup.js
```

If you don't have Node.js yet, install it once from
[nodejs.org](https://nodejs.org), then click the launcher again.

The script will:

1. Verify Node.js 18+
2. Download / locate the app and install dependencies
3. Check that TestRail is reachable from your machine
4. Start the server and auto-open the dashboard in your browser

Then the dashboard opens at `http://localhost:3001`.

## Requirement: network access to TestRail

The dashboard talks to `https://public.testrail.appstore.amazon.dev` through the
built-in proxy. If you see:

```
Failed to load projects: API error 500 ... Connect Timeout Error ... UND_ERR_CONNECT_TIMEOUT
```

it means **your machine cannot reach TestRail** — a network/VPN issue, not a bug
in the app. `setup.js` prints a clear warning when this happens. To fix it:

- Connect to the Amazon network / VPN (Cisco Secure Client)
- Confirm you can open `https://public.testrail.appstore.amazon.dev` in your browser
- Re-run `node setup.js` (or just retry in the dashboard once connected)

You can also open `http://localhost:3001/api/debug` for a live DNS + connectivity check.

## Options (environment variables)

- `PORT=3001` change the server port
- `HOST=0.0.0.0` expose the app on your local network
- `OPEN_BROWSER=false` don't auto-open the browser
- `AUDIT_PROXY_BASE_URL=https://your-proxy.example.com` point the UI at a separate proxy
- `AUDIT_INSTALL_DIR=/path` where a remote-bootstrap install is placed
