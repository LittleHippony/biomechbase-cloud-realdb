
// For the "Single Server" deployment strategy (Cheapest):
// If VITE_API_URL is NOT set in the environment, we use an empty string.
// This forces the browser to use relative paths (e.g., "/api/subjects" instead of "http://.../api/subjects").
// This allows serving the Frontend and Backend from the same cheap server (port 3000).

// @ts-ignore
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Toggle to switch between LocalStorage (Demo) and Cloud API
// @ts-ignore
export const USE_CLOUD_STORAGE = import.meta.env.VITE_USE_CLOUD === 'true';
