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
  console.log('ok');
} finally {
  child.kill('SIGTERM');
}
