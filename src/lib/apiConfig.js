export const DEFAULT_BACKEND_ORIGIN = 'https://phineas8-mindflow-backend.hf.space';

export function normalizeBackendOrigin(value) {
  return (value || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

export function resolveApiBase(configuredOrigin, development = false) {
  const origin = normalizeBackendOrigin(configuredOrigin);
  return `${origin || (development ? '' : DEFAULT_BACKEND_ORIGIN)}/api`;
}

export const API_BASE = resolveApiBase(import.meta.env?.VITE_API_URL, import.meta.env?.DEV);

export function apiErrorMessage(status, detail, path) {
  if (status === 404) {
    if (/\/repository\/[a-f0-9-]{36}(?:\/|\?|$)/.test(path)) {
      return 'This repository snapshot is no longer available. Import the repository again to create a fresh snapshot.';
    }
    return `The backend could not find ${path.split('?')[0]}. Check that VITE_API_URL points to the Mindflow API server, then rebuild the frontend.`;
  }
  return typeof detail === 'string' ? detail : `Request failed (${status}). Please try again.`;
}
