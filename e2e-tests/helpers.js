const config = require('./config');

let cachedToken = null;

async function getAuthToken() {
  if (cachedToken) return cachedToken;
  try {
    const res = await fetch(`${config.BACKEND_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.TEST_EMAIL, password: config.TEST_PASSWORD }),
    });
    if (!res.ok) throw new Error(`Login failed: ${res.status}`);
    const data = await res.json();
    cachedToken = data.token;
    return cachedToken;
  } catch (e) {
    console.error('AUTH ERROR:', e.message);
    return null;
  }
}

async function api(method, path, { body, auth = false, raw = false } = {}) {
  const url = `${config.BACKEND_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.TIMEOUT);
    opts.signal = controller.signal;
    const res = await fetch(url, opts);
    clearTimeout(timeout);
    const latency = Date.now() - start;
    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (raw) {
      data = await res.text();
    } else if (contentType.includes('json')) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text().catch(() => null);
    }
    return { status: res.status, data, latency, ok: res.ok, contentType };
  } catch (e) {
    return { status: 0, data: null, latency: Date.now() - start, ok: false, error: e.message, contentType: '' };
  }
}

async function frontendPage(path) {
  const url = `${config.FRONTEND_URL}${path}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.TIMEOUT);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    const html = await res.text();
    return { status: res.status, latency, ok: res.ok, size: html.length, hasContent: html.length > 500 };
  } catch (e) {
    return { status: 0, latency: Date.now() - start, ok: false, error: e.message, size: 0, hasContent: false };
  }
}

module.exports = { getAuthToken, api, frontendPage };
