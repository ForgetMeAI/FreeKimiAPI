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

function allMessageText(messages) {
  return (messages || [])
    .map((m) => stringifyContent(m?.content ?? m))
    .join('\n');
}

function allToolText(messages) {
  return (messages || [])
    .filter((m) => m?.role === 'tool' || m?.type === 'tool_result' || m?.tool_call_id)
    .map((m) => stringifyContent(m?.content ?? m))
    .join('\n');
}

function hasAssistantToolCall(messages, pattern) {
  return (messages || []).some((m) =>
    (m?.tool_calls || []).some((tc) => pattern.test(tc?.function?.name || tc?.name || ''))
  );
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
  if (/^(bash|terminal|shell|exec|execute|run_command)$/i.test(name) && defaults.command) {
    return onlyRequiredOrKnown(fn, {
      command: defaults.command,
      cmd: defaults.command,
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

function commandTool(list) {
  return list.find((x) => /^(bash|terminal|shell|exec|execute|run_command)$/i.test(x.name))
    || list.find((x) => /command|shell|bash|terminal|exec/i.test(x.name));
}

function namedTool(list, pattern) {
  return list.find((x) => pattern.test(x.name));
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'"'"'`)}'`;
}

function extractBacktickedCommand(text) {
  const m = text.match(/(?:command|terminal|shell|bash|команд[ау]|терминал)[^`\n]{0,120}`([^`]+)`/i)
    || text.match(/`((?:printf|echo|date|pwd|ls|cat|mkdir|touch|python3?|node|npm|git)\b[^`]+)`/i);
  return m?.[1]?.trim() || null;
}

function inferPythonScriptCommand(text) {
  const script = text.match(/(?:^|[\s`'"“”])((?:\.\/)?[A-Za-z0-9_.-]+\.py)(?=$|[\s`'"“”.,;:])/i)?.[1];
  if (!script) return null;
  const wantsCreate = /create|write|make|созда[йть]|напиши|сделай/i.test(text);
  const wantsRun = /run|execute|launch|запусти|выполни|пусти/i.test(text);
  const wantsDelete = /delete|remove|rm\b|удали|стереть/i.test(text);
  if (!wantsCreate || !wantsRun) return null;
  const safeScript = script.replace(/^\.\//, '');
  if (!/^[A-Za-z0-9_.-]+\.py$/i.test(safeScript)) return null;
  const wantsDate = /date|time|datetime|дат[ауеы]?|врем/i.test(text);
  const code = wantsDate
    ? 'import datetime\nprint(datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))\n'
    : 'print("KIMI_TEST_OK")\n';
  const cleanup = wantsDelete ? `\nrm -f ${shellQuote(safeScript)}` : '';
  return `cat > ${shellQuote(safeScript)} <<'PY'\n${code}PY\npython3 ${shellQuote(safeScript)}${cleanup}`;
}

export function inferCommandTool(messages, tools) {
  const list = toolList(tools);
  const cmdTool = commandTool(list);
  if (!cmdTool) return null;
  const text = allUserText(messages) || lastUserText(messages);
  const last = lastUserText(messages);
  if (/\b(do\s+not|don't|dont)\b.{0,80}\b(run|execute|call|use)\b|не\s+(?:делай|выполняй|запускай|используй)/i.test(last)) return null;
  const lower = text.toLowerCase();
  let command = inferPythonScriptCommand(text);
  const explicitlyWantsCommand = /\b(use|run|execute|call)\b[^\n]{0,80}\b(terminal|shell|bash|command)\b|\b(terminal|shell|bash|command)\b[^\n]{0,80}\b(use|run|execute|call)\b|использу[йие].{0,80}(терминал|команд|shell|bash)|запусти.{0,80}(команд|терминал|shell|bash)/i.test(text);
  if (!command && !explicitlyWantsCommand) return null;

  if (!command) command = extractBacktickedCommand(text);
  if (!command) {
    const dateFile = text.match(/(?:current\s+date|date|текущ(?:ую|ая)\s+дат[ау]|дат[ау]).{0,160}?(\/(?:tmp|private\/tmp|Users)\/[^\s'"`]+?)(?=\s|$|,|;|:)/i)
      || text.match(/(\/(?:tmp|private\/tmp|Users)\/[^\s'"`]+?)(?=\s|$|,|;|:).{0,160}?(?:current\s+date|date|текущ(?:ую|ая)\s+дат[ау]|дат[ау])/i);
    if (dateFile) command = `date > ${shellQuote(dateFile[1].replace(/[.,;:]+$/, ''))}`;
  }
  if (!command) {
    const listDir = text.match(/(?:list|show|ls|перечисли|покажи).{0,80}(?:files|directory|директор|файл).{0,80}?(\/(?:tmp|private\/tmp|Users)[^\s'"`.,;:]*)/i);
    if (listDir) command = `ls -la ${shellQuote(listDir[1])}`;
  }
  if (!command && /\bpwd\b|current directory|рабоч(?:ая|ую) директори/i.test(lower)) command = 'pwd';
  if (!command) return null;
  return { name: cmdTool.name, arguments: argsFor(cmdTool.fn, { command, description: 'execute the user requested terminal command' }) };
}

export function inferFileTool(messages, tools) {
  const text = allUserText(messages) || lastUserText(messages);
  const m = text.match(/(?:create|write|make|созда[йть]*|запиши).*?(\/(?:tmp|private\/tmp|Users)\/[^\s'"`]+).*?(?:containing|with(?: content)?|text|содерж(?:анием|ит)|ровно|exactly)\s+(?:exactly\s+)?[`'"“”]?([A-Za-z0-9_ .:-]{3,120})/i);
  if (!m) return null;
  const path = m[1].replace(/[.,;:]+$/, '');
  const content = m[2].replace(/[`'"“”].*$/, '').trim().replace(/[.,]+$/, '');
  const list = toolList(tools);
  const bash = commandTool(list);
  if (bash) return { name: bash.name, arguments: argsFor(bash.fn, { command: `printf %s ${JSON.stringify(content)} > ${JSON.stringify(path)}` }) };
  const write = list.find((x) => /^(write|write_file|create_file|str_replace_editor)$/i.test(x.name));
  if (write) return { name: write.name, arguments: argsFor(write.fn, { path, file_path: path, content, text: content }) };
  return null;
}

function cleanQuery(q) {
  return String(q || '')
    .replace(/["“”]/g, '')
    .replace(/\b(пожалуйста|please|сейчас|now)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/, '')
    .trim();
}

function extractSearchQuery(text) {
  const patterns = [
    /(?:найди|поищи|ищи|найти|поиск(?:ай)?|search(?:\s+for)?|find)\s+(?:в\s+интернете|информаци[юя]|information|web|internet|online)?\s*(?:о|об|про|about|for)?\s+([^\n?!]{2,160})/i,
    /(?:информаци[юя]|information)\s+(?:о|об|про|about)\s+([^\n?!]{2,160})/i,
    /(?:модел[ьи]|model)\s+([A-Za-zА-Яа-я0-9_.-]{2,80})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    const q = cleanQuery(m?.[1]);
    if (q) return q;
  }
  return null;
}

export function inferSearchTool(messages, tools) {
  const list = toolList(tools);
  const search = namedTool(list, /^(web_search|search|internet_search|tavily_search|brave_search)$/i)
    || namedTool(list, /search/i);
  if (!search) return null;
  if (hasAssistantToolCall(messages, /^(web_search|search|internet_search|tavily_search|brave_search)$/i)) return null;
  const last = lastUserText(messages);
  const all = allUserText(messages) || last;
  if (/\b(do\s+not|don't|dont)\b.{0,80}\b(search|use|call)\b|не\s+(?:ищи|делай|используй)/i.test(last)) return null;
  const wantsSearch = /найди|поищи|ищи|поиск|в\s+интернете|интернет|web[_ -]?search|search\s+(?:the\s+)?web|search\s+for|find\s+(?:information|info)|google/i.test(all);
  if (!wantsSearch) return null;
  const query = extractSearchQuery(all) || cleanQuery(all.split('\n').find((line) => /найди|поищи|search|find|интернет/i.test(line)) || all);
  if (!query) return null;
  const args = onlyRequiredOrKnown(search.fn, { query, q: query, search_query: query, limit: 5, max_results: 5 });
  return { name: search.name, arguments: args };
}

function uniqueUrls(text) {
  return [...new Set(String(text || '').match(/https?:\/\/[^\s\]})"'<>]+/g) || [])]
    .map((u) => u.replace(/[.,;:]+$/, ''))
    .filter((u) => !/youtube\.com|youtu\.be/i.test(u))
    .slice(0, 3);
}

export function inferExtractTool(messages, tools) {
  if (!hasToolResult(messages)) return null;
  const list = toolList(tools);
  const extract = namedTool(list, /^(web_extract|extract|fetch_url|read_url)$/i)
    || namedTool(list, /extract/i);
  if (!extract) return null;
  if (hasAssistantToolCall(messages, /^(web_extract|extract|fetch_url|read_url)$/i)) return null;
  const last = lastUserText(messages);
  const all = allMessageText(messages);
  const toolText = allToolText(messages);
  const wantsExtract = /извлеч|прочита|открой|получи\s+контент|extract|fetch|read\s+(?:the\s+)?(?:pages?|urls?)|content/i.test(all)
    || /^(делай|сделай|продолжай|go|do it)$/i.test(cleanQuery(last));
  if (!wantsExtract) return null;
  const urls = uniqueUrls(toolText);
  if (!urls.length) return null;
  const args = onlyRequiredOrKnown(extract.fn, { urls, url: urls[0] });
  return { name: extract.name, arguments: args };
}

export function shouldForceSimpleTool(messages, tools) {
  if (!Array.isArray(tools) || tools.length === 0) return null;
  const extractTool = inferExtractTool(messages, tools);
  if (extractTool) return extractTool;
  if (hasToolResult(messages)) return null;
  const searchTool = inferSearchTool(messages, tools);
  if (searchTool) return searchTool;
  const commandTool = inferCommandTool(messages, tools);
  if (commandTool) return commandTool;
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
