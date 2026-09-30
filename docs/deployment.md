# Deployment

Private Hold'em runs as **one Node process** that serves everything from one address:
- the built React app (`client/dist`);
- the REST endpoints (`/api/session`, `/health`);
- the Socket.IO connection (`/socket.io`, WebSockets).

Because everything shares one origin, there is no CORS setup and no cross-site cookies.

## The one rule: exactly one instance

Rooms, games and guest sessions live **in the server's memory**. Therefore:
- **Never run more than one instance.** A second instance would have its own separate rooms, and players would land on either one at random.
- **A restart or a new deploy ends every game in progress, and forgets every guest session.**
  - When the server shuts down, it first tells every connected player: a toast says the server is restarting and games in progress have ended.
  - Once the server is back, players land on their room page and see that the room no longer exists. They start a new room from the home page.
  - The app makes each player a new guest session under the same name on its own.
- **Deploy between games,** not during one.

## Hosting on Render (recommended)

The repo contains a Render Blueprint, `render.yaml`, with every setting below already filled in.

### First deploy

1. Sign in at <https://render.com> with your GitHub account and allow it to see the `varun77t/Poker` repository.
2. **New → Blueprint**, pick the `Poker` repository, and confirm. Render reads `render.yaml` and creates one web service called `private-holdem`.
3. Wait for the first build, about 2–4 minutes. The service shows **Live**, and `https://private-holdem.onrender.com/health` (or whatever address Render gives you) answers `{"ok":true,...}`.
4. Open the address and play. Share `https://<your-address>/room/<CODE>` links with friends.

### What `render.yaml` sets

| Setting | Value | Why |
|---|---|---|
| Build command | `npm ci && npm run build` | Installs everything (build tools included) and builds the server and client |
| Start command | `npm start` | Runs `node server/dist/index.js` with `NODE_ENV=production` |
| Health check path | `/health` | Render only switches traffic to a new deploy once it answers |
| Instances | 1 | See the rule above |
| `TRUST_PROXY` | `1` | Render puts one proxy in front of the app. Trusting it lets the rate limits see each visitor's real address instead of the proxy's. |
| `LOG_LEVEL` | `info` | Logs are JSON, one object per line, in Render's log viewer |
| Node version | 22 (from `.node-version`) | Matches `engines` in `package.json` |
| Region | Singapore | The closest Render region to India; change it in `render.yaml` if your friends are elsewhere |
| Plan | `free` | See *Free or paid* below |

Render sets `PORT` itself; the server listens on it.

### Free or paid

- **Free plan:**
  - The service **sleeps after about 15 minutes without visitors**. The next visit takes about a minute to wake it, and a sleeping server has no games.
  - It is fine if your group plays at planned times: open the link a minute before you start.
  - If the server sleeps or restarts mid-session, the game in progress ends.
- **Starter plan (about $7 a month):**
  - Always on, with no cold start.
  - Worth it if friends drop in at random times.
  - Switch in the Render dashboard (service → Settings → Instance type) or change `plan: starter` in `render.yaml`.

### Updating

- **Auto-deploy is on:** every push to `main` builds and deploys a new version.
- **Restart ends games:** because a restart ends live games, push when nobody is playing.
- **Pausing:** to pause auto-deploy, turn it off in the service settings and use **Manual Deploy** instead.

### Custom domain (optional)

In the service's **Settings → Custom Domains**, add your domain and create the DNS record Render shows. Render provides the HTTPS certificate.

## Hosting on Railway (alternative)

1. **New Project → Deploy from GitHub repo**, and pick `varun77t/Poker`.
2. In the service **Settings**:
   - **Build command:** `npm run build`. Railway runs `npm ci` itself.
   - **Start command:** `npm start`.
   - **Healthcheck path:** `/health`.
   - **Replicas:** 1.
3. **Variables:** add `TRUST_PROXY=1` (Railway also has one proxy in front). Railway sets `PORT` itself.
4. **Settings → Networking → Generate Domain** to get a public address.

## Environment variables

| Variable | Default | Production value | Notes |
|---|---|---|---|
| `PORT` | 3000 | set by the platform | The port the server listens on in production |
| `NODE_ENV` | development | `production` (set by `npm start`) | Production serves `client/dist` and writes JSON logs |
| `TRUST_PROXY` | 0 | `1` on Render and Railway | Number of proxies in front. Keep it 0 when nothing is in front, so a forged `X-Forwarded-For` header cannot dodge the per-IP limits. |
| `LOG_LEVEL` | info | `info` | `fatal`, `error`, `warn`, `info` or `debug` |
| `LOG_FORMAT` | json in production, else pretty | (leave unset) | `json` or `pretty` |
| `API_PORT` | 3000 | (unused) | Development only: the API port behind the Vite proxy |

There are no secrets to configure: no database, no API keys. Guest session tokens are random values held in memory, and they are never logged.

## What production adds

- **Security headers (helmet):**
  - A same-origin Content Security Policy: scripts, styles, fonts, images and the socket connection only from the app's own address, and no framing.
  - `nosniff`, HSTS (meaningful over the platform's HTTPS), no `X-Powered-By`.
- **Real visitor addresses:** Express `trust proxy` is set to `TRUST_PROXY`. It feeds the per-IP limits on new sessions (10 a minute) and on room joins (40 a minute). See `docs/security-report.md`.
- **Structured logs:**
  - One JSON object per line (`time`, `level`, `msg`, `meta`), with errors including their stack.
  - Crashes (`uncaughtException`, `unhandledRejection`) are logged as `fatal` before the process exits, so the platform restarts a clean one.
- **Graceful shutdown:**
  - On `SIGTERM` (every deploy or restart), every client gets `sys:shutdown`, then timers stop and sockets and the HTTP server close.
  - A forced exit follows after 10 s.
- **WebSockets:** Socket.IO starts on HTTP long-polling and upgrades to a WebSocket. Render and Railway both pass WebSockets through their proxy, and with a single instance no sticky sessions are needed.
- **Caching:** hashed assets (`/assets/*`) are cached for a year; `index.html` is never cached, so a deploy is picked up on the next page load.

## Checking a build locally before deploying

```bash
npm run build
```

Then start the server as production on port 4180 (Git Bash):

```bash
PORT=4180 npm start
```

Open `http://localhost:4180`. Check `http://localhost:4180/health`, and play a hand or two (a second browser profile makes a second player).

`npm run e2e` does the same automatically: it builds, starts the production server on port 4173, and plays real games in Chromium.

## Troubleshooting

- **The page loads but says "Connection lost. Reconnecting"** → the socket can't connect. Check the service logs. Behind a custom proxy or CDN, make sure WebSockets are allowed.
- **Everyone gets "Too many requests" when creating a name** → `TRUST_PROXY` is missing, so every visitor looks like the proxy's one address. Set it to `1`.
- **"Room not found" after a deploy** → expected: the restart ended that game. Create a new room.
- **Build fails with an engine error** → the Node version must be 22.12 or later (`.node-version`).
