# Архитектура FreeCFBTKimiAPI

FreeCFBTKimiAPI — небольшой локальный compatibility proxy. Он не хранит model weights локально. Прокси принимает распространённые API-диалекты для AI-агентов и пересылает обычные chat-запросы в keyless CFBT Kimi upstream.

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

## Модули

### `src/server.js`

Отвечает за локальный HTTP server и все публичные compatibility routes:

- `GET /`, `/health`, `/api/status`
- `GET /api/diagnostics`
- `GET /v1/models`, `/models`
- `POST /v1/chat/completions`, `/chat/completions`
- `POST /v1/messages`, `/messages`
- `POST /v1/responses`, `/responses`

Файл намеренно не требует внешних dependencies: только встроенный Node `http` server и `fetch`.

### `src/upstream.js`

Отвечает за upstream-запросы и controls надёжности:

- нормализация model aliases;
- request timeout через `AbortController`;
- retry с jitter;
- circuit breaker после повторяющихся capacity/rate failures;
- browser-compatible normal headers/profile selection;
- классификация ошибок.

Классы ошибок:

- `capacity_exceeded`
- `blocked_by_upstream`
- `rate_limited`
- `upstream_5xx`
- `upstream_timeout_or_network`

### `src/tool_sim.js`

Отвечает за proxy-layer tool-call simulation для upstream, у которого нет native tools:

- вставляет компактный tool adapter prompt;
- парсит XML / fenced JSON / raw JSON tool-call output;
- даёт deterministic file/shell tool fallback для smoke-тестов;
- определяет tool-result messages;
- перестаёт форсировать tools после tool result;
- возвращает финальный `DONE` / `Done.`, если задача этого просит.

### `src/config.js`

Загружает `.env` и отдаёт runtime config:

- port;
- upstream base URL и model;
- max-token default;
- retry/circuit-breaker settings;
- client profile mode и profiles.

## Wire dialects

### OpenAI Chat Completions

Используется многими SDK, Hermes custom providers и OpenCode-compatible путями.

Для streaming-запросов сервер сейчас вызывает upstream в non-streaming режиме и переизлучает чистый локальный SSE stream. Это помогает обойти CFBT/Kimi reasoning-first streaming quirks, когда agent-клиенты слишком долго не видят `delta.content`.

Tool calls возвращаются как обычные OpenAI `tool_calls` с `finish_reason: "tool_calls"`.

### Anthropic Messages

Используется Claude Code. Shim мапит Anthropic messages/tools во внутренний OpenAI-like tool simulation path и возвращает Anthropic content blocks:

- text answer: `{ type: "text", text: "..." }`
- tool call: `{ type: "tool_use", id, name, input }`

### OpenAI Responses

Используется Codex-style клиентами. Важные детали совместимости:

- file/shell tasks с tools возвращают структурный `output[].type == "function_call"`;
- tool arguments включают и `cmd`, и `command` для совместимости command-tools;
- streaming branches отдают полный Responses event lifecycle;
- streaming-продолжение после tool call возвращает `response.completed`, иначе Codex может упасть уже после выполнения команды.

## Зачем нужны deterministic tool fallbacks

Free/keyless models часто ломают agent tool use одним из трёх способов:

1. пишут malformed tool JSON/XML;
2. используют неправильный argument key;
3. описывают команду текстом вместо запроса tool call.

Для публичных agent smoke-тестов прокси включает deterministic fallback для явных file-create/tool-name задач. Это не замена model intelligence; это способ сделать protocol compatibility проверяемой и не ловить false failures из-за слабого formatting tools.

## Статус OpenClaw

OpenClaw custom catalog видит `openai/cfbt-kimi` через:

```text
~/.openclaw-<profile>/agents/main/agent/models.json
```

primary model можно задать через:

```text
agents.defaults.model.primary
```

В локальном тестировании `openclaw models list` видел модель, но `openclaw agent --local` всё ещё отвечал `Unknown model: openai/cfbt-kimi`. Считай это проблемой alignment OpenClaw runtime/profile registry, а не failure endpoint FreeCFBTKimiAPI, пока дальнейший debugging не докажет обратное.

## Правило проверки

Не называй проект agent-ready после одних plain chat тестов. Нужная матрица:

1. `/v1/models`
2. plain chat
3. OpenAI tool loop
4. Anthropic Messages
5. Responses API
6. реальные downstream clients, которые создают sentinel-файлы
