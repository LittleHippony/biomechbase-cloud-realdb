# BiomechBase Deployment Guide (Tencent 轻量服务器 + Ubuntu 22.04)

This guide is written for beginners and matches your current codebase:
- Web app: React + Vite (build output: `dist/`)
- Backend API: Node.js + Express (`server/index.js`, default port `3001`)
- WeChat Mini Program: `miniapp/` (calls backend API)

---

## 0) Final architecture (simple + recommended)

Use **one domain** for web + API:
- Web: `https://yourdomain.com`
- API: `https://yourdomain.com/api/...` (Nginx reverse proxy to Node on `127.0.0.1:3001`)

Why this is easiest:
- Web frontend can keep `VITE_API_URL` empty and call relative `/api`
- Mini program can use `https://yourdomain.com/api` as request domain
- Only one SSL/domain to manage

---

## 1) Before you start (Tencent Cloud side)

1. You already created a Lighthouse server with **Ubuntu 22.04** ✅
2. Prepare:
   - Server public IP
   - Root/ubuntu SSH access
   - A domain name (example: `yourdomain.com`)
3. In Tencent Cloud console:
   - Add DNS `A` record: `@ -> <YOUR_SERVER_IP>`
   - (Optional) add `www -> <YOUR_SERVER_IP>`
4. Open firewall ports in **both** places:
   - Lighthouse firewall/security group: `22`, `80`, `443`
   - OS firewall (`ufw`) later in server steps

> China production note: WeChat mini program real-device requests typically require HTTPS + compliant filing/备案.

---

## 2) Connect to server from your Windows PC

```powershell
ssh ubuntu@<YOUR_SERVER_IP>
```

If your server user is not `ubuntu`, replace accordingly.

---

## 3) Initialize Ubuntu 22.04

Run on server:

```bash
sudo apt update
sudo apt -y upgrade
sudo timedatectl set-timezone Asia/Shanghai
sudo apt -y install nginx git curl ufw
```

Enable firewall:

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable
sudo ufw status
```

---

## 4) Install Node.js 20 + PM2

Run on server:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
sudo npm install -g pm2
node -v
npm -v
pm2 -v
```

---

## 5) Upload your project to server

Choose one method.

### Method A: Git clone (recommended)

```bash
sudo mkdir -p /var/www/biomechbase
sudo chown -R $USER:$USER /var/www/biomechbase
cd /var/www/biomechbase
git clone <YOUR_REPO_URL> .
```

### Method B: Upload ZIP from local machine

- Upload project files to `/var/www/biomechbase`
- Ensure `package.json` exists in that directory

---

## 6) Install dependencies + build frontend

```bash
cd /var/www/biomechbase
npm install
npm run build
```

Expected result:
- Web static files generated in `/var/www/biomechbase/dist`

---

## 7) Start backend API with PM2

Your backend entry is `server/index.js`.

```bash
cd /var/www/biomechbase
PORT=3001 FRONTEND_ORIGIN=https://yourdomain.com pm2 start server/index.js --name biomech-api
pm2 save
pm2 startup
```

Follow the command printed by `pm2 startup` (copy and run once).

Check status/logs:

```bash
pm2 list
pm2 logs biomech-api --lines 100
```

Health check (from server):

```bash
curl http://127.0.0.1:3001/api/health
```

Should return JSON like status `ok`.

---

## 8) Configure Nginx (web + /api proxy)

Create config:

```bash
sudo nano /etc/nginx/sites-available/biomechbase
```

Paste:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /var/www/biomechbase/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable site:

```bash
sudo ln -sf /etc/nginx/sites-available/biomechbase /etc/nginx/sites-enabled/biomechbase
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Now test:
- `http://yourdomain.com`
- `http://yourdomain.com/api/health`

---

## 9) Enable HTTPS (required for mini program production)

Install certbot:

```bash
sudo apt -y install certbot python3-certbot-nginx
```

Issue certificate:

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Verify auto renewal:

```bash
sudo systemctl status certbot.timer
```

Test HTTPS:
- `https://yourdomain.com`
- `https://yourdomain.com/api/health`

---

## 10) Web app production config notes

Your current web code already supports single-domain deployment:
- `config.ts` uses `VITE_API_URL || ''`
- Empty API base means browser calls relative `/api/...`

So for this Nginx setup, you can keep `VITE_API_URL` empty.

If you want explicit API domain later, create `.env.production`:

```env
VITE_API_URL=https://yourdomain.com
VITE_USE_CLOUD=true
```

Then rebuild:

```bash
npm run build
sudo systemctl reload nginx
```

---

## 11) WeChat Mini Program production config

### 11.1 Update miniapp API base URL

Edit file: `miniapp/utils/config.js`

Set to:

```javascript
const API_BASE_URL = 'https://yourdomain.com/api';
```

### 11.2 Configure legal domain in WeChat platform

In mp.weixin.qq.com:
- 开发管理 -> 开发设置 -> 服务器域名

Add at least:
- request 合法域名: `https://yourdomain.com`

If you use upload/download APIs, also add same domain there.

### 11.3 Release miniapp

1. Open WeChat DevTools, import folder `miniapp/`
2. Confirm AppID
3. Test login and CRUD flows on real device
4. Upload code, submit for review, publish

> Important: miniapp frontend is hosted by WeChat platform, not your Lighthouse server. Lighthouse hosts the API only.

---

## 12) Daily operations

### Update code

```bash
cd /var/www/biomechbase
git pull
npm install
npm run build
pm2 restart biomech-api
sudo systemctl reload nginx
```

### Logs

```bash
pm2 logs biomech-api --lines 200
sudo tail -f /var/log/nginx/error.log
```

### Backup (important for this project)

Your data file is:
- `/var/www/biomechbase/server/db.json`

Quick backup command:

```bash
mkdir -p /var/backups/biomechbase
cp /var/www/biomechbase/server/db.json /var/backups/biomechbase/db-$(date +%F-%H%M%S).json
```

---

## 13) Troubleshooting checklist

### Site not reachable

- Check DNS points to server IP
- Check Tencent firewall/security group ports 80/443 open
- Check `sudo ufw status`

### Nginx errors

```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -n 100 /var/log/nginx/error.log
```

### API not running

```bash
pm2 list
pm2 logs biomech-api --lines 100
curl http://127.0.0.1:3001/api/health
```

### Miniapp request fails on real device

- Confirm HTTPS cert valid
- Confirm legal domain configured in WeChat platform
- Confirm `miniapp/utils/config.js` uses `https://yourdomain.com/api`
- Confirm domain/备案 status matches WeChat requirements

---

## 14) Quick one-time validation (after full deployment)

1. Open `https://yourdomain.com`
2. Login with your app account
3. Create one subject from web
4. Call `https://yourdomain.com/api/health`
5. In miniapp real device, login and verify same subject data is visible

If all pass, deployment is complete.
