#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = process.env.BASE_URL || 'http://127.0.0.1:3271/v1';
async function req(path, body, headers = {}) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer dummy', ...headers }, body: JSON.stringify(body) });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${path} returned non-json ${r.status}: ${text.slice(0, 500)}`); }
  if (!r.ok) throw new Error(`${path} HTTP ${r.status}: ${JSON.stringify(json).slice(0, 1000)}`);
  return json;
}

async function main() {
  const results = [];
  const models = await fetch(base + '/models').then((r) => r.json());
  assert.ok(models.data.some((m) => m.id === 'cfbt-kimi'));
  results.push('models_ok');

  const plain = await req('/chat/completions', { model: 'cfbt-kimi', messages: [{ role: 'user', content: 'Reply exactly ENDPOINT_OK' }], max_tokens: 512, temperature: 0 });
  assert.match(plain.choices[0].message.content || '', /ENDPOINT_OK/);
  results.push('chat_ok');

  const path = '/tmp/cfbt_endpoint_complex.txt';
  fs.rmSync(path, { force: true });
  const tools = [{ type: 'function', function: { name: 'bash', description: 'Run shell command', parameters: { type: 'object', properties: { command: { type: 'string' }, description: { type: 'string' } }, required: ['command', 'description'] } } }];
  const messages = [{ role: 'user', content: `Create file ${path} containing exactly CFBT_COMPLEX_ENDPOINT, then say DONE.` }];
  const first = await req('/chat/completions', { model: 'cfbt-kimi', messages, tools, tool_choice: 'auto', max_tokens: 512 });
  const call = first.choices?.[0]?.message?.tool_calls?.[0];
  assert.equal(first.choices[0].finish_reason, 'tool_calls');
  assert.ok(call?.function?.arguments);
  const args = JSON.parse(call.function.arguments);
  assert.match(args.command, /CFBT_COMPLEX_ENDPOINT/);
  // Execute the tool exactly like an agent host would.
  await import('node:child_process').then(({ execFileSync }) => execFileSync('/bin/bash', ['-lc', args.command], { stdio: 'pipe' }));
  assert.equal(fs.readFileSync(path, 'utf8'), 'CFBT_COMPLEX_ENDPOINT');
  messages.push(first.choices[0].message);
  messages.push({ role: 'tool', tool_call_id: call.id, content: 'exit=0' });
  const second = await req('/chat/completions', { model: 'cfbt-kimi', messages, tools, max_tokens: 512 });
  assert.match(second.choices[0].message.content || '', /DONE|Done/i);
  results.push('openai_tool_loop_ok');

  const anthropic = await req('/messages', { model: 'cfbt-kimi', max_tokens: 512, messages: [{ role: 'user', content: 'Reply exactly ANTHROPIC_OK' }] });
  assert.equal(anthropic.type, 'message');
  assert.match(anthropic.content?.[0]?.text || '', /ANTHROPIC_OK/);
  results.push('anthropic_ok');

  const responses = await req('/responses', { model: 'cfbt-kimi', input: 'Reply exactly RESPONSES_OK', max_output_tokens: 512 });
  assert.match(responses.output_text || '', /RESPONSES_OK/);
  results.push('responses_ok');

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
