# StockMafia

Self-hosted Node.js app for **India (NSE)** and **US** market insights, strategy suggestions, dry-run, paper trading, and optional live NSE orders via **Zerodha Kite Connect**.

This is a research and execution workstation, not a promise of profit and not investment advice.

## What it does

- Search any ticker (AAPL, NVDA, RELIANCE, INFY.NS, …), crawl quotes, fundamentals, news, and a direction score
- India + US index boards
- Playbook algos used on liquid names today: trend pullback, volume breakout, oversold snapback, quality-on-weakness, relative strength vs index, risk-off
- **Dry run**: replay ~1 year of daily bars on the watchlist
- **Suggest**: current tickets with size (2×ATR stop, 2R target)
- **Execute**: dry-run (no fill), paper book, or live Kite (NSE only, live gate required)

## Local run

```bash
cd ~/Documents/work/trading-app
cp server/.env.example server/.env
npm install
npm run dev
```

UI: http://127.0.0.1:5173  
API: http://127.0.0.1:8787

## Proxmox (Docker in a VM or LXC)

1. Clone this folder onto the host.
2. Copy `server/.env.example` to `server/.env`. Set `KITE_REDIRECT_URL` to `http://YOUR_LAN_IP:8787/api/kite/callback` if you use Kite.
3. `docker compose up -d --build`
4. Open `http://YOUR_LAN_IP:8787`
5. Point your reverse proxy (NPM / Caddy / Traefik) at port 8787 if you want a hostname.

Kite developer app redirect URL must match exactly. Zerodha expects a static public IP for live order APIs.

## Kite (optional, India live)

Personal use on your own account. Daily interactive login. No sandbox — test with **Dry** and **Paper** first. Live execution is blocked until the live gate is on. US names never go to Kite.
