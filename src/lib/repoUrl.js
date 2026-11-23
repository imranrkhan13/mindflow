// Shared validation for public GitHub repository roots. Mirrors the backend
// parse_url rules so a bad URL is explained before any request is made.
const REPO_ROOT = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

export function normalizeRepoUrl(value) {
  return (value || '').trim();
}

export function validateRepoUrl(value) {
  const raw = normalizeRepoUrl(value);
  if (!raw) return 'Paste a GitHub repository URL, for example https://github.com/owner/repo';
  if (!/^https?:\/\//i.test(raw)) {
    return 'Start with https://github.com/ — full URL, not just owner/repo';
  }
  if (!/^https:\/\/github\.com\//i.test(raw)) {
    return 'Only https://github.com/owner/repo links are supported';
  }
  const path = raw.replace(/^https:\/\/github\.com\//i, '');
  const segments = path.replace(/\.git$/, '').replace(/\/+$/, '').split('/');
  if (segments.length !== 2) {
    return 'Use the repository root. Branch, folder and file links are not accepted';
  }
  if (!REPO_ROOT.test(raw.replace(/\/+$/, ''))) {
    return 'Use a public repository root URL: https://github.com/owner/repo';
  }
  return '';
}

export function repoSlug(value) {
  const raw = normalizeRepoUrl(value);
  const match = raw.match(REPO_ROOT);
  return match ? `${match[1]}/${match[2]}` : '';
}
