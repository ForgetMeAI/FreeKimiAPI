import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 3279;
const child = spawn(process.execPath, ['src/server.js'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await sleep(1200);
  const base = `http://127.0.0.1:${port}/v1`;

  let r = await fetch(base + '/models');
  assert.equal(r.status, 200);
  const models = await r.json();
  assert.ok(models.data.some((m) => m.id === 'cfbt-kimi'));

  r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'cfbt-kimi',
      messages: [{ role: 'user', content: '2+2=? Answer only 4.' }],
      max_tokens: 512,
      temperature: 0,
    }),
  });
  assert.equal(r.status, 200);
  const chat = await r.json();
  assert.match(chat.choices[0].message.content || '', /4/);

  r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'cfbt-kimi',
      messages: [{ role: 'user', content: 'Use tool write_file.' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'write_file',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
        },
      ],
    }),
  });
  const tool = await r.json();
  assert.equal(tool.choices[0].finish_reason, 'tool_calls');

  r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'cfbt-kimi',
      messages: [{ role: 'user', content: 'Use a terminal command to write the current date into /tmp/cfbt_terminal_date.txt, then answer DONE.' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'terminal',
            parameters: {
              type: 'object',
              properties: {
                command: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['command'],
            },
          },
        },
      ],
      tool_choice: 'auto',
    }),
  });
  const terminalTool = await r.json();
  assert.equal(terminalTool.choices[0].finish_reason, 'tool_calls');
  const terminalCall = terminalTool.choices[0].message.tool_calls[0];
  assert.equal(terminalCall.function.name, 'terminal');
  const terminalArgs = JSON.parse(terminalCall.function.arguments);
  assert.match(terminalArgs.command, /^date > /);
  assert.match(terminalArgs.command, /cfbt_terminal_date\.txt/);

  r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'cfbt-kimi',
      messages: [
        { role: 'user', content: 'Создай скрипт kimi-test.py, который выводит дату и время, запусти его и удали.' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'terminal',
            parameters: {
              type: 'object',
              properties: {
                command: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['command'],
            },
          },
        },
      ],
      tool_choice: 'auto',
    }),
  });
  const scriptTool = await r.json();
  assert.equal(scriptTool.choices[0].finish_reason, 'tool_calls');
  const scriptArgs = JSON.parse(scriptTool.choices[0].message.tool_calls[0].function.arguments);
  assert.match(scriptArgs.command, /cat > 'kimi-test\.py'/);
  assert.match(scriptArgs.command, /python3 'kimi-test\.py'/);
  assert.match(scriptArgs.command, /rm -f 'kimi-test\.py'/);

  const webSearchTool = {
    type: 'function',
    function: {
      name: 'web_search',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer' },
        },
        required: ['query'],
      },
    },
  };
  r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'cfbt-kimi',
      messages: [
        { role: 'user', content: 'найди в интернете информацию о модели glm-5.2' },
        { role: 'assistant', content: 'I should use web_search.' },
        { role: 'user', content: 'делай' },
      ],
      tools: [webSearchTool, {
        type: 'function',
        function: {
          name: 'web_extract',
          parameters: { type: 'object', properties: { urls: { type: 'array', items: { type: 'string' } } }, required: ['urls'] },
        },
      }],
      tool_choice: 'auto',
    }),
  });
  const searchTool = await r.json();
  assert.equal(searchTool.choices[0].finish_reason, 'tool_calls');
  const searchCall = searchTool.choices[0].message.tool_calls[0];
  assert.equal(searchCall.function.name, 'web_search');
  const searchArgs = JSON.parse(searchCall.function.arguments);
  assert.match(searchArgs.query, /glm-5\.2/i);

  r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'cfbt-kimi',
      messages: [
        { role: 'user', content: 'найди в интернете информацию о модели glm-5.2' },
        { role: 'assistant', content: null, tool_calls: [searchCall] },
        { role: 'tool', tool_call_id: searchCall.id, content: JSON.stringify({ data: { web: [{ url: 'https://docs.z.ai/guides/llm/glm-4.5', title: 'Z.ai docs' }, { url: 'https://wavespeed.ai/models/z-ai-glm-4.5v', title: 'WaveSpeedAI' }] } }) },
        { role: 'assistant', content: 'Надо извлечь контент из найденных источников.' },
        { role: 'user', content: 'делай' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'web_extract',
            parameters: {
              type: 'object',
              properties: { urls: { type: 'array', items: { type: 'string' } } },
              required: ['urls'],
            },
          },
        },
      ],
      tool_choice: 'auto',
    }),
  });
  const extractTool = await r.json();
  assert.equal(extractTool.choices[0].finish_reason, 'tool_calls');
  const extractCall = extractTool.choices[0].message.tool_calls[0];
  assert.equal(extractCall.function.name, 'web_extract');
  const extractArgs = JSON.parse(extractCall.function.arguments);
  assert.deepEqual(extractArgs.urls, ['https://docs.z.ai/guides/llm/glm-4.5', 'https://wavespeed.ai/models/z-ai-glm-4.5v']);

  r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'cfbt-kimi',
      messages: [
        { role: 'user', content: 'найди в интернете информацию о модели glm-5.2' },
        { role: 'assistant', content: null, tool_calls: [searchCall] },
        { role: 'tool', tool_call_id: searchCall.id, content: JSON.stringify({ data: { web: [{ url: 'https://docs.z.ai/guides/llm/glm-4.5', title: 'Z.ai docs' }] } }) },
        { role: 'assistant', content: null, tool_calls: [extractCall] },
        { role: 'tool', tool_call_id: extractCall.id, content: 'Extracted page content about GLM.' },
        { role: 'user', content: 'делай' },
      ],
      tools: [webSearchTool, {
        type: 'function',
        function: {
          name: 'web_extract',
          parameters: { type: 'object', properties: { urls: { type: 'array', items: { type: 'string' } } }, required: ['urls'] },
        },
      }],
      tool_choice: 'auto',
      max_tokens: 64,
    }),
  });
  const afterExtract = await r.json();
  assert.notEqual(afterExtract.choices[0].finish_reason, 'tool_calls');
  console.log('ok');
} finally {
  child.kill('SIGTERM');
}
