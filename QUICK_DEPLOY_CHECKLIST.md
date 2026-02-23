# Quick Deploy Checklist (Daily, Command-Only)

## 1) SSH

```powershell
ssh ubuntu@<SERVER_IP>
```

## 2) Update + Build + Restart

```bash
cd /var/www/biomechbase
git pull
npm install
npm run build
pm2 restart biomech-api
pm2 save
sudo nginx -t
sudo systemctl reload nginx
```

## 3) Health Checks

```bash
pm2 list
pm2 logs biomech-api --lines 60
curl -fsS https://yourdomain.com/api/health
curl -I https://yourdomain.com
```

## 4) Backup Database File

```bash
mkdir -p /var/backups/biomechbase
cp /var/www/biomechbase/server/db.json /var/backups/biomechbase/db-$(date +%F-%H%M%S).json
ls -lh /var/backups/biomechbase | tail -n 5
```

## 5) If Deploy Fails (Quick Logs)

```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -n 100 /var/log/nginx/error.log
pm2 logs biomech-api --lines 200
```
