# FreeCFBTKimiAPI architecture

FreeCFBTKimiAPI is a small local compatibility proxy. It does not host model weights locally. It accepts common agent API dialects and forwards plain chat requests to the keyless CFBT Kimi upstream.

## Runtime flow

```text
Agent / SDK client
  ├─ OpenAI Chat Completions: /v1/chat/completions
  ├─ Anthropic Messages:      /v1/messages
  └─ OpenAI Responses:        /v1/responses
        ↓
FreeCFBTKimiAPI local server
        ↓
Tool-call simulation / protocol normalization
        ↓
CFBT upstream client with retry/backoff/circuit breaker
        ↓
https://cfbt.ccwu.cc/v1/chat/completions
```

## Modules

### `src/server.js`

Owns the local HTTP server and all public compatibility routes:

- `GET /`, `/health`, `/api/status`
- `GET /api/diagnostics`
- `GET /v1/models`, `/models`
- `POST /v1/chat/completions`, `/chat/completions`
- `POST /v1/messages`, `/messages`
- `POST /v1/responses`, `/responses`

It is intentionally dependency-free: Node's built-in `http` server plus `fetch`.

### `src/upstream.js`

Owns upstream calls and reliability controls:

- model alias normalization;
- request timeout via `AbortController`;
- retry with jitter;
- circuit breaker after repeated capacity/rate failures;
- browser-compatible normal headers/profile selection;
- error classification.

Error classes include:

- `capacity_exceeded`
- `blocked_by_upstream`
- `rate_limited`
- `upstream_5xx`
- `upstream_timeout_or_network`

### `src/tool_sim.js`

Owns proxy-layer tool-call simulation for a non-tool-native upstream:

- inserts a compact tool adapter prompt;
- parses XML / fenced JSON / raw JSON tool-call output;
- provides deterministic file/shell tool fallback for smoke tests;
- detects tool-result messages;
- stops forcing tools after a tool result;
- returns final `DONE` / `Done.` when the task asks for it.

### `src/config.js`

Loads `.env` and exposes runtime config:

- port;
- upstream base URL and model;
- max-token default;
- retry/circuit-breaker settings;
- client profile mode and profiles.

## Wire dialects

### OpenAI Chat Completions

Used by many SDKs, Hermes custom providers, and OpenCode-compatible paths.

For streaming requests, the server currently calls upstream non-streaming and re-emits a clean local SSE stream. This avoids CFBT/Kimi reasoning-first streaming quirks where agent clients can see no `delta.content` for too long.

Tool calls are emitted as normal OpenAI `tool_calls` with `finish_reason: "tool_calls"`.

### Anthropic Messages

Used by Claude Code. The shim maps Anthropic messages/tools into the internal OpenAI-like tool simulation path and returns Anthropic content blocks:

- text answer: `{ type: "text", text: "..." }`
- tool call: `{ type: "tool_use", id, name, input }`

### OpenAI Responses

Used by Codex-style clients. Important compatibility details:

- file/shell tasks with tools return structural `output[].type == "function_call"`;
- tool arguments include both `cmd` and `command` for command-tool compatibility;
- streaming branches emit complete Responses event lifecycle;
- post-tool streaming continuation returns `response.completed`, otherwise Codex may fail after executing the command.

## Why deterministic tool fallbacks exist

Free/keyless models often fail agent tool use in one of three ways:

1. write malformed tool JSON/XML;
2. use the wrong argument key;
3. describe the command instead of requesting a tool call.

For public agent smoke tests, the proxy includes a deterministic fallback for explicit file-create/tool-name tasks. This is not meant to replace model intelligence; it makes protocol compatibility testable and prevents false failures caused by weak tool formatting.

## OpenClaw status

OpenClaw custom catalog can see `openai/cfbt-kimi` via:

```text
~/.openclaw-<profile>/agents/main/agent/models.json
```

and primary model can be set through:

```text
agents.defaults.model.primary
```

In local testing, `openclaw models list` saw the model, but `openclaw agent --local` still reported `Unknown model: openai/cfbt-kimi`. Classify this as OpenClaw runtime/profile registry alignment, not a FreeCFBTKimiAPI endpoint failure, unless further debugging proves otherwise.

## Verification rule

Do not call this project agent-ready after only plain chat tests. Required matrix:

1. `/v1/models`
2. plain chat
3. OpenAI tool loop
4. Anthropic Messages
5. Responses API
6. real downstream clients creating sentinel files
