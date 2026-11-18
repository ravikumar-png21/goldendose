// Tests for the browser safety headers (see src/security.js).
// Run with:  npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";

let server, base;
before(async () => {
  server = createApp(openDatabase(":memory:")).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

for (const path of ["/api/health", "/", "/care/", "/api/no-such-address"]) {
  test(`safety headers are sent with ${path}`, async () => {
    const reply = await fetch(base + path);
    const policy = reply.headers.get("content-security-policy");
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /script-src 'self'(;|$)/);       // scripts only from our own site: no inline scripts, no other sites
    assert.match(policy, /frame-ancestors 'none'/);
    assert.equal(reply.headers.get("x-content-type-options"), "nosniff");
    assert.equal(reply.headers.get("x-frame-options"), "DENY");
    assert.equal(reply.headers.get("referrer-policy"), "no-referrer");
    assert.equal(reply.headers.get("x-powered-by"), null); // don't announce "Express"
  });
}

test("the always-use-HTTPS header is sent only over HTTPS", async () => {
  assert.equal((await fetch(`${base}/api/health`)).headers.get("strict-transport-security"), null);
  // Behind a hosting service the request arrives as plain http with a note saying it was HTTPS.
  process.env.TRUST_PROXY = "1";
  const hosted = createApp(openDatabase(":memory:")).listen(0);
  await new Promise((resolve) => hosted.once("listening", resolve));
  const reply = await fetch(`http://localhost:${hosted.address().port}/api/health`, { headers: { "X-Forwarded-Proto": "https" } });
  assert.match(reply.headers.get("strict-transport-security"), /max-age=31536000/);
  hosted.close();
  delete process.env.TRUST_PROXY;
});
