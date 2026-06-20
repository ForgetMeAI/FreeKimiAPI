# Public demo guide

Use this guide when presenting FreeCFBTKimiAPI to an audience.

## Correct positioning

Say:

> “This is a local API proxy. Agents connect to `localhost`, while the model itself runs remotely through a free/keyless CFBT Kimi endpoint.”

Do not say:

- “local Kimi model”;
- “official Moonshot/Kimi API”;
- “unlimited production API”;
- “Cloudflare bypass”.

## Demo flow

### 1. Start server

```bash
cd FreeCFBTKimiAPI
cp .env.example .env
npm start
```

### 2. Show health

```bash
curl http://127.0.0.1:3271/api/status
```

### 3. Show model list

```bash
curl http://127.0.0.1:3271/v1/models
```

### 4. Show plain chat

```bash
curl http://127.0.0.1:3271/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model":"cfbt-kimi",
    "messages":[{"role":"user","content":"Reply exactly DEMO_OK"}],
    "temperature":0,
    "max_tokens":512
  }'
```

### 5. Show agent support

Run the built-in endpoint matrix:

```bash
npm test
```

Then, if the machine has agent clients installed:

```bash
npm run e2e
```

Show the output lines:

```text
claude-code: pass
hermes: pass
opencode: pass
codex: pass
```

Explain that each pass means the client created a real sentinel file through tool execution.

## What to emphasize

- One local endpoint can support several agent ecosystems:
  - Claude Code via Anthropic Messages;
  - Hermes/OpenCode via OpenAI-compatible Chat Completions;
  - Codex via OpenAI Responses.
- The proxy normalizes weird upstream behavior into clean API shapes.
- The project includes tests that verify real tool execution, not just text answers.
- Reliability features are built in: timeout, retry, jitter, circuit breaker, diagnostics.

## What to avoid showing

- private code;
- API keys/passwords/tokens;
- real customer/user data;
- claims that rate limits are bypassed;
- attempts to overload the upstream.

## Known caveats slide

Use this wording:

> “Because this depends on a free/keyless third-party upstream, availability is not guaranteed. The proxy classifies capacity/rate/upstream errors and retries where reasonable, but it cannot promise production reliability.”

## Suggested video title angles

- “Я подключил бесплатный Kimi endpoint к Claude Code, Codex, Hermes и OpenCode”
- “Один локальный API для AI-агентов: Claude Code, Codex, Hermes, OpenCode”
- “Бесплатный Kimi как localhost API для агентов — с честными ограничениями”
- “Как сделать OpenAI/Anthropic-compatible proxy для бесплатной модели”

## Recommended CTA

Point viewers to:

- README quick start;
- `docs/AGENT_CLIENTS.md` for client setup;
- `npm test` and `npm run e2e` before they claim their setup works.
