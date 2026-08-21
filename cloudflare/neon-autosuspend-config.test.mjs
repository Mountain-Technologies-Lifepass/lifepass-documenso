import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cloudflareRoot = fileURLToPath(new URL('.', import.meta.url));

test('Documenso idles long enough for Neon to autosuspend', () => {
  const workerSource = readFileSync(`${cloudflareRoot}/src/index.ts`, 'utf8');
  const wranglerConfig = readFileSync(`${cloudflareRoot}/wrangler.toml`, 'utf8');

  assert.match(workerSource, /sleepAfter = "15m"/);
  assert.doesNotMatch(workerSource, /async scheduled\(/);
  assert.doesNotMatch(wranglerConfig, /^\[triggers\]$/m);
  assert.doesNotMatch(wranglerConfig, /\*\/5 \* \* \* \*/);
  assert.match(workerSource, /return container\.fetch\(request\)/);
});
