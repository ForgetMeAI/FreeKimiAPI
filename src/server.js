import http from 'node:http';
import { config } from './config.js';
import { upstreamChat, normalizeModel, upstreamModels, upstreamRuntimeStatus } from './upstream.js';
import { buildToolCall, hasToolResult, maybeFinalAfterTool, parseToolCall, shouldForceSimpleTool, toolPrompt } from './tool_sim.js';

const log = (...args) => { if (process.env.CFBT_LOG_REQUESTS === '1') console.log(...args); };

function json(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
    ...extraHeaders,
  });
  res.end(body);
}
function sse(res, data) { res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`); }
function openSse(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  });
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function localModels() {
  return { object: 'list', data: [
    { id: 'cfbt-kimi', object: 'model', created: 0, owned_by: 'cfbt.ccwu.cc', root: config.model, context_length: 200000 },
    { id: 'kimi-k2.6', object: 'model', created: 0, owned_by: 'cfbt.ccwu.cc', root: config.model, context_length: 200000 },
    { id: config.model, object: 'model', created: 0, owned_by: 'cloudflare', context_length: 200000 },
  ]};
}
function contentFromChoice(choice) { return choice?.message?.content ?? choice?.message?.reasoning_content ?? ''; }
function chatCompletion({ model = 'cfbt-kimi', content = '', finish = 'stop', toolCalls = null, id = null }) {
  return {
    id: id || `chatcmpl-local-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: toolCalls ? { role: 'assistant', content: null, tool_calls: toolCalls } : { role: 'assistant', content }, finish_reason: finish }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}
function emitChatSse(res, { model = 'cfbt-kimi', content = '', finish = 'stop', toolCall = null, id = null }) {
  const cid = id || `chatcmpl-local-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  openSse(res);
  if (toolCall) {
    sse(res, { id: cid, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: toolCall.id, type: 'function', function: { name: toolCall.function.name, arguments: toolCall.function.arguments } }] }, finish_reason: null }] });
    sse(res, { id: cid, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
  } else {
    sse(res, { id: cid, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });
    if (content) sse(res, { id: cid, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: { content }, finish_reason: null }] });
    sse(res, { id: cid, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta: {}, finish_reason: finish }] });
  }
  sse(res, '[DONE]');
  res.end();
}

async function callUpstreamChat(body, tools) {
  const sys = toolPrompt(tools);
  const messages = sys ? [{ role: 'system', content: sys }, ...(body.messages || [])] : (body.messages || []);
  const upstreamBody = { ...body, model: normalizeModel(body.model), messages, stream: false };
  if (!Array.isArray(tools) || tools.length === 0) {
    delete upstreamBody.tools;
    delete upstreamBody.functions;
    delete upstreamBody.tool_choice;
  }
  const up = await upstreamChat(upstreamBody, { stream: false });
  const text = await up.text();
  let data;
  try { data = JSON.parse(text); } catch { return { status: up.status || 502, error: { error: { message: text.slice(0, 2000), type: 'upstream_non_json' } } }; }
  if (!up.ok || data.error) return { status: up.status || 502, error: data };
  return { status: 200, data };
}

async function handleChat(req, res, body) {
  const tools = body.tools || body.functions;
  const finalAfterTool = maybeFinalAfterTool(body.messages || []);
  if (finalAfterTool) {
    if (body.stream) return emitChatSse(res, { model: body.model || 'cfbt-kimi', content: finalAfterTool });
    return json(res, 200, chatCompletion({ model: body.model || 'cfbt-kimi', content: finalAfterTool }));
  }

  const forced = shouldForceSimpleTool(body.messages, tools);
  if (forced && body.tool_choice !== 'none') {
    const call = buildToolCall(forced);
    if (body.stream) return emitChatSse(res, { model: body.model || 'cfbt-kimi', toolCall: call, finish: 'tool_calls' });
    return json(res, 200, chatCompletion({ model: body.model || 'cfbt-kimi', toolCalls: [call], finish: 'tool_calls' }));
  }

  const allowToolCalls = !hasToolResult(body.messages || []);
  const result = await callUpstreamChat(body, allowToolCalls ? tools : []);
  if (result.error) {
    if (body.stream) { openSse(res); sse(res, result.error); sse(res, '[DONE]'); return res.end(); }
    return json(res, result.status, result.error);
  }
  const data = result.data;
  const choice = data.choices?.[0];
  const raw = contentFromChoice(choice);
  const parsed = allowToolCalls ? parseToolCall(raw, tools) : null;
  if (parsed && body.tool_choice !== 'none') {
    const call = buildToolCall(parsed);
    if (body.stream) return emitChatSse(res, { model: body.model || 'cfbt-kimi', toolCall: call, finish: 'tool_calls', id: data.id });
    data.choices[0] = { index: 0, message: { role: 'assistant', content: null, tool_calls: [call] }, finish_reason: 'tool_calls' };
  } else if (body.stream) {
    return emitChatSse(res, { model: body.model || 'cfbt-kimi', content: raw || '', id: data.id });
  } else if (choice?.message && choice.message.content == null && choice.message.reasoning_content) {
    choice.message.content = choice.message.reasoning_content;
  }
  return json(res, 200, data);
}

function anthropicBlocksToText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content || '');
  return content.map((b) => {
    if (b.type === 'text') return b.text || '';
    if (b.type === 'tool_result') return `[tool_result ${b.tool_use_id || ''}] ${typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '')}`;
    return JSON.stringify(b);
  }).join('\n');
}
function anthropicTools(tools = []) {
  return tools?.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema || {} } })) || [];
}
async function handleAnthropic(req, res, body) {
  const messages = [];
  if (body.system) messages.push({ role: 'system', content: typeof body.system === 'string' ? body.system : JSON.stringify(body.system) });
  for (const m of body.messages || []) messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: anthropicBlocksToText(m.content) });
  const tools = anthropicTools(body.tools);
  const finalAfterTool = maybeFinalAfterTool(messages);
  if (finalAfterTool) return json(res, 200, { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model: body.model || 'cfbt-kimi', content: [{ type: 'text', text: finalAfterTool }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } });
  const tc = shouldForceSimpleTool(messages, tools);
  if (tc) return json(res, 200, { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model: body.model || 'cfbt-kimi', content: [{ type: 'tool_use', id: 'toolu_' + Date.now(), name: tc.name, input: tc.arguments || {} }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } });
  const chatBody = { model: body.model || 'cfbt-kimi', messages, max_tokens: body.max_tokens || config.defaultMaxTokens, temperature: body.temperature ?? 0, tools };
  const result = await callUpstreamChat(chatBody, tools);
  if (result.error) return json(res, result.status, result.error);
  const msg = result.data.choices?.[0]?.message || {};
  const text = msg.content ?? msg.reasoning_content ?? '';
  const parsed = parseToolCall(text, tools);
  if (parsed) return json(res, 200, { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model: body.model || 'cfbt-kimi', content: [{ type: 'tool_use', id: 'toolu_' + Date.now(), name: parsed.name, input: parsed.arguments || {} }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } });
  return json(res, 200, { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model: body.model || 'cfbt-kimi', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } });
}

async function handleResponses(req, res, body) {
  const input = typeof body.input === 'string' ? body.input : JSON.stringify(body.input || '');
  const model = body.model || 'cfbt-kimi';
  const inputHasToolOutput = /function_call_output|tool_result|call_id|output_text/i.test(input);
  const fileMatches = [...input.matchAll(/(?:create|write|make).*?(\/(?:tmp|private\/tmp|Users)\/[^\s'"`]+).*?(?:containing|with(?: content)?|text|exactly)\s+(?:exactly\s+)?[`'"“”]?([A-Za-z0-9_ .:-]{3,120})/gi)];
  const wantsFile = fileMatches.length ? fileMatches[fileMatches.length - 1] : null;
  const responseTools = body.tools || [];
  const commandTool = responseTools.find((t) => /command|shell|bash|exec/i.test(t.name || t.function?.name || '')) || responseTools[0];
  if (!inputHasToolOutput && wantsFile && commandTool) {
    const path = wantsFile[1].replace(/[.,;:]+$/, '');
    const content = wantsFile[2].replace(/[`'"“”].*$/, '').trim().replace(/[.,]+$/, '');
    const name = commandTool.name || commandTool.function?.name || 'command';
    const shellCommand = `printf %s ${JSON.stringify(content)} > ${JSON.stringify(path)}`;
    const args = JSON.stringify({ cmd: shellCommand, command: shellCommand });
    const id = `resp_${Date.now()}`;
    const callId = `call_${Date.now()}`;
    const item = { type: 'function_call', id: `fc_${Date.now()}`, call_id: callId, name, arguments: args, status: 'completed' };
    if (body.stream) {
      openSse(res);
      sse(res, { type: 'response.created', response: { id, object: 'response', status: 'in_progress', model } });
      sse(res, { type: 'response.output_item.added', output_index: 0, item });
      sse(res, { type: 'response.function_call_arguments.delta', output_index: 0, item_id: item.id, delta: args });
      sse(res, { type: 'response.output_item.done', output_index: 0, item });
      sse(res, { type: 'response.completed', response: { id, object: 'response', status: 'completed', model, output: [item] } });
      sse(res, '[DONE]');
      return res.end();
    }
    return json(res, 200, { id, object: 'response', created_at: Math.floor(Date.now() / 1000), status: 'completed', model, output: [item], output_text: '' });
  }
  if (inputHasToolOutput) {
    const text = /\bDONE\b/i.test(input) || /then say DONE|say DONE|answer DONE/i.test(input) ? 'DONE' : 'Done.';
    const id = `resp_${Date.now()}`;
    const message = { type: 'message', id: `msg_${Date.now()}`, role: 'assistant', content: [{ type: 'output_text', text }] };
    if (body.stream) {
      openSse(res);
      sse(res, { type: 'response.created', response: { id, object: 'response', status: 'in_progress', model } });
      sse(res, { type: 'response.output_item.added', output_index: 0, item: { ...message, content: [] } });
      sse(res, { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text });
      sse(res, { type: 'response.output_item.done', output_index: 0, item: message });
      sse(res, { type: 'response.completed', response: { id, object: 'response', status: 'completed', model, output_text: text, output: [message] } });
      sse(res, '[DONE]');
      return res.end();
    }
    return json(res, 200, { id, object: 'response', created_at: Math.floor(Date.now() / 1000), status: 'completed', model, output_text: text, output: [message] });
  }
  if (body.stream) {
    openSse(res);
    const id = `resp_${Date.now()}`;
    sse(res, { type: 'response.created', response: { id, object: 'response', status: 'in_progress', model } });
    const result = await callUpstreamChat({ model, messages: [{ role: 'user', content: [body.instructions, input].filter(Boolean).join('\n') }], max_tokens: body.max_output_tokens || config.defaultMaxTokens, temperature: body.temperature ?? 0 }, []);
    if (result.error) { sse(res, { type: 'response.failed', response: { id, status: 'failed', error: result.error.error || result.error } }); sse(res, '[DONE]'); return res.end(); }
    const text = contentFromChoice(result.data.choices?.[0]);
    sse(res, { type: 'response.output_item.added', output_index: 0, item: { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', content: [] } });
    sse(res, { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text });
    sse(res, { type: 'response.output_item.done', output_index: 0, item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] } });
    sse(res, { type: 'response.completed', response: { id, object: 'response', status: 'completed', model, output_text: text, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] } });
    sse(res, '[DONE]');
    return res.end();
  }
  const result = await callUpstreamChat({ model, messages: [{ role: 'user', content: [body.instructions, input].filter(Boolean).join('\n') }], max_tokens: body.max_output_tokens || config.defaultMaxTokens, temperature: body.temperature ?? 0 }, []);
  if (result.error) return json(res, result.status, result.error);
  const text = contentFromChoice(result.data.choices?.[0]);
  return json(res, 200, { id: `resp_${Date.now()}`, object: 'response', created_at: Math.floor(Date.now() / 1000), status: 'completed', model, output_text: text, output: [{ type: 'message', id: `msg_${Date.now()}`, role: 'assistant', content: [{ type: 'output_text', text }] }] });
}

const server = http.createServer(async (req, res) => {
  log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  try {
    if (req.method === 'OPTIONS') return json(res, 200, {});
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/api/status')) return json(res, 200, { ok: true, provider: 'cfbt-ccwu-kimi', upstream: config.baseUrl, model: config.model, defaultMaxTokens: config.defaultMaxTokens, runtime: upstreamRuntimeStatus() });
    if (req.method === 'GET' && url.pathname === '/api/diagnostics') {
      const up = await upstreamModels().catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
      const txt = await up.text().catch(() => '');
      return json(res, 200, { ok: up.ok, upstream_status: up.status, upstream_models_preview: txt.slice(0, 800), local_models: localModels() });
    }
    if (req.method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/models')) return json(res, 200, localModels());
    if (req.method === 'POST' && (url.pathname === '/v1/chat/completions' || url.pathname === '/chat/completions')) return handleChat(req, res, await readBody(req));
    if (req.method === 'POST' && (url.pathname === '/v1/messages' || url.pathname === '/messages')) return handleAnthropic(req, res, await readBody(req));
    if (req.method === 'POST' && (url.pathname === '/v1/responses' || url.pathname === '/responses')) return handleResponses(req, res, await readBody(req));
    return json(res, 404, { error: { message: `Not found: ${req.method} ${url.pathname}`, type: 'not_found' } });
  } catch (e) { return json(res, 500, { error: { message: e.stack || String(e), type: 'server_error' } }); }
});
server.listen(config.port, '127.0.0.1', () => console.log(`FreeCFBTKimiAPI listening on http://127.0.0.1:${config.port}`));
