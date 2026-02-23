<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8cdbb2f6-c53f-44c3-898e-de34160846ae

## Run Locally (Cloud Mode)

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the cloud app (API + frontend):
   `npm run dev`

This starts:
- Frontend (Vite) on `http://localhost:5173`
- Backend API on `http://localhost:3001`

Default admin login:
- Username: `admin`
- Password: `Dongweiliu`

## Environment Variables

- `VITE_USE_CLOUD` (optional): defaults to `true`; set to `false` to force browser local storage mode
- `VITE_API_URL` (optional): cloud API base URL (e.g. `https://your-api.example.com`)
- `PORT` (optional): backend port for `server/index.js` (default `3001`)

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
