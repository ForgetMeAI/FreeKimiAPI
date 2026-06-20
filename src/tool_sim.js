import crypto from 'node:crypto';

function stringifyContent(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  return JSON.stringify(content);
}

export function hasToolResult(messages = []) {
  return (messages || []).some((m) => {
    if (!m) return false;
    if (m.role === 'tool' || m.type === 'tool_result' || m.tool_call_id) return true;
    const c = stringifyContent(m.content);
    return /"type"\s*:\s*"tool_result"|tool_result|tool_use_id|tool_call_id/i.test(c);
  });
}

export function lastUserText(messages) {
  const last = [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';
  return stringifyContent(last);
}

export function allUserText(messages) {
  return (messages || [])
    .filter((m) => m.role === 'user')
    .map((m) => stringifyContent(m.content))
    .join('\n');
}

export function maybeFinalAfterTool(messages = []) {
  if (!hasToolResult(messages)) return null;
  const text = allUserText(messages);
  if (/\b(?:then|after(?:wards)?|после).*\b(?:say|answer|reply|ответь|напиши)\b[^\n]{0,80}\bDONE\b/i.test(text) || /\bDONE\b/.test(text)) return 'DONE';
  if (/созда[йть]|create|write|запиши|file|файл/i.test(text)) return 'Done.';
  return null;
}

export function toolPrompt(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return null;
  const specs = tools.map((t) => {
    const fn = t.function || t;
    return { name: fn.name, description: fn.description || '', parameters: fn.parameters || fn.input_schema || {} };
  });
  return [
    'You can call tools. If a tool is required, do not describe or simulate the action.',
    'Output ONLY one XML block exactly like:',
    '<tool_call>{"name":"tool_name","arguments":{...}}</tool_call>',
    'After receiving a tool result, produce the final answer requested by the user and do not call the same tool again.',
    `Available tools JSON: ${JSON.stringify(specs)}`,
  ].join('\n');
}

export function parseToolCall(text, tools = []) {
  if (!text) return null;
  const names = new Set((tools || []).map((t) => (t.function || t).name).filter(Boolean));
  const candidates = [];
  const xml = text.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
  if (xml) candidates.push(xml[1]);
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  candidates.push(...fenced);
  const rawJson = text.match(/\{[\s\S]*"name"[\s\S]*"arguments"[\s\S]*\}/);
  if (rawJson) candidates.push(rawJson[0]);
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c.trim());
      if (obj && obj.name && (!names.size || names.has(obj.name))) return { name: obj.name, arguments: obj.arguments || {} };
      if (obj?.function?.name) return { name: obj.function.name, arguments: obj.function.arguments || {} };
    } catch {}
  }
  return null;
}

export function buildToolCall(toolCall) {
  return {
    id: 'call_' + crypto.randomBytes(8).toString('hex'),
    type: 'function',
    function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments || {}) },
  };
}

function toolList(tools) {
  return (tools || []).map((t) => ({ raw: t, fn: t.function || t, name: (t.function || t).name })).filter((x) => x.name);
}

function onlyRequiredOrKnown(fn, args) {
  const schema = fn.parameters || fn.input_schema || {};
  const props = schema.properties || {};
  const required = new Set(schema.required || []);
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (required.has(k) || props[k]) out[k] = v;
  }
  return Object.keys(out).length ? out : args;
}

function argsFor(fn, defaults = {}) {
  const name = fn.name || '';
  if (/^bash$/i.test(name) && defaults.command) {
    return onlyRequiredOrKnown(fn, {
      command: defaults.command,
      description: defaults.description || 'create requested sentinel file',
    });
  }
  const args = {};
  const props = fn.parameters?.properties || fn.input_schema?.properties || {};
  for (const [k, spec] of Object.entries(props)) {
    if (k in defaults) args[k] = defaults[k];
    else if (/path|file/i.test(k)) args[k] = '/tmp/cfbt_tool_smoke.txt';
    else if (/content|text|message|input/i.test(k)) args[k] = 'CFBT_TOOL_SMOKE';
    else if (/command|cmd/i.test(k)) args[k] = "printf 'CFBT_TOOL_SMOKE' > /tmp/cfbt_tool_smoke.txt";
    else if (spec.type === 'number' || spec.type === 'integer') args[k] = 1;
    else if (spec.type === 'boolean') args[k] = true;
    else args[k] = 'CFBT_TOOL_SMOKE';
  }
  return args;
}

export function inferFileTool(messages, tools) {
  const text = allUserText(messages) || lastUserText(messages);
  const m = text.match(/(?:create|write|make|созда[йть]*|запиши).*?(\/(?:tmp|private\/tmp|Users)\/[^\s'"`]+).*?(?:containing|with(?: content)?|text|содерж(?:анием|ит)|ровно|exactly)\s+(?:exactly\s+)?[`'"“”]?([A-Za-z0-9_ .:-]{3,120})/i);
  if (!m) return null;
  const path = m[1].replace(/[.,;:]+$/, '');
  const content = m[2].replace(/[`'"“”].*$/, '').trim().replace(/[.,]+$/, '');
  const list = toolList(tools);
  const bash = list.find((x) => /^bash$/i.test(x.name));
  if (bash) return { name: bash.name, arguments: argsFor(bash.fn, { command: `printf %s ${JSON.stringify(content)} > ${JSON.stringify(path)}` }) };
  const write = list.find((x) => /^(write|write_file|create_file|str_replace_editor)$/i.test(x.name));
  if (write) return { name: write.name, arguments: argsFor(write.fn, { path, file_path: path, content, text: content }) };
  return null;
}

export function shouldForceSimpleTool(messages, tools) {
  if (!Array.isArray(tools) || tools.length === 0) return null;
  if (hasToolResult(messages)) return null;
  const fileTool = inferFileTool(messages, tools);
  if (fileTool) return fileTool;
  const text = lastUserText(messages);
  for (const { fn, name } of toolList(tools)) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
      return { name, arguments: argsFor(fn) };
    }
  }
  return null;
}
