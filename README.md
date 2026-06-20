# FreeCFBTKimiAPI

Local **OpenAI / Anthropic / OpenAI Responses-compatible** proxy for the keyless `cfbt.ccwu.cc` Kimi endpoint.

It lets coding agents and API clients talk to a local endpoint:

```text
Claude Code / Hermes / OpenCode / Codex / SDKs
        ↓
http://127.0.0.1:3271/v1
        ↓
https://cfbt.ccwu.cc/v1
        ↓
Cloudflare-hosted Kimi model
```

> **Important:** this is a local proxy to a remote third-party/keyless upstream. It is **not** a local LLM and not an official Moonshot/Kimi API. Treat it as an experimental free endpoint for demos, learning, and agent testing — not as production infrastructure.

## What works

Verified on this machine with real sentinel-file agent tasks:

- ✅ OpenAI Chat Completions: `/v1/chat/completions`
- ✅ OpenAI Chat streaming normalization
- ✅ OpenAI tool-call simulation + tool-result continuation
- ✅ Anthropic Messages shim: `/v1/messages`
- ✅ OpenAI Responses shim: `/v1/responses`
- ✅ Claude Code agent E2E
- ✅ Hermes Agent E2E
- ✅ OpenCode E2E
- ✅ Codex CLI E2E via Responses API
- ⚠️ OpenClaw model catalog can see the model, but `agent --local` may still report `Unknown model` until its profile/gateway registry is aligned

Latest local verification:

```text
npm test: PASS
npm run e2e:
  claude-code: pass
  hermes: pass
  opencode: pass
  codex: pass
  openclaw: pending/runtime-profile issue
```

## Quick start

```bash
git clone <your-fork-url> FreeCFBTKimiAPI
cd FreeCFBTKimiAPI
cp .env.example .env
npm start
```

Default server:

```text
http://127.0.0.1:3271
```

Default OpenAI-compatible base URL:

```text
http://127.0.0.1:3271/v1
```

Health check:

```bash
curl http://127.0.0.1:3271/api/status
```

Expected shape:

```json
{
  "ok": true,
  "provider": "cfbt-ccwu-kimi",
  "upstream": "https://cfbt.ccwu.cc/v1",
  "model": "@cf/moonshotai/kimi-k2.6"
}
```

## Models

Local aliases:

- `cfbt-kimi`
- `kimi-k2.6`
- `@cf/moonshotai/kimi-k2.6`

Model list:

```bash
curl http://127.0.0.1:3271/v1/models
```

## API endpoints

### OpenAI Chat Completions

```text
GET  /v1/models
POST /v1/chat/completions
```

Example:

```bash
curl http://127.0.0.1:3271/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model":"cfbt-kimi",
    "messages":[{"role":"user","content":"Reply exactly HELLO"}],
    "temperature":0,
    "max_tokens":512
  }'
```

### Anthropic Messages shim

```text
POST /v1/messages
```

Used by Claude Code-style clients.

### OpenAI Responses shim

```text
POST /v1/responses
```

Used by Codex/OpenAI Responses-style clients. The shim supports structural `function_call` output and streaming post-tool continuation events required by Codex.

### Diagnostics

```text
GET /api/status
GET /api/diagnostics
```

`/api/diagnostics` checks the upstream model endpoint and returns a short preview.

## Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Available env vars:

```bash
PORT=3271
CFBT_BASE_URL=https://cfbt.ccwu.cc/v1
CFBT_MODEL=@cf/moonshotai/kimi-k2.6
CFBT_MAX_TOKENS_DEFAULT=1024
CFBT_TIMEOUT_MS=60000
CFBT_RETRIES=4
CFBT_RETRY_BASE_MS=700
CFBT_CIRCUIT_BREAKER_FAILURES=8
CFBT_CIRCUIT_BREAKER_MS=30000
CFBT_CLIENT_PROFILE_MODE=round_robin
CFBT_LOG_REQUESTS=0
```

Reliability features:

- request timeout;
- retry with jitter;
- circuit breaker after repeated upstream capacity/rate failures;
- normal browser-compatible request headers/profile rotation;
- explicit upstream error classification.

This is reliability hardening, **not** a stealth anti-bot bypass.

## Connect clients

Detailed recipes are in [`docs/AGENT_CLIENTS.md`](docs/AGENT_CLIENTS.md).

Short version:

### Claude Code

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:3271 \
ANTHROPIC_API_KEY=dummy \
claude --model cfbt-kimi
```

### Hermes Agent

Use a custom OpenAI-compatible provider pointed at:

```text
http://127.0.0.1:3271/v1
```

### OpenCode

Use an OpenAI-compatible provider through `@ai-sdk/openai-compatible` with base URL:

```text
http://127.0.0.1:3271/v1
```

### Codex CLI

Use custom provider with Responses wire:

```toml
model = "cfbt-kimi"
model_provider = "cfbt"

[model_providers.cfbt]
name = "CFBT Kimi"
base_url = "http://127.0.0.1:3271/v1"
api_key = "dummy"
wire_api = "responses"
```

## Testing

Endpoint + protocol matrix:

```bash
npm test
```

Real agent-client E2E matrix:

```bash
npm run e2e
```

The E2E script creates sentinel files under `/tmp` and verifies that the client actually executed tools, not just printed a plausible answer.

Current expected result:

```text
claude-code: pass
hermes: pass
opencode: pass
codex: pass
openclaw: pending
```

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

High level:

- `src/server.js` — local HTTP API surface and protocol shims;
- `src/upstream.js` — CFBT upstream client, retry/backoff/circuit breaker;
- `src/tool_sim.js` — tool-call parser, deterministic smoke fallbacks, loop-safe continuation;
- `src/config.js` — dotenv/env config and client profile selection;
- `scripts/endpoint_matrix_smoke.js` — endpoint/protocol regression smoke;
- `scripts/agent_clients_e2e.sh` — real coding-agent E2E matrix.

## Limitations

- Upstream can return rate/capacity errors such as `3040 Capacity temporarily exceeded`.
- Upstream can block or change behavior without warning.
- This is not official Moonshot/Kimi infrastructure.
- Do not send private code, passwords, API keys, customer data, or unreleased commercial secrets to free third-party endpoints.
- Tool use is simulated at the proxy layer. It is good enough for many agent tasks and smoke tests, but it is not native Kimi tool calling.
- Public demos should say “local proxy to remote free endpoint”, not “free local model”.

## Public demo positioning

Good framing:

> “I’m running a local OpenAI/Anthropic/Responses-compatible API proxy. The model itself runs remotely through a free/keyless endpoint, but locally my agents see a normal API server.”

Avoid:

- “official Kimi API”;
- “local Kimi model”;
- “production-ready unlimited free API”;
- “bypass Cloudflare/rate limits”.

## Safety

This project is for local experiments and education. Keep secrets out of prompts, logs, examples, commits, and public videos.
