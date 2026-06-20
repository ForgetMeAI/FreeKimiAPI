# Гайд для публичного демо

Используй этот документ, когда показываешь FreeCFBTKimiAPI аудитории.

## Корректное позиционирование

Говори:

> “Это локальный API proxy. Агенты подключаются к `localhost`, а сама модель работает удалённо через free/keyless CFBT Kimi endpoint.”

Не говори:

- “local Kimi model”;
- “official Moonshot/Kimi API”;
- “unlimited production API”;
- “Cloudflare bypass”.

## Сценарий демо

### 1. Запусти сервер

```bash
cd FreeKimiAPI
cp .env.example .env
npm start
```

### 2. Покажи health

```bash
curl http://127.0.0.1:3271/api/status
```

### 3. Покажи список моделей

```bash
curl http://127.0.0.1:3271/v1/models
```

### 4. Покажи обычный chat

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

### 5. Покажи поддержку агентов

Запусти встроенную endpoint matrix:

```bash
npm test
```

Затем, если на машине установлены agent-клиенты:

```bash
npm run e2e
```

Покажи строки вывода:

```text
claude-code: pass
hermes: pass
opencode: pass
codex: pass
```

Объясни, что каждый `pass` означает: клиент создал реальный sentinel-файл через tool execution.

## На чём делать акцент

- Один локальный endpoint может обслуживать несколько agent ecosystems:
  - Claude Code через Anthropic Messages;
  - Hermes/OpenCode через OpenAI-compatible Chat Completions;
  - Codex через OpenAI Responses.
- Прокси нормализует странное поведение upstream в чистые API shapes.
- В проекте есть тесты, которые проверяют реальное выполнение tools, а не просто текстовые ответы.
- Встроены функции надёжности: timeout, retry, jitter, circuit breaker, diagnostics.

## Что не показывать

- private code;
- API keys/passwords/tokens;
- реальные customer/user data;
- утверждения, что rate limits bypassed;
- попытки перегрузить upstream.

## Слайд с известными caveats

Используй такую формулировку:

> “Поскольку проект зависит от free/keyless third-party upstream, доступность не гарантируется. Прокси классифицирует capacity/rate/upstream errors и делает retry там, где это разумно, но production reliability обещать нельзя.”

## Варианты названий для видео

- “Я подключил бесплатный Kimi endpoint к Claude Code, Codex, Hermes и OpenCode”
- “Один локальный API для AI-агентов: Claude Code, Codex, Hermes, OpenCode”
- “Бесплатный Kimi как localhost API для агентов — с честными ограничениями”
- “Как сделать OpenAI/Anthropic-compatible proxy для бесплатной модели”

## Рекомендуемый CTA

Направляй зрителей сюда:

- quick start в README;
- `docs/AGENT_CLIENTS.md` для настройки клиентов;
- `npm test` и `npm run e2e`, прежде чем они будут говорить, что setup реально работает.
