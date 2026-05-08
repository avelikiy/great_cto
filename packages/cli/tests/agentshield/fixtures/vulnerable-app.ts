// Fixture file with intentional vulnerabilities for agentshield to detect.
// DO NOT use this in production — it's a test fixture.
//
// Each marked block triggers a different rule.

import { spawn } from 'node:child_process';

// PI-001: User input in system prompt template literal
async function vulnerable1(req: { body: { msg: string } }) {
  const messages = [
    { role: 'system', content: `You are a helpful bot. User said: ${req.body.msg}` },
  ];
  return messages;
}

// PI-005: Eval-like execution of model output
async function vulnerable2() {
  const response = { text: 'console.log("hi")' };
  // eslint-disable-next-line no-eval
  eval(response.text);
}

// SS-001: Tool fetches URL without allowlist
async function fetchTool(input: { url: string }) {
  // tool definition for an LLM agent
  const r = await fetch(input.url);
  return r.text();
}

// SS-003: Tool exec with user command
async function shellTool(input: { cmd: string }) {
  // tool: execute the user's command
  spawn(input.cmd, { shell: true });
}

// CR-002: Public endpoint hits LLM without rate limit
import express from 'express';
const app = express();
app.post('/chat', async (req, res) => {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: req.body.msg }],
  });
  res.json(completion);
});

// CR-006: Most expensive model used
const cfg = { model: 'gpt-4-turbo' };

declare const openai: any;
