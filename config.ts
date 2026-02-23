// For cloud deployment, set VITE_API_URL to your hosted API base URL.
// If empty, frontend uses relative '/api' paths (works with Vite proxy in dev
// and single-server deployments in production).
// @ts-ignore
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Cloud mode default is enabled unless explicitly turned off.
// @ts-ignore
export const USE_CLOUD_STORAGE = import.meta.env.VITE_USE_CLOUD !== 'false';
