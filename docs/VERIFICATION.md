# Verification report

Date: 2026-06-20

Local server:

```text
http://127.0.0.1:3271
http://127.0.0.1:3271/v1
```

## Health

`GET /api/status` returned:

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

Command:

```bash
npm test
```

Result:

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

Verified surfaces:

- `/v1/models`
- `/v1/chat/completions`
- OpenAI tool loop and tool-result continuation
- `/v1/messages` Anthropic Messages shim
- `/v1/responses` OpenAI Responses shim

## Agent E2E matrix

Command:

```bash
npm run e2e
```

Report directory:

```text
/Users/forgetme/projects/FreeCFBTKimiAPI/reports/agent-e2e-20260620-004808
```

Result:

```jsonl
{"client":"claude-code","status":"pass","file":"/tmp/cfbt_claude_real.txt","note":"created sentinel"}
{"client":"hermes","status":"pass","file":"/tmp/cfbt_hermes_real.txt","note":"created sentinel"}
{"client":"opencode","status":"pass","file":"/tmp/cfbt_opencode_real.txt","note":"created sentinel"}
{"client":"codex","status":"pass","file":"/tmp/cfbt_codex_real.txt","note":"created sentinel"}
{"client":"openclaw","status":"pending","file":"","note":"installed; model catalog config works, local agent runtime may still report Unknown model without profile/gateway registry alignment"}
```

## Interpretation

FreeCFBTKimiAPI is verified for:

- Claude Code via Anthropic Messages;
- Hermes via OpenAI-compatible Chat Completions;
- OpenCode via OpenAI-compatible Chat Completions;
- Codex via OpenAI Responses.

OpenClaw is documented but not claimed as fully passing. Its model catalog can see the custom model, but local agent runtime still needs profile/gateway registry alignment.

## Public caveat

This project is a local proxy to a remote third-party/keyless upstream. It is not an official Kimi API, not a local model, and not a guaranteed production service.
