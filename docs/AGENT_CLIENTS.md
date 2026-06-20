# Agent client setup

These recipes assume FreeCFBTKimiAPI is running locally:

```bash
cd /path/to/FreeCFBTKimiAPI
cp .env.example .env
npm start
```

Base URLs:

```text
Server root: http://127.0.0.1:3271
OpenAI base: http://127.0.0.1:3271/v1
```

## Claude Code

Claude Code talks Anthropic Messages. Point it at the server root, not `/v1`:

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:3271 \
ANTHROPIC_API_KEY=dummy \
claude --bare --print --model cfbt-kimi \
  --dangerously-skip-permissions \
  --allowedTools 'Write,Edit,Bash' \
  'Create file /tmp/cfbt_claude_real.txt containing exactly CFBT_CLAUDE_REAL, then say DONE.'
```

Expected: Claude Code executes a tool and creates the file.

## Hermes Agent

Use an isolated Hermes profile for testing so the user's default config is not mutated.

Example profile config:

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

Example run:

```bash
hermes profile create cfbt-kimi-smoke || true
# write config to ~/.hermes/profiles/cfbt-kimi-smoke/config.yaml
hermes -p cfbt-kimi-smoke chat -Q --yolo \
  --provider custom:cfbt-kimi \
  --model cfbt-kimi \
  -t terminal,file \
  -q 'Create file /tmp/cfbt_hermes_real.txt containing exactly CFBT_HERMES_REAL, then answer DONE.'
```

Expected: Hermes executes a local tool and creates the file.

## OpenCode

Use ephemeral OpenCode config:

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

On macOS, do not rely on GNU `timeout`; it may not be installed.

## Codex CLI

Codex requires OpenAI Responses wire for this setup.

Use isolated `CODEX_HOME`:

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

Success requires both:

- `command_execution` item completed;
- final `turn.completed`.

If Codex executes the command but fails with `stream disconnected before response.completed`, the Responses streaming post-tool continuation is broken.

## OpenClaw

Known partial state:

- `openclaw models list` can see a custom `openai/cfbt-kimi` model when configured through `models.json`.
- `openclaw agent --local` may still report `Unknown model: openai/cfbt-kimi` because its runtime/session registry does not align with the profile model catalog.

Model catalog location:

```text
~/.openclaw-<profile>/agents/main/agent/models.json
```

Example catalog:

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

Set primary model:

```bash
openclaw --profile cfbt-kimi config set agents.defaults.model.primary openai/cfbt-kimi
```

Treat OpenClaw as pending until a clean `agent --local` run creates a sentinel file.

## Built-in E2E script

Run all installed clients:

```bash
npm run e2e
```

Current verified output on this machine:

```text
claude-code: pass
hermes: pass
opencode: pass
codex: pass
openclaw: pending
```
