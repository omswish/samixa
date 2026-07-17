import http, { IncomingMessage, RequestOptions, ServerResponse } from 'http';
import https from 'https';
import net from 'net';
import { createHmac, timingSafeEqual } from 'crypto';

const listenHost = process.env.LISTEN_HOST || '0.0.0.0';
const listenPort = Number(process.env.LISTEN_PORT || 3000);
const targetOrigin = process.env.TARGET_ORIGIN || 'http://127.0.0.1:3001';
const wsTargetOrigin = process.env.WS_TARGET_ORIGIN || 'http://127.0.0.1:4000';
const upstreamBase = new URL(targetOrigin);
const wsUpstreamBase = new URL(wsTargetOrigin);
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 30000);
const surfaceMode = process.env.ITDASH_SURFACE === 'admin' ? 'admin' : 'operator';
const sessionCookieName = process.env.SESSION_COOKIE_NAME || (surfaceMode === 'admin' ? 'itdash_session_admin' : 'itdash_session_operator');

function getAuthSecret() {
  return process.env.APP_AUTH_SECRET || '';
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

function readCookie(req: IncomingMessage, cookieName: string) {
  const cookieHeader = req.headers.cookie || '';
  const parts = cookieHeader.split(';').map((entry) => entry.trim());
  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === cookieName) {
      return value;
    }
  }

  return null;
}

function isValidSessionCookie(req: IncomingMessage) {
  const secret = getAuthSecret();
  if (!secret) {
    return false;
  }

  const token = readCookie(req, sessionCookieName);
  if (!token) {
    return false;
  }

  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) {
    return false;
  }

  try {
    const expected = createHmac('sha256', secret).update(encodedPayload).digest();
    const actual = decodeBase64Url(encodedSignature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return false;
    }

    const payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function createForwardHeaders(req: IncomingMessage): http.OutgoingHttpHeaders {
  const host = req.headers.host || '';
  const forwardedFor = req.socket.remoteAddress || '';

  return {
    ...req.headers,
    host: upstreamBase.host,
    'x-forwarded-host': host,
    'x-forwarded-proto': 'http',
    'x-forwarded-for': forwardedFor,
    'x-itdash-surface': surfaceMode,
    connection: 'close'
  };
}

function applyResponseHeaders(res: ServerResponse, headers: http.IncomingHttpHeaders) {
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      res.setHeader(key, value);
    }
  }

  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'same-origin');
}

function proxyRequest(req: IncomingMessage, res: ServerResponse) {
  const transport = upstreamBase.protocol === 'https:' ? https : http;
  const options: RequestOptions = {
    protocol: upstreamBase.protocol,
    hostname: upstreamBase.hostname,
    port: upstreamBase.port,
    method: req.method,
    path: req.url || '/',
    headers: createForwardHeaders(req)
  };

  const upstreamReq = transport.request(options, (upstreamRes) => {
    res.statusCode = upstreamRes.statusCode || 502;
    applyResponseHeaders(res, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstreamReq.setTimeout(requestTimeoutMs, () => {
    upstreamReq.destroy(new Error(`Upstream timeout after ${requestTimeoutMs}ms`));
  });

  upstreamReq.on('error', (error) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    }

    res.end(JSON.stringify({ error: 'Front door upstream unavailable', detail: error.message }));
  });

  req.pipe(upstreamReq);
}

const server = http.createServer((req, res) => {
  proxyRequest(req, res);
});

server.on('upgrade', (req, socket, head) => {
  const requestPath = req.url || '/';
  if (!requestPath.startsWith('/ws')) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  if (!isValidSessionCookie(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const upstreamSocket = net.connect(
    Number(wsUpstreamBase.port || 80),
    wsUpstreamBase.hostname,
    () => {
      const upstreamPath = requestPath.replace(/^\/ws/, '') || '/';
      const filteredHeaderLines: string[] = [];
      const rawHeaders = req.rawHeaders || [];
      let sawHost = false;

      for (let index = 0; index < rawHeaders.length; index += 2) {
        const headerName = rawHeaders[index];
        const headerValue = rawHeaders[index + 1];
        if (!headerName || headerValue === undefined) {
          continue;
        }

        if (headerName.toLowerCase() === 'host') {
          filteredHeaderLines.push(`Host: ${wsUpstreamBase.host}`);
          sawHost = true;
          continue;
        }

        filteredHeaderLines.push(`${headerName}: ${headerValue}`);
      }

      if (!sawHost) {
        filteredHeaderLines.push(`Host: ${wsUpstreamBase.host}`);
      }

      filteredHeaderLines.push(`X-Forwarded-Host: ${req.headers.host || ''}`);
      filteredHeaderLines.push('X-Forwarded-Proto: http');
      filteredHeaderLines.push(`X-Forwarded-For: ${req.socket.remoteAddress || ''}`);

      upstreamSocket.write(
        `GET ${upstreamPath} HTTP/1.1\r\n${filteredHeaderLines.join('\r\n')}\r\n\r\n`
      );

      if (head.length > 0) {
        upstreamSocket.write(head);
      }

      socket.pipe(upstreamSocket).pipe(socket);
    }
  );

  upstreamSocket.on('error', () => {
    socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    socket.destroy();
  });

  socket.on('error', () => {
    upstreamSocket.destroy();
  });
});

server.listen(listenPort, listenHost, () => {
  console.log(`Dashboard front door listening on http://${listenHost}:${listenPort} -> ${targetOrigin}`);
});
