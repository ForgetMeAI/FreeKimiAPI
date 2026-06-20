# Отчёт о проверке

Дата: 2026-06-20

Локальный сервер:

```text
http://127.0.0.1:3271
http://127.0.0.1:3271/v1
```

## Health

`GET /api/status` вернул:

```json
{
  "ok": true,
  "provider": "cfbt-ccwu-kimi",
  "upstream": "https://cfbt.ccwu.cc/v1",
  "model": "@cf/moonshotai/kimi-k2.6",
  "defaultMaxTokens": 1024,
  "runtime": {
    "circuit_open": false,
    "circuit_open_until": null,
    "consecutive_capacity_errors": 0
  }
}
```

## Endpoint matrix

Команда:

```bash
npm test
```

Результат:

```text
ok
{
  "ok": true,
  "results": [
    "models_ok",
    "chat_ok",
    "openai_tool_loop_ok",
    "anthropic_ok",
    "responses_ok"
  ]
}
```

Проверенные поверхности:

- `/v1/models`
- `/v1/chat/completions`
- OpenAI tool loop и продолжение после tool result
- `/v1/messages` Anthropic Messages shim
- `/v1/responses` OpenAI Responses shim

## Agent E2E matrix

Команда:

```bash
npm run e2e
```

Директория отчёта:

```text
/Users/forgetme/projects/FreeCFBTKimiAPI/reports/agent-e2e-20260620-004808
```

Результат:

```jsonl
{"client":"claude-code","status":"pass","file":"/tmp/cfbt_claude_real.txt","note":"created sentinel"}
{"client":"hermes","status":"pass","file":"/tmp/cfbt_hermes_real.txt","note":"created sentinel"}
{"client":"opencode","status":"pass","file":"/tmp/cfbt_opencode_real.txt","note":"created sentinel"}
{"client":"codex","status":"pass","file":"/tmp/cfbt_codex_real.txt","note":"created sentinel"}
{"client":"openclaw","status":"pending","file":"","note":"installed; model catalog config works, local agent runtime may still report Unknown model without profile/gateway registry alignment"}
```

## Интерпретация

FreeCFBTKimiAPI проверен для:

- Claude Code через Anthropic Messages;
- Hermes через OpenAI-compatible Chat Completions;
- OpenCode через OpenAI-compatible Chat Completions;
- Codex через OpenAI Responses.

OpenClaw задокументирован, но не заявлен как полностью passing. Его model catalog видит custom-модель, но local agent runtime всё ещё требует alignment profile/gateway registry.

## Публичный caveat

Этот проект — локальный proxy к удалённому third-party/keyless upstream. Это не официальный Kimi API, не локальная модель и не гарантированный production-сервис.
