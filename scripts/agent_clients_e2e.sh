#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${OUT:-$ROOT/reports/agent-e2e-$(date +%Y%m%d-%H%M%S)}"
BASE="${BASE_URL:-http://127.0.0.1:3271}"
mkdir -p "$OUT"
json_escape() { python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'; }
record() {
  local name="$1" status="$2" file="$3" note="$4"
  printf '{"client":"%s","status":"%s","file":"%s","note":%s}\n' "$name" "$status" "$file" "$(printf '%s' "$note" | json_escape)" >> "$OUT/results.jsonl"
}
check_file() {
  local path="$1" expected="$2"
  [[ -f "$path" ]] && [[ "$(cat "$path")" == "$expected" ]]
}

: > "$OUT/results.jsonl"

# Claude Code via Anthropic Messages shim.
if command -v claude >/dev/null 2>&1; then
  rm -f /tmp/cfbt_claude_real.txt
  (cd /tmp && ANTHROPIC_BASE_URL="$BASE" ANTHROPIC_API_KEY=dummy CLAUDE_CODE_SIMPLE=1 claude --bare --print --model cfbt-kimi --max-budget-usd 0.02 --dangerously-skip-permissions --allowedTools 'Write,Edit,Bash' --output-format json 'Create file /tmp/cfbt_claude_real.txt containing exactly CFBT_CLAUDE_REAL, then say DONE.') > "$OUT/claude.json" 2>&1
  if check_file /tmp/cfbt_claude_real.txt CFBT_CLAUDE_REAL; then record claude-code pass /tmp/cfbt_claude_real.txt "created sentinel"; else record claude-code fail /tmp/cfbt_claude_real.txt "see claude.json"; fi
else record claude-code skipped "" "claude not installed"; fi

# Hermes isolated profile.
if command -v hermes >/dev/null 2>&1; then
  hermes profile create cfbt-kimi-smoke >/dev/null 2>&1 || true
  cat > "$HOME/.hermes/profiles/cfbt-kimi-smoke/config.yaml" <<YAML
model:
  provider: custom
  default: cfbt-kimi
custom_providers:
  - name: cfbt-kimi
    base_url: $BASE/v1
    api_key: dummy
    model: cfbt-kimi
    models:
      cfbt-kimi:
        context_length: 200000
YAML
  rm -f /tmp/cfbt_hermes_real.txt
  (cd /tmp && hermes -p cfbt-kimi-smoke chat -Q --yolo --provider custom:cfbt-kimi --model cfbt-kimi -t terminal,file -q 'Use a terminal command `printf %s CFBT_HERMES_REAL > /tmp/cfbt_hermes_real.txt`, then answer DONE.') > "$OUT/hermes.txt" 2>&1
  if check_file /tmp/cfbt_hermes_real.txt CFBT_HERMES_REAL; then record hermes pass /tmp/cfbt_hermes_real.txt "created sentinel"; else record hermes fail /tmp/cfbt_hermes_real.txt "see hermes.txt"; fi
else record hermes skipped "" "hermes not installed"; fi

# OpenCode via openai-compatible provider in ephemeral config.
if command -v opencode >/dev/null 2>&1; then
  rm -f /tmp/cfbt_opencode_real.txt
  export OPENCODE_CONFIG_CONTENT='{"$schema":"https://opencode.ai/config.json","provider":{"cfbt":{"npm":"@ai-sdk/openai-compatible","name":"CFBT Kimi","options":{"baseURL":"'$BASE'/v1","apiKey":"dummy"},"models":{"cfbt-kimi":{"name":"cfbt-kimi"}}}},"model":"cfbt/cfbt-kimi"}'
  opencode run --pure --format json --model cfbt/cfbt-kimi --dangerously-skip-permissions --dir /tmp 'Create file /tmp/cfbt_opencode_real.txt containing exactly CFBT_OPENCODE_REAL, then say DONE.' > "$OUT/opencode.jsonl" 2>&1 || true
  if check_file /tmp/cfbt_opencode_real.txt CFBT_OPENCODE_REAL; then record opencode pass /tmp/cfbt_opencode_real.txt "created sentinel"; else record opencode fail /tmp/cfbt_opencode_real.txt "see opencode.jsonl"; fi
else record opencode skipped "" "opencode not installed"; fi

# Codex via isolated CODEX_HOME + Responses API.
if command -v codex >/dev/null 2>&1; then
  mkdir -p /tmp/codex-cfbt-home
  cat > /tmp/codex-cfbt-home/config.toml <<EOF
model = "cfbt-kimi"
model_provider = "cfbt"
approval_policy = "never"
sandbox_mode = "danger-full-access"

[model_providers.cfbt]
name = "CFBT Kimi"
base_url = "$BASE/v1"
api_key = "dummy"
wire_api = "responses"
EOF
  rm -f /tmp/cfbt_codex_real.txt
  CODEX_HOME=/tmp/codex-cfbt-home codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --json -C /tmp -m cfbt-kimi 'Create file /tmp/cfbt_codex_real.txt containing exactly CFBT_CODEX_REAL, then say DONE.' > "$OUT/codex.jsonl" 2>&1 || true
  if check_file /tmp/cfbt_codex_real.txt CFBT_CODEX_REAL; then record codex pass /tmp/cfbt_codex_real.txt "created sentinel"; else record codex fail /tmp/cfbt_codex_real.txt "see codex.jsonl"; fi
else record codex skipped "" "codex not installed"; fi

# OpenClaw catalog config is documented separately; agent runtime can require gateway/session registry setup.
if command -v openclaw >/dev/null 2>&1; then
  openclaw --version > "$OUT/openclaw-version.txt" 2>&1 || true
  record openclaw pending "" "installed; model catalog config works, local agent runtime may still report Unknown model without profile/gateway registry alignment"
else record openclaw skipped "" "openclaw not installed"; fi

cat "$OUT/results.jsonl"
printf '\nReport dir: %s\n' "$OUT"
