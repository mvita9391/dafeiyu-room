import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import WebSocket from 'ws';
import { buildServer } from '../server/app.js';

async function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function boot() {
  const port = await freePort();
  const host = `127.0.0.1:${port}`;
  const app = await buildServer({ databasePath: ':memory:', worldMode: true, auth: { localAccess: true, issuer: `http://${host}` } });
  await app.listen({ port, host: '127.0.0.1' });
  const pair = await app.inject({ method: 'POST', url: '/api/auth/local-session', headers: { host, origin: `http://${host}` }, payload: {} });
  assert.equal(pair.statusCode, 200);
  const { csrfToken } = pair.json();
  const cookie = String(pair.headers['set-cookie']).split(';')[0];
  return { app, port, host, csrfToken, cookie };
}

function connect({ host, csrfToken, cookie, origin = `http://${host}`, authorization }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${host}/api/world/default/socket?csrf=${encodeURIComponent(csrfToken)}`, {
      headers: { cookie, origin, ...(authorization ? { authorization } : {}) },
    });
    const frames = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const frame = JSON.parse(raw.toString());
      const index = waiters.findIndex((waiter) => waiter.predicate(frame));
      if (index >= 0) {
        const [waiter] = waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(frame);
        return;
      }
      frames.push(frame);
    });
    const next = (predicate, ms = 5000) => new Promise((done, fail) => {
      const index = frames.findIndex(predicate);
      if (index >= 0) {
        const [frame] = frames.splice(index, 1);
        done(frame);
        return;
      }
      const waiter = {
        predicate,
        resolve: done,
        timer: setTimeout(() => {
          const at = waiters.indexOf(waiter);
          if (at >= 0) waiters.splice(at, 1);
          fail(new Error('timeout waiting for frame'));
        }, ms),
      };
      waiters.push(waiter);
    });
    ws.once('open', () => resolve({ ws, next }));
    ws.once('unexpected-response', (_req, res) => reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode })));
    ws.once('error', reject);
  });
}

test('socket channel: hello carries snapshot+cursor, tick streams, dispatch acks and pushes events', async () => {
  const { app, ...ctx } = await boot();
  try {
    const { ws, next } = await connect(ctx);
    const hello = await next((frame) => frame.type === 'hello');
    assert.equal(hello.worldId, 'default');
    assert.ok(hello.cursor >= 0);
    assert.equal(hello.snapshot.scenes.length, 4);
    assert.equal(hello.snapshot.cursor, hello.cursor);

    const tick = await next((frame) => frame.type === 'tick');
    assert.equal(tick.actors.length, 1);
    assert.deepEqual(Object.keys(tick.actions), []);

    ws.send(JSON.stringify({ type: 'dispatch', id: 'c1', command: { worldId: 'default', requestId: 'req-1', kind: 'control.takeover', payload: { actorId: 'whale' } } }));
    const ack = await next((frame) => frame.type === 'ack' && frame.id === 'c1');
    assert.equal(ack.ok, true);
    assert.ok(ack.result.leaseId);

    const event = await next((frame) => frame.type === 'event');
    assert.ok(event.event.cursor > hello.cursor);

    ws.send(JSON.stringify({ type: 'snapshot', id: 's1' }));
    const snapshot = await next((frame) => frame.type === 'snapshot' && frame.id === 's1');
    assert.equal(snapshot.snapshot.scenes.length, 4);

    // 浏览器推送不写 MCP 的消费者记账
    const deliveries = app.worldService.db.prepare('SELECT COUNT(*) AS c FROM consumer_deliveries').get().c;
    assert.equal(deliveries, 0);

    ws.close();
  } finally {
    await app.close();
  }
});

test('socket channel: command errors come back as ack failures and worldId must match', async () => {
  const { app, ...ctx } = await boot();
  try {
    const { ws, next } = await connect(ctx);
    await next((frame) => frame.type === 'hello');
    ws.send(JSON.stringify({ type: 'dispatch', id: 'bad-world', command: { worldId: 'other', requestId: 'r1', kind: 'control.takeover', payload: { actorId: 'whale' } } }));
    const mismatch = await next((frame) => frame.type === 'ack' && frame.id === 'bad-world');
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.error.message, 'WORLD_ID_MISMATCH');

    ws.send(JSON.stringify({ type: 'dispatch', id: 'bad-command', command: { worldId: 'default', requestId: 'r2', kind: 'not.a.command', payload: {} } }));
    const invalid = await next((frame) => frame.type === 'ack' && frame.id === 'bad-command');
    assert.equal(invalid.ok, false);

    ws.close();
  } finally {
    await app.close();
  }
});

test('socket channel: rejects bad csrf, foreign origin and agent bearer tokens', async () => {
  const { app, ...ctx } = await boot();
  try {
    await assert.rejects(connect({ ...ctx, csrfToken: 'nope' }), (error) => error.status === 403);
    await assert.rejects(connect({ ...ctx, origin: 'http://evil.example' }), (error) => error.status === 403);
    await assert.rejects(connect({ ...ctx, authorization: 'Bearer abc' }), (error) => error.status === 403);
  } finally {
    await app.close();
  }
});

test('socket channel: reconnect gets a fresh hello instead of replaying history', async () => {
  const { app, ...ctx } = await boot();
  try {
    const first = await connect(ctx);
    const hello = await first.next((frame) => frame.type === 'hello');
    first.ws.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = await connect(ctx);
    const again = await second.next((frame) => frame.type === 'hello');
    assert.ok(again.cursor >= hello.cursor);
    assert.equal(again.snapshot.scenes.length, 4);
    second.ws.close();
  } finally {
    await app.close();
  }
});

test('movement rate details agree across transports and HTTP fallback reuses the WebSocket receipt', async () => {
  const { app, ...ctx } = await boot();
  let ws;
  try {
    app.worldService.clock = () => 1000;
    const connection = await connect(ctx);
    ws = connection.ws;
    await connection.next(frame => frame.type === 'hello');
    const send = async command => {
      ws.send(JSON.stringify({ type: 'dispatch', id: command.requestId, command }));
      return connection.next(frame => frame.type === 'ack' && frame.id === command.requestId);
    };
    const executeHTTP = command => app.inject({
      method: 'POST', url: '/api/world/default/commands', payload: command,
      headers: { host: ctx.host, origin: `http://${ctx.host}`, cookie: ctx.cookie, 'x-csrf-token': ctx.csrfToken },
    });
    const lease = (await send({
      kind: 'control.takeover', worldId: 'default', requestId: 'rate-lease', payload: { actorId: 'whale' },
    })).result;
    const input = {
      kind: 'actor.input', worldId: 'default', requestId: 'rate-check',
      payload: { actorId: 'whale', leaseId: lease.leaseId, leaseVersion: lease.leaseVersion,
        frames: Array.from({ length: 3 }, (_, index) => ({ sequence: index + 1, direction: [0, 0], dtMs: 50 })) },
    };
    const over = await send(input);
    assert.equal(over.error.message, 'INPUT_RATE_EXCEEDED');
    assert.equal(over.error.details.retryAfterMs, 50);
    const httpError = await executeHTTP(input);
    assert.equal(httpError.statusCode, 400);
    assert.equal(httpError.json().details.retryAfterMs, 50);

    input.payload.frames.pop();
    const accepted = await send(input);
    assert.equal(accepted.ok, true);
    const fallback = await executeHTTP(input);
    assert.deepEqual(fallback.json(), accepted.result);
    assert.equal(app.worldService.readSnapshot('default').actors[0].input.sequence, 2);
  } finally {
    ws?.close();
    await app.close();
  }
});
