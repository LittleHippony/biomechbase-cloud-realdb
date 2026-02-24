<div align="center">
<img width="180" alt="HipponyLab" src="public/hippony-logo.png" />
</div>

# Run and deploy your HipponyLab app

This contains everything you need to run your app locally.

## Run Locally (Cloud Mode)

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the cloud app (API + frontend):
   `npm run dev`

This starts:
- Frontend (Vite) on `http://localhost:5173`
- Backend API on `http://localhost:3001`

Authentication setup:
- A default admin account may be created during local initialization.
- Do not publish or share default credentials in repository documents.
- Change admin credentials immediately after first startup.

## Environment Variables

- `VITE_USE_CLOUD` (optional): defaults to `true`; set to `false` to force browser local storage mode
- `VITE_API_URL` (optional): cloud API base URL (e.g. `https://your-api.example.com`)
- `PORT` (optional): backend port for `server/index.js` (default `3001`)
- `DB_MODE` (optional): `json` (default) or `mysql`
- `MYSQL_HOST` (required when `DB_MODE=mysql`): MySQL host/IP (e.g. Tencent Lighthouse private/public IP)
- `MYSQL_PORT` (optional): MySQL port (default `3306`)
- `MYSQL_USER` (required when `DB_MODE=mysql`): database username
- `MYSQL_PASSWORD` (required when `DB_MODE=mysql`): database password
- `MYSQL_DATABASE` (required when `DB_MODE=mysql`): database name
- `MYSQL_TABLE` (optional): state table name (default `app_state`)
- `MYSQL_SSL` (optional): `true`/`false` (default `false`)

### MySQL quick start (server)

Use this when deploying backend to Tencent 轻量服务器 with MySQL:

```bash
DB_MODE=mysql \
MYSQL_HOST=127.0.0.1 \
MYSQL_PORT=3306 \
MYSQL_USER=biomech \
MYSQL_PASSWORD=change_me \
MYSQL_DATABASE=biomechbase \
PORT=3001 \
FRONTEND_ORIGIN=https://yourdomain.com \
node server/index.js
```

The backend stores app data in one MySQL table (`app_state`) as a JSON document, so your existing API behavior remains unchanged.

## Dual-end Support (Web + WeChat Mini Program)

This repo now includes two clients using the same backend API:

- Web app (existing Vite app in root)
- WeChat Mini Program (new folder: `miniapp/`)

### WeChat Mini Program Setup

1. Keep backend running (recommended):
   - `npm run dev:server`
2. Open WeChat DevTools and import project from:
   - `miniapp/`
3. In mini app API config, set backend base URL as needed:
   - File: `miniapp/utils/config.js`
   - Default: `http://127.0.0.1:3001/api`

### Mini Program Features (MVP)

- Login / logout
- Subject list view + create/edit
- Study protocol list view + create/edit
- Recycle-bin toggle + restore/delete (version-aware)
- Admin-only protocol management
- Ethical file open/download (PDF/JPEG/PNG)
- Version-conflict UX (409 prompt + reload latest)

### Notes for Real Device Testing

- WeChat real-device requests require a valid HTTPS domain in mini program settings.
- For local debugging in DevTools, localhost/127.0.0.1 can be used depending on your tool settings.
