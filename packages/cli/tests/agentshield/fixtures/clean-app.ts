// Clean fixture — should produce zero findings.
// Same shapes as vulnerable-app.ts but with proper mitigations.

import { spawn } from 'node:child_process';

// PI-001 mitigation: user input is a separate role=user message
async function safe1(req: { body: { msg: string } }) {
  const messages = [
    { role: 'system', content: 'You are a helpful bot.' },
    { role: 'user', content: req.body.msg },
  ];
  return messages;
}

// SS-001 mitigation: URL allowlist
const ALLOWED_HOSTS = ['api.example.com', 'cdn.example.com'];
async function safeFetchTool(input: { url: string }) {
  const u = new URL(input.url);
  if (!ALLOWED_HOSTS.includes(u.hostname)) throw new Error('blocked');
  if (u.protocol !== 'https:') throw new Error('https-only');
  return (await fetch(input.url)).text();
}

// SS-003 mitigation: dispatch by name only
const COMMANDS = { ls: ['ls', '-la'], pwd: ['pwd'] };
async function safeCmd(input: { cmd: keyof typeof COMMANDS }) {
  const argv = COMMANDS[input.cmd];
  if (!argv) throw new Error('unknown command');
  spawn(argv[0], argv.slice(1));
}

// CR-002 mitigation: rate limited
import express from 'express';
import rateLimit from 'express-rate-limit';
const app = express();
app.use('/chat', rateLimit({ windowMs: 60_000, max: 10 }));
app.post('/chat', async (req, res) => {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 256,
    messages: [{ role: 'user', content: req.body.msg }],
  });
  res.json(completion);
});

declare const openai: any;
