import { WebSocketServer } from 'ws';
import { projectSnapshot } from '../mcp/resources.js';

// 实时通道：一条 WebSocket 同时承载
//   下行 hello / event / tick / snapshot / pong
//   上行 dispatch（命令，复用 worldService.execute）/ snapshot 请求 / ping
// HTTP 路由保持不变，作为断线兜底；MCP 的 /mcp 走 StreamableHTTPServerTransport，不经过这里。
const SOCKET_PATH = /^\/api\/world\/([^/]+)\/socket$/;
const TICK_MS = 100;
const PING_MS = 20000;
const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_EVENTS_PER_TICK = 5; // 每轮最多补 5 页 × 100 条，避免卡住事件循环
const TICK_BUFFER_LIMIT = 256 * 1024;
const CLOSE_BUFFER_LIMIT = 1024 * 1024;

function rejectUpgrade(socket, code, reason) {
  try {
    socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } catch {
    // socket 可能已经断开
  }
  socket.destroy();
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // 非浏览器客户端（本地脚本）不带 Origin
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function liveActions(actions) {
  return Object.fromEntries(
    Object.entries(actions || {}).filter(([, action]) => ['running', 'queued'].includes(action.status)),
  );
}

const quantize = (value, digits = 3) => {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
};

// tick 只在「看得出的变化」时才发：位置/朝向精确到毫米，需求值按 HUD 的 0.1 精度量化，
// 否则每 100ms 衰减 0.0001 的饥饿值会一直触发发送。
function signatureOf(state) {
  return JSON.stringify({
    l: state.layoutRevision,
    t: state.topologyRevision,
    a: state.actors.map((actor) => [
      actor.sceneId,
      quantize(actor.position[0]), quantize(actor.position[1]), quantize(actor.position[2]),
      quantize(actor.rotation),
      quantize(actor.airHeight), actor.jumpStage ?? 0,
      actor.pose, actor.form, actor.actionId, actor.sprint === true, actor.maneuver ?? null, actor.controller?.leaseId ?? null, actor.moving ? 1 : 0,
      quantize(actor.needs?.hunger ?? 0, 1), quantize(actor.needs?.energy ?? 0, 1), quantize(actor.needs?.happiness ?? 0, 1),
    ]),
    x: state.actions,
  });
}

function stateOf(worldService, principal, worldId, subscribed = null) {
  const snapshot = projectSnapshot(worldService.getSnapshot(principal, worldId), principal);
  const actors = subscribed ? snapshot.actors.filter((actor) => subscribed.has(actor.actorId)) : snapshot.actors;
  return {
    type: 'tick',
    worldId: snapshot.worldId,
    layoutRevision: snapshot.layoutRevision,
    topologyRevision: snapshot.topologyRevision,
    actors,
    actions: liveActions(snapshot.actions),
  };
}

function send(ws, payload) {
  if (ws.readyState !== 1) return false;
  if (ws.bufferedAmount > CLOSE_BUFFER_LIMIT) {
    ws.terminate();
    return false;
  }
  ws.send(JSON.stringify(payload));
  return true;
}

function fail(error) {
  return { ok: false, error: { message: error?.message || 'UNKNOWN', code: error?.status || 400, ...(error?.details ? {details:error.details} : {}) } };
}

/**
 * 把实时通道挂到 Fastify 底层的 http server 上。
 * 只接管 /api/world/:id/socket 的 upgrade，其余路径（含 /mcp 的普通 HTTP/SSE）不受影响。
 */
export function installWorldSocket(app, { worldService, authService, resolvePrincipal } = {}) {
  if (!worldService || !authService || !app?.server) return null;
  const wss = new WebSocketServer({ noServer: true });
  const sockets = new Set();

  app.server.on('upgrade', async (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }
    const match = SOCKET_PATH.exec(url.pathname);
    if (!match) {
      // 不是我们的通道：拒绝并关闭，避免悬挂连接影响其他 upgrade 使用方
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }
    if (!sameOrigin(req)) {
      rejectUpgrade(socket, 403, 'Origin not allowed');
      return;
    }
    let principal;
    try {
      if (req.headers.authorization) throw Object.assign(Error('AGENT_TRANSPORT_HTTP_ONLY'), { status: 401 });
      principal = resolvePrincipal ? await resolvePrincipal(req) : authService.resolvePrincipal(req);
    } catch (error) {
      rejectUpgrade(socket, error?.message === 'UNAUTHORIZED' ? 401 : 403, error?.message || 'Unauthorized');
      return;
    }
    const csrf = url.searchParams.get('csrf') || '';
    if (!principal?.csrfToken || csrf !== principal.csrfToken) {
      rejectUpgrade(socket, 403, 'CSRF_REQUIRED');
      return;
    }
    if (principal.expiresAt !== undefined && principal.expiresAt <= Date.now()) {
      rejectUpgrade(socket, 401, 'UNAUTHORIZED');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, principal, decodeURIComponent(match[1]));
    });
  });

  wss.on('connection', (ws, req, principal, worldId) => {
    sockets.add(ws);
    let cursor;
    let lastTick = '';
    let closed = false;
    let subscribed = null; // null = 订阅全部主体
    let lastDriveAt = 0;   // 本 socket 最近一次驱动主体移动的时间

    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(tickTimer);
      clearInterval(heartbeat);
      sockets.delete(ws);
    };

    // 1) 首帧：快照 + 游标（客户端从该游标续，不回放历史）
    try {
      cursor = worldService.cursor(worldId);
      send(ws, {
        type: 'hello',
        worldId,
        cursor,
        snapshot: { ...projectSnapshot(worldService.getSnapshot(principal, worldId), principal), cursor },
      });
    } catch (error) {
      send(ws, fail(error));
      ws.close();
      return;
    }

    // 2) 每 100ms：补事件 + 推状态（tick 可丢，只发最新）
    const tickTimer = setInterval(() => {
      if (closed || ws.readyState !== ws.OPEN) return;
      try {
        let latest = worldService.cursor(worldId);
        for (let page = 0; page < MAX_EVENTS_PER_TICK && latest > cursor; page += 1) {
          const result = worldService.pushEvents(principal, { worldId, afterCursor: cursor, limit: 100 });
          for (const event of result.events) send(ws, { type: 'event', event });
          const next = result.nextCursor ?? cursor;
          if (next <= cursor) break;
          cursor = next;
          if (!result.hasMore) break;
        }
        const state = stateOf(worldService, principal, worldId, subscribed);
        // 驱动方（正在用手柄/键盘操作）自己的位置会通过 dispatch 的 ack 回来，
        // 不需要再广播一份给自己；其他订阅者照常收。
        const driving = state.actors.length > 0 && state.actors.every((actor) => actor.controller?.subjectId === principal.subjectId);
        if (driving && Date.now() - lastDriveAt < 800) return;
        const signature = signatureOf(state);
        if (signature !== lastTick) {
          if (ws.bufferedAmount > TICK_BUFFER_LIMIT) return; // 背压：跳过这一帧，下次只发最新
          lastTick = signature;
          send(ws, state);
        }
      } catch (error) {
        send(ws, fail(error));
      }
    }, TICK_MS);

    // 3) 心跳：客户端不回应就断开，交给客户端重连
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const heartbeat = setInterval(() => {
      if (closed) return;
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      try { ws.ping(); } catch { ws.terminate(); }
    }, PING_MS);

    // 4) 上行：dispatch（复用 execute）/ snapshot / ping
    ws.on('message', (raw) => {
      if (closed) return;
      if (raw.length > MAX_MESSAGE_BYTES) { send(ws, fail(Error('MESSAGE_TOO_LARGE'))); return; }
      let frame;
      try { frame = JSON.parse(raw.toString()); } catch { send(ws, fail(Error('INVALID_FRAME'))); return; }
      if (frame?.type === 'ping') { send(ws, { type: 'pong' }); return; }
      if (frame?.type === 'subscribe') {
        const ids = Array.isArray(frame.actors) ? frame.actors.filter((id) => typeof id === 'string' && id.length <= 64) : [];
        subscribed = ids.length ? new Set(ids) : null;
        send(ws, { type: 'subscribed', actors: ids });
        return;
      }
      if (frame?.type === 'snapshot') {
        try {
          cursor = worldService.cursor(worldId);
          send(ws, {
            type: 'snapshot',
            id: frame.id,
            cursor,
            snapshot: { ...projectSnapshot(worldService.getSnapshot(principal, worldId), principal), cursor },
          });
        } catch (error) {
          send(ws, { type: 'ack', id: frame.id, ...fail(error) });
        }
        return;
      }
      if (frame?.type !== 'dispatch') { send(ws, fail(Error('UNKNOWN_FRAME'))); return; }
      try {
        if (frame.command?.worldId !== worldId) throw Error('WORLD_ID_MISMATCH');
        if (frame.command.kind === 'actor.input') lastDriveAt = Date.now();
        const result = worldService.execute(principal, frame.command);
        send(ws, { type: 'ack', id: frame.id, ok: true, result });
      } catch (error) {
        send(ws, { type: 'ack', id: frame.id, ...fail(error) });
      }
    });

    ws.on('close', close);
    ws.on('error', close);
  });

  app.addHook('onClose', async () => {
    for (const ws of sockets) { try { ws.terminate(); } catch { /* ignore */ } }
    sockets.clear();
    wss.close();
  });

  return wss;
}
