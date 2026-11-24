export const DEFAULT_BACKEND_ORIGIN = 'https://phineas8-mindflow-backend.hf.space';

export function normalizeBackendOrigin(value) {
  return (value || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

export function resolveApiBase(configuredOrigin, development = false) {
  const origin = normalizeBackendOrigin(configuredOrigin);
  return `${origin || (development ? '' : DEFAULT_BACKEND_ORIGIN)}/api`;
}

export const API_BASE = resolveApiBase(import.meta.env?.VITE_API_URL, import.meta.env?.DEV);

// ?api=origin on the page URL tells the dev-server middleware (vite.config.js)
// which backend to use for this session's calls; it overrides per request.
export const BACKEND_OVERRIDE = (() => {
  try {
    const origin = new URLSearchParams(window.location.search).get('api');
    return origin ? normalizeBackendOrigin(origin) : '';
  } catch {
    return '';
  }
})();

const baseFetch = globalThis.fetch;
if (typeof window !== 'undefined' && BACKEND_OVERRIDE) {
  globalThis.fetch = (...args) => {
    if (String(args[0]).includes('/api/')) {
      const init = { ...(args[1] || {}) };
      init.headers = { ...(init.headers || {}), 'x-backend-override': BACKEND_OVERRIDE };
      return baseFetch(args[0], init);
    }
    return baseFetch(...args);
  };
}

export function apiErrorMessage(status, detail, path) {
  if (status === 404) {
    if (/\/repository\/[a-f0-9-]{36}(?:\/|\?|$)/.test(path)) {
      return 'This repository snapshot is no longer available. Import the repository again to create a fresh snapshot.';
    }
    return `The backend could not find ${path.split('?')[0]}. Check that VITE_API_URL points to the Mindflow API server, then rebuild the frontend.`;
  }
  return typeof detail === 'string' ? detail : `Request failed (${status}). Please try again.`;
}
