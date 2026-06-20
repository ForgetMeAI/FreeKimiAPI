import { config, pickClientProfile } from './config.js';

export function normalizeModel(model) {
  if (!model || model === 'kimi' || model === 'kimi-k2.6' || model === 'cfbt-kimi' || model === 'moonshot-kimi') return config.model;
  return model;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function jitter(ms) { return Math.round(ms * (0.75 + Math.random() * 0.5)); }
function classify(text, status) {
  if (/3040|capacity temporarily exceeded|capacity|temporarily/i.test(text)) return 'capacity_exceeded';
  if (/1010|browser_signature_banned|access denied/i.test(text)) return 'blocked_by_upstream';
  if (/rate|too many|429/i.test(text) || status === 429) return 'rate_limited';
  if (status >= 500) return 'upstream_5xx';
  return 'upstream_error';
}

let circuitOpenUntil = 0;
let consecutiveCapacityErrors = 0;

function upstreamHeaders(stream = false) {
  const profile = pickClientProfile();
  return {
    'content-type': 'application/json',
    accept: stream ? 'text/event-stream' : 'application/json',
    'user-agent': profile.userAgent,
    'accept-language': profile.acceptLanguage,
    'cache-control': 'no-cache',
    pragma: 'no-cache',
  };
}

async function fetchWithTimeout(url, options, timeoutMs = config.timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function upstreamChat(body, { stream = false, retries = config.retries } = {}) {
  if (Date.now() < circuitOpenUntil) {
    return new Response(JSON.stringify({ error: { message: 'Upstream circuit breaker open after repeated capacity/rate failures. Try again shortly.', type: 'circuit_open', retry_after_ms: circuitOpenUntil - Date.now() } }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
  const payload = {
    ...body,
    model: normalizeModel(body.model),
    max_tokens: Math.max(Number(body.max_tokens || 0), config.defaultMaxTokens),
  };
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetchWithTimeout(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: upstreamHeaders(stream),
        body: JSON.stringify(payload),
      });
    } catch (e) {
      last = { status: 504, text: JSON.stringify({ error: { message: String(e), type: 'upstream_timeout_or_network' } }) };
      await sleep(jitter(config.retryBaseMs * (attempt + 1)));
      continue;
    }
    if (stream || res.ok || ![429, 500, 502, 503, 504].includes(res.status)) {
      consecutiveCapacityErrors = res.ok ? 0 : consecutiveCapacityErrors;
      return res;
    }
    const text = await res.text();
    const type = classify(text, res.status);
    last = { status: res.status, text };
    if (!['capacity_exceeded', 'rate_limited', 'upstream_5xx'].includes(type)) {
      return new Response(text, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
    }
    consecutiveCapacityErrors += 1;
    if (consecutiveCapacityErrors >= config.circuitBreakerFailures) {
      circuitOpenUntil = Date.now() + config.circuitBreakerMs;
      break;
    }
    await sleep(jitter(config.retryBaseMs * (attempt + 1)));
  }
  return new Response(last?.text || '{"error":{"message":"upstream retry exhausted","type":"retry_exhausted"}}', { status: last?.status || 502, headers: { 'content-type': 'application/json' } });
}

export async function upstreamModels() {
  return fetchWithTimeout(`${config.baseUrl.replace(/\/$/, '')}/models`, {
    headers: { accept: 'application/json', ...upstreamHeaders(false) },
  }, config.timeoutMs);
}

export function upstreamRuntimeStatus() {
  return {
    circuit_open: Date.now() < circuitOpenUntil,
    circuit_open_until: circuitOpenUntil || null,
    consecutive_capacity_errors: consecutiveCapacityErrors,
  };
}
