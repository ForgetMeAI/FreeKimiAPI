#!/usr/bin/env node
const base = process.env.BASE_URL || 'http://127.0.0.1:3271/v1';
async function jfetch(path, body) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer dummy' }, body: JSON.stringify(body) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error(`non-json ${r.status}: ${t}`); }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(j)}`);
  return j;
}
const messages = [{ role: 'user', content: 'Use tool write_file to create a sentinel file, then after tool result say DONE.' }];
const tools = [{ type: 'function', function: { name: 'write_file', description: 'Write a file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } }];
const first = await jfetch('/chat/completions', { model: 'cfbt-kimi', messages, tools, max_tokens: 512 });
const call = first.choices?.[0]?.message?.tool_calls?.[0];
if (!call) throw new Error('no tool call: ' + JSON.stringify(first));
const args = JSON.parse(call.function.arguments);
console.log('TOOL_CALL', call.function.name, args);
if (call.function.name !== 'write_file') throw new Error('wrong tool name');
const fs = await import('node:fs');
fs.writeFileSync(args.path, args.content);
messages.push(first.choices[0].message);
messages.push({ role: 'tool', tool_call_id: call.id, content: `wrote ${args.path}` });
const second = await jfetch('/chat/completions', { model: 'cfbt-kimi', messages, max_tokens: 512 });
console.log('FINAL', second.choices?.[0]?.message?.content?.slice(0, 300));
if (!fs.existsSync(args.path)) throw new Error('sentinel missing');
console.log('OK agent wire loop');
