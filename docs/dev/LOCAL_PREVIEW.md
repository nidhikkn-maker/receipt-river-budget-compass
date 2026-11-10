# Thapal local live preview (fixture data; never the live database)

## What it is
- **Framework:** TanStack Start (React 19) on Vite 8. Dev command: `vite dev`. Bun installs the dependencies; Node 22 runs the tools.
- **One address:** `node scripts/dev/local-preview.cjs` starts the app's own dev server and serves everything at **http://localhost:8090**:
  - the app, with live updates: every saved change reloads the open page;
  - a **fixture backend** at `/__fixture-supabase`, which stands in for Supabase sign-in, tables and functions with sample data;
  - writes kept **in memory only**, lost on restart.
- **Never the live database:** the hosted Supabase project is never contacted. The committed `.env` is overridden by fixture settings.

## Run it on your laptop
1. **Install** Node 22 and Bun 1.4.4: `npm install -g bun@1.4.4`.
2. **Get the code:**
   ```
   git clone https://gitlab.com/krna-group/THAPAL-project.git
   cd THAPAL-project
   git checkout integration/phase2-3-p0
   bun install --frozen-lockfile
   ```
   The proposed Signature Flow switch lives on `uix/signature-shell` until KK approves it.
3. **Start the preview:** `node scripts/dev/local-preview.cjs`. Keep this terminal open.
4. **Open http://localhost:8090** and sign in with **any email and password**. The fixture signs you in as the sample owner "KK".
5. **Signature Flow (proposed):** add `?uix=signature-flow` to any address. `?uix=classic` returns to today's interface.
6. **iPhone and iPad layouts:** in Chrome open DevTools (Cmd/Ctrl+Shift+I), then the device toolbar (Cmd/Ctrl+Shift+M), and pick iPhone 15 or iPad Pro 11.
   - In Safari: Develop → Enter Responsive Design Mode.
   - To use a real iPhone or iPad on the same Wi-Fi, run with `PREVIEW_HOST=0.0.0.0` (see below) and open `http://<laptop-ip>:8090`.

## Windows (PowerShell)
1. **Install** Node 22 LTS from nodejs.org. Then, in PowerShell: `npm install -g bun@1.4.4`. Check with `bun --version` (should show 1.4.4) and `node --version` (v22.x).
2. **Get the code and install:**
   ```powershell
   git clone https://gitlab.com/krna-group/THAPAL-project.git
   cd THAPAL-project
   git checkout <branch or commit given in the latest report>
   bun install --frozen-lockfile
   ```
3. **Start:** `node scripts/dev/local-preview.cjs`. Keep the window open; Ctrl+C stops it.
4. **Open http://localhost:8090** in Edge or Chrome.
   - iPhone and iPad layouts: F12, then Ctrl+Shift+M for the device toolbar; pick iPhone 15 or iPad Pro 11.
5. **Real phone or tablet on the same Wi-Fi:** run `$env:PREVIEW_HOST="0.0.0.0"; node scripts/dev/local-preview.cjs`, then open `http://<laptop-IP>:8090`.
   - Find the laptop's IP with `ipconfig`.
   - Windows Firewall will ask to allow Node.js on private networks.

## What the preview cannot do (missing services)
| Service | In the preview |
|---|---|
| Hosted Supabase (real accounts and data) | Replaced by the fixture backend. Only approved, explicit connections may ever use real data. |
| Google / Lovable sign-in | Not available. Use email and password with any values. |
| Face ID / passkeys | The prompt appears, but registration and unlock need the real server. |
| AI document reading, voice extraction, email codes | Need provider keys and hosted auth; they fail with a message. |
| Market prices and FX rates | Need outside services; shown as unavailable or stale. |
| Proposed database changes (step-up, posting P7/P8, entities P5, registers P6) | Not present. The app behaves as on today's production schema. |
| Push notifications, cron jobs, publishing | Not available. Nothing is deployed. |
