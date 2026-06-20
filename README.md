<div align="center">

# FreeCFBTKimiAPI

**Локальный OpenAI / Anthropic / OpenAI Responses-compatible прокси для keyless Kimi endpoint `cfbt.ccwu.cc`**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![OpenAI Chat](https://img.shields.io/badge/OpenAI-Chat%20Completions-111827?style=for-the-badge)](#api-endpoints)
[![Anthropic](https://img.shields.io/badge/Anthropic-Messages-191919?style=for-the-badge)](#подключение-клиентов)
[![Responses API](https://img.shields.io/badge/OpenAI-Responses-4F46E5?style=for-the-badge)](#api-endpoints)
[![Kimi](https://img.shields.io/badge/Kimi-K2.6-00A3FF?style=for-the-badge)](#модели)

**Ватермарка:** [t.me/forgetmeai](https://t.me/forgetmeai)

</div>

---

FreeCFBTKimiAPI позволяет Claude Code, Hermes, OpenCode, Codex, SDK-клиентам и другим AI-агентам обращаться к локальному API:

```text
Claude Code / Hermes / OpenCode / Codex / SDKs
        ↓
http://127.0.0.1:3271/v1
        ↓
https://cfbt.ccwu.cc/v1
        ↓
Cloudflare-hosted Kimi model
```

> **Важно:** это локальный прокси к удалённому стороннему/keyless upstream. Это **не локальная LLM** и **не официальный Moonshot/Kimi API**. Используй проект как экспериментальный бесплатный endpoint для демо, обучения и тестов AI-агентов, а не как production-инфраструктуру.

---

## Навигация

- [Что это даёт](#что-это-даёт)
- [Что уже проверено](#что-уже-проверено)
- [Быстрый старт](#быстрый-старт)
- [Модели](#модели)
- [API endpoints](#api-endpoints)
- [Конфигурация](#конфигурация)
- [Подключение клиентов](#подключение-клиентов)
  - [Claude Code](#claude-code)
  - [Hermes Agent](#hermes-agent)
  - [OpenCode](#opencode)
  - [Codex CLI](#codex-cli)
- [Тестирование](#тестирование)
- [Архитектура](#архитектура)
- [Ограничения](#ограничения)
- [Позиционирование для публичного демо](#позиционирование-для-публичного-демо)
- [Безопасность](#безопасность)
- [Документация](#документация)

---

## Что это даёт

| Было | Стало |
| --- | --- |
| Есть сторонний keyless Kimi endpoint | Есть локальный API на `http://127.0.0.1:3271` |
| Разные агенты ждут разные API-форматы | Один прокси отдаёт OpenAI Chat, Anthropic Messages и OpenAI Responses |
| Coding agents требуют tool loop | Прокси нормализует tool-call simulation и tool-result continuation |
| Upstream может отвечать нестабильно | Есть timeout, retry, jitter, circuit breaker и диагностика |
| Демо легко переобещать | В документации явно написано: это прокси к удалённому endpoint, не локальная модель |

---

## Что уже проверено

Проверено на этой машине реальными agent-задачами с sentinel-файлами:

- ✅ OpenAI Chat Completions: `/v1/chat/completions`
- ✅ нормализация OpenAI Chat streaming
- ✅ симуляция OpenAI tool calls + продолжение после tool result
- ✅ Anthropic Messages shim: `/v1/messages`
- ✅ OpenAI Responses shim: `/v1/responses`
- ✅ Claude Code agent E2E
- ✅ Hermes Agent E2E
- ✅ OpenCode E2E
- ✅ Codex CLI E2E через Responses API
- ⚠️ OpenClaw видит модель в каталоге, но `agent --local` может всё ещё выдавать `Unknown model`, пока не выровнен его profile/gateway registry

Последняя локальная проверка:

```text
npm test: PASS
npm run e2e:
  claude-code: pass
  hermes: pass
  opencode: pass
  codex: pass
  openclaw: pending/runtime-profile issue
```

---

## Быстрый старт

```bash
git clone https://github.com/ForgetMeAI/FreeKimiAPI.git
cd FreeKimiAPI
cp .env.example .env
npm start
```

Сервер по умолчанию:

```text
http://127.0.0.1:3271
```

OpenAI-compatible base URL по умолчанию:

```text
http://127.0.0.1:3271/v1
```

Проверка здоровья:

```bash
curl http://127.0.0.1:3271/api/status
```

Ожидаемая форма ответа:

```json
{
  "ok": true,
  "provider": "cfbt-ccwu-kimi",
  "upstream": "https://cfbt.ccwu.cc/v1",
  "model": "@cf/moonshotai/kimi-k2.6"
}
```

---

## Модели

Локальные алиасы:

- `cfbt-kimi`
- `kimi-k2.6`
- `@cf/moonshotai/kimi-k2.6`

Список моделей:

```bash
curl http://127.0.0.1:3271/v1/models
```

---

## API endpoints

### OpenAI Chat Completions

```text
GET  /v1/models
POST /v1/chat/completions
```

Пример:

```bash
curl http://127.0.0.1:3271/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{
    "model":"cfbt-kimi",
    "messages":[{"role":"user","content":"Ответь ровно: HELLO"}],
    "temperature":0,
    "max_tokens":512
  }'
```

### Anthropic Messages shim

```text
POST /v1/messages
```

Используется Claude Code-подобными клиентами.

### OpenAI Responses shim

```text
POST /v1/responses
```

Используется Codex/OpenAI Responses-style клиентами. Shim поддерживает структурный `function_call` output и streaming events для продолжения после tool call, которые нужны Codex.

### Диагностика

```text
GET /api/status
GET /api/diagnostics
```

`/api/diagnostics` проверяет upstream model endpoint и возвращает короткий preview.

---

## Конфигурация

Скопируй `.env.example` в `.env`:

```bash
cp .env.example .env
```

Доступные env-переменные:

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

Reliability-функции:

- timeout запроса;
- retry с jitter;
- circuit breaker после повторяющихся capacity/rate ошибок upstream;
- обычные browser-compatible headers и rotation client profiles;
- явная классификация upstream-ошибок.

Это hardening надёжности, **а не stealth anti-bot bypass**.

---

## Подключение клиентов

Подробные рецепты лежат в [`docs/AGENT_CLIENTS.md`](docs/AGENT_CLIENTS.md).

Короткая версия:

### Claude Code

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:3271 \
ANTHROPIC_API_KEY=dummy \
claude --model cfbt-kimi
```

### Hermes Agent

Используй custom OpenAI-compatible provider с base URL:

```text
http://127.0.0.1:3271/v1
```

### OpenCode

Используй OpenAI-compatible provider через `@ai-sdk/openai-compatible` с base URL:

```text
http://127.0.0.1:3271/v1
```

### Codex CLI

Используй custom provider с Responses wire:

```toml
model = "cfbt-kimi"
model_provider = "cfbt"

[model_providers.cfbt]
name = "CFBT Kimi"
base_url = "http://127.0.0.1:3271/v1"
api_key = "dummy"
wire_api = "responses"
```

---

## Тестирование

Endpoint + protocol matrix:

```bash
npm test
```

Реальная E2E-матрица agent-клиентов:

```bash
npm run e2e
```

E2E-скрипт создаёт sentinel-файлы в `/tmp` и проверяет, что клиент действительно выполнил tools, а не просто напечатал правдоподобный ответ.

Текущий ожидаемый результат:

```text
claude-code: pass
hermes: pass
opencode: pass
codex: pass
openclaw: pending
```

---

## Архитектура

См. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Верхнеуровнево:

- `src/server.js` — локальный HTTP API и protocol shims;
- `src/upstream.js` — CFBT upstream client, retry/backoff/circuit breaker;
- `src/tool_sim.js` — parser tool calls, deterministic smoke fallbacks, loop-safe continuation;
- `src/config.js` — dotenv/env config и client profile selection;
- `scripts/endpoint_matrix_smoke.js` — regression smoke для endpoint/protocol matrix;
- `scripts/agent_clients_e2e.sh` — реальная E2E-матрица coding agents.

---

## Ограничения

- Upstream может возвращать rate/capacity ошибки вроде `3040 Capacity temporarily exceeded`.
- Upstream может заблокировать запросы или изменить поведение без предупреждения.
- Это не официальная инфраструктура Moonshot/Kimi.
- Не отправляй приватный код, пароли, API keys, customer data или коммерческие секреты в бесплатные сторонние endpoints.
- Tool use симулируется на уровне прокси. Этого хватает для многих agent-задач и smoke-тестов, но это не native Kimi tool calling.
- Для публичных демо говори “local proxy to remote free endpoint”, а не “free local model”.

---

## Позиционирование для публичного демо

Хорошая формулировка:

> “Я запускаю локальный OpenAI/Anthropic/Responses-compatible API proxy. Сама модель работает удалённо через free/keyless endpoint, но локально мои агенты видят обычный API server.”

Не стоит говорить:

- “official Kimi API”;
- “local Kimi model”;
- “production-ready unlimited free API”;
- “bypass Cloudflare/rate limits”.

---

## Безопасность

Проект предназначен для локальных экспериментов и обучения. Не допускай попадания секретов в prompts, logs, examples, commits и публичные видео.

---

## Документация

- [Настройка agent-клиентов](docs/AGENT_CLIENTS.md)
- [Архитектура](docs/ARCHITECTURE.md)
- [Гайд для публичного демо](docs/PUBLIC_DEMO_GUIDE.md)
- [Отчёт о проверке](docs/VERIFICATION.md)

---

<div align="center">

Сделано для практических экспериментов с AI-агентами<br>
**[t.me/forgetmeai](https://t.me/forgetmeai)**

</div>
