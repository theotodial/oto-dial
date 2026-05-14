# OTODIAL production networking (ERR_CONNECTION_TIMED_OUT)

When **curl on the VPS returns HTTP 200** but **browsers on the public internet time out**, the app stack (PM2, Mongo, Redis, Nginx) is usually fine. The failure is almost always **before TCP reaches Nginx**: DNS, IPv6, firewalls, or Cloudflare.

## HTTP 502 from Nginx on `/api/*` (frontend HTML still works)

Nginx returns **502** when it cannot get a valid response from the **Node upstream** (`proxy_pass`). Typical causes:

1. **Nothing listening on the upstream port** — Node not bound yet (slow Mongo startup before `listen`), crashed, or wrong `PORT` in `.env` vs Nginx (e.g. app on `10000`, Nginx still points at `5000`).
2. **`HOST=127.0.0.1` mismatch** — rare; Nginx `127.0.0.1` matches. If Node listened **only** on a different interface, fix `HOST` / firewall.
3. **PM2 `cwd` / script** — process not actually running `backend/index.js` from the deploy tree (use repo `ecosystem.config.js` with absolute `cwd` / `env_file`).

**Checks on the VPS:**

```bash
curl -sS -i http://127.0.0.1:5000/api/health | head -20
ss -tlnp | grep 5000
pm2 describe oto-dial-backend
pm2 logs oto-dial-backend --lines 80
sudo tail -50 /var/log/nginx/error.log
```

- **`GET /api/health`** returns **`{"status":"ok"}`** with **no database** (liveness for proxies).
- **`GET /api/health/status`** includes Mongo/Redis detail for operators.

## Most likely root causes (in order)

1. **Cloud / VPS firewall (security group)** — ports **80** and **443** open to `0.0.0.0/0` (and `::/0` if you use IPv6). SSH being open does not imply 443 is open.

2. **`ufw` on the VPS** — `sudo ufw status` must show `80/tcp` and `443/tcp` **ALLOW** for **Anywhere** (or your Cloudflare IP ranges if you lock origin).

3. **DNS points to the wrong IP** — A record must be the VPS **public** IPv4. `dig +short otodial.com A` from your laptop must match the provider dashboard.

4. **Broken IPv6 (AAAA)** — If DNS has an **AAAA** record to an address that does not listen on 443, many clients try IPv6 first → **timeout**. Fix: add `listen [::]:443` on Nginx **or** remove incorrect AAAA / fix IPv6 on the host.

5. **Cloudflare “orange cloud”** — Origin must allow **Cloudflare egress IPs** on 443 if you restrict the host firewall. Wrong SSL mode rarely causes *timeout* (usually 525/526), but **DNS-only** grey cloud is useful to isolate origin vs proxy.

6. **Nginx only on localhost** — `listen 127.0.0.1:443` would make local `curl -k https://127.0.0.1` work but not the internet. Production must use `listen 443` / `listen [::]:443` on the public interface.

7. **Browser tests the wrong host** — Typos, stale DNS cache, or VPN split tunnel.

## Commands (run on laptop + VPS)

```bash
# From your laptop — must return your VPS public IP
dig +short otodial.com A
dig +short otodial.com AAAA

# From VPS — must answer on public interface (replace 203.0.113.10 with your VPS IP)
curl -sS -o /dev/null -w "%{http_code}\n" --connect-timeout 5 https://127.0.0.1/ -k
curl -sS -o /dev/null -w "%{http_code}\n" --connect-timeout 5 https://203.0.113.10/ --resolve otodial.com:443:203.0.113.10

# Firewall
sudo ufw status verbose
sudo iptables -L -n | head -50

# Nginx is listening where?
sudo ss -tlnp | grep -E ':80|:443'

# Nginx error log (upstream / TLS)
sudo tail -100 /var/log/nginx/error.log
```

## Deploy layout (this repo)

- **Frontend build output:** `frontend/dist` → on server: `/var/www/oto-dial/frontend/dist`
- **Site config:** `deploy/otodial-nginx-site.conf` → `/etc/nginx/sites-available/otodial` (symlink `sites-enabled`)
- **WebSocket map:** `deploy/nginx-map-connection-upgrade.conf` → `/etc/nginx/conf.d/00-map-connection-upgrade.conf`

## Standard deploy commands (copy-paste)

```bash
cd /var/www/oto-dial/frontend
npm install
npm run build

sudo nginx -t
sudo systemctl reload nginx

cd /var/www/oto-dial
pm2 restart oto-dial-backend --update-env
```

Then verify from **outside** the VPS (laptop or https://www.yougetsignal.com/tools/open-ports/):

```bash
curl -I https://otodial.com
curl -I https://otodial.com/api/health
curl -sS https://otodial.com/api/health
```

For reproducible CI builds, prefer `npm ci` instead of `npm install` when `package-lock.json` is present.
