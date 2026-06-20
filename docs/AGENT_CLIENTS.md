# Настройка agent-клиентов

Эти рецепты предполагают, что FreeCFBTKimiAPI запущен локально:

```bash
cd /path/to/FreeKimiAPI
cp .env.example .env
npm start
```

Base URLs:

```text
Корень сервера: http://127.0.0.1:3271
OpenAI base:    http://127.0.0.1:3271/v1
```

## Claude Code

Claude Code работает через Anthropic Messages. Указывай корень сервера, а не `/v1`:

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:3271 \
ANTHROPIC_API_KEY=dummy \
claude --bare --print --model cfbt-kimi \
  --dangerously-skip-permissions \
  --allowedTools 'Write,Edit,Bash' \
  'Create file /tmp/cfbt_claude_real.txt containing exactly CFBT_CLAUDE_REAL, then say DONE.'
```

Ожидаемый результат: Claude Code выполнит tool и создаст файл.

## Hermes Agent

Для тестов лучше использовать изолированный Hermes profile, чтобы не менять пользовательский default config.

Пример config для profile:

```yaml
model:
  provider: custom
  default: cfbt-kimi
custom_providers:
  - name: cfbt-kimi
    base_url: http://127.0.0.1:3271/v1
    api_key: dummy
    model: cfbt-kimi
    models:
      cfbt-kimi:
        context_length: 200000
```

Пример запуска:

```bash
hermes profile create cfbt-kimi-smoke || true
# запиши config в ~/.hermes/profiles/cfbt-kimi-smoke/config.yaml
hermes -p cfbt-kimi-smoke chat -Q --yolo \
  --provider custom:cfbt-kimi \
  --model cfbt-kimi \
  -t terminal,file \
  -q 'Create file /tmp/cfbt_hermes_real.txt containing exactly CFBT_HERMES_REAL, then answer DONE.'
```

Ожидаемый результат: Hermes выполнит локальный tool и создаст файл.

## OpenCode

Используй временный OpenCode config:

```bash
export OPENCODE_CONFIG_CONTENT='{
  "$schema":"https://opencode.ai/config.json",
  "provider":{
    "cfbt":{
      "npm":"@ai-sdk/openai-compatible",
      "name":"CFBT Kimi",
      "options":{
        "baseURL":"http://127.0.0.1:3271/v1",
        "apiKey":"dummy"
      },
      "models":{
        "cfbt-kimi":{"name":"cfbt-kimi"}
      }
    }
  },
  "model":"cfbt/cfbt-kimi"
}'

opencode run --pure --format json \
  --model cfbt/cfbt-kimi \
  --dangerously-skip-permissions \
  --dir /tmp \
  'Create file /tmp/cfbt_opencode_real.txt containing exactly CFBT_OPENCODE_REAL, then say DONE.'
```

На macOS не рассчитывай на GNU `timeout`: он может быть не установлен.

## Codex CLI

Для этой схемы Codex требует OpenAI Responses wire.

Используй изолированный `CODEX_HOME`:

```bash
mkdir -p /tmp/codex-cfbt-home
cat > /tmp/codex-cfbt-home/config.toml <<'EOF'
model = "cfbt-kimi"
model_provider = "cfbt"
approval_policy = "never"
sandbox_mode = "danger-full-access"

[model_providers.cfbt]
name = "CFBT Kimi"
base_url = "http://127.0.0.1:3271/v1"
api_key = "dummy"
wire_api = "responses"
EOF

CODEX_HOME=/tmp/codex-cfbt-home codex exec \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  --json \
  -C /tmp \
  -m cfbt-kimi \
  'Create file /tmp/cfbt_codex_real.txt containing exactly CFBT_CODEX_REAL, then say DONE.'
```

Для успеха нужны оба события:

- `command_execution` item completed;
- финальный `turn.completed`.

Если Codex выполнил команду, но упал с `stream disconnected before response.completed`, значит сломано streaming-продолжение после tool call в Responses API.

## OpenClaw

Известное частичное состояние:

- `openclaw models list` видит custom-модель `openai/cfbt-kimi`, если она настроена через `models.json`.
- `openclaw agent --local` всё ещё может выдавать `Unknown model: openai/cfbt-kimi`, потому что runtime/session registry не совпадает с profile model catalog.

Путь к model catalog:

```text
~/.openclaw-<profile>/agents/main/agent/models.json
```

Пример catalog:

```json
{
  "providers": {
    "openai": {
      "api": "openai-responses",
      "baseUrl": "http://127.0.0.1:3271/v1",
      "apiKey": "dummy",
      "models": [
        {
          "id": "cfbt-kimi",
          "name": "cfbt-kimi",
          "api": "openai-responses",
          "contextWindow": 200000,
          "maxTokens": 4096,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        }
      ]
    }
  }
}
```

Задать primary model:

```bash
openclaw --profile cfbt-kimi config set agents.defaults.model.primary openai/cfbt-kimi
```

Считай OpenClaw pending, пока чистый запуск `agent --local` не создаст sentinel-файл.

## Встроенный E2E-скрипт

Запуск всех установленных клиентов:

```bash
npm run e2e
```

Текущий проверенный вывод на этой машине:

```text
claude-code: pass
hermes: pass
opencode: pass
codex: pass
openclaw: pending
```
