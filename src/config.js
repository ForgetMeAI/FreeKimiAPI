import fs from 'node:fs';

function loadDotenv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadDotenv();

const defaultProfiles = [
  {
    name: 'chrome-macos',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    acceptLanguage: 'en-US,en;q=0.9',
  },
  {
    name: 'chrome-windows',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    acceptLanguage: 'en-US,en;q=0.9',
  },
  {
    name: 'safari-macos',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    acceptLanguage: 'en-US,en;q=0.9',
  },
];

function parseProfiles() {
  if (!process.env.CFBT_CLIENT_PROFILES_JSON) return defaultProfiles;
  try {
    const parsed = JSON.parse(process.env.CFBT_CLIENT_PROFILES_JSON);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return defaultProfiles;
}

export const config = {
  port: Number(process.env.PORT || 3271),
  baseUrl: process.env.CFBT_BASE_URL || 'https://cfbt.ccwu.cc/v1',
  model: process.env.CFBT_MODEL || '@cf/moonshotai/kimi-k2.6',
  defaultMaxTokens: Number(process.env.CFBT_MAX_TOKENS_DEFAULT || 1024),
  timeoutMs: Number(process.env.CFBT_TIMEOUT_MS || 60000),
  retries: Number(process.env.CFBT_RETRIES || 4),
  retryBaseMs: Number(process.env.CFBT_RETRY_BASE_MS || 700),
  circuitBreakerFailures: Number(process.env.CFBT_CIRCUIT_BREAKER_FAILURES || 8),
  circuitBreakerMs: Number(process.env.CFBT_CIRCUIT_BREAKER_MS || 30000),
  clientProfileMode: process.env.CFBT_CLIENT_PROFILE_MODE || 'round_robin',
  clientProfiles: parseProfiles(),
};

let profileIndex = 0;
export function pickClientProfile() {
  const profiles = config.clientProfiles.length ? config.clientProfiles : defaultProfiles;
  if (config.clientProfileMode === 'random') return profiles[Math.floor(Math.random() * profiles.length)];
  const p = profiles[profileIndex % profiles.length];
  profileIndex += 1;
  return p;
}
