import { describe, expect, test, afterEach } from 'vitest';
import net from 'node:net';
import http from 'node:http';
import { createProxyHandler } from '../proxy/handler.mjs';

// Regression test for a real crash observed live: PHP's `php -S` dev
// server can send trailing bytes on a connection past its own declared
// "Connection: close" header. Node's http client surfaces this as a
// LATE 'error' event on the ClientRequest - AFTER the real response
// had already been written and piped to the client successfully.
// proxy/handler.mjs used to call clientRes.writeHead()/.end()
// unconditionally in that handler, which throws ERR_HTTP_HEADERS_SENT
// when headers were already sent - an uncaught exception from an
// 'error' handler is fatal in Node, so this crashed the entire proxy
// process, taking the whole site offline (not just the one request).

const servers = [];

function listen(server, port) {
  return new Promise((resolve) => server.listen(port, resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(close));
});

/**
 * A fake backend that sends a valid response with Connection: close,
 * then writes trailing garbage bytes on the SAME socket before
 * actually closing it - reproducing the real php -S quirk.
 */
function createMisbehavingBackend() {
  return net.createServer((socket) => {
    socket.on('data', () => {
      socket.write('HTTP/1.1 204 No Content\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      socket.write('GARBAGE-DATA-AFTER-CLOSE\r\n\r\n');
      socket.end();
    });
  });
}

function requestThroughProxy(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port, path, method: 'POST' }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('proxy handler survives a late parse error on an already-completed response', () => {
  test('the proxy process keeps serving requests after the backend sends trailing garbage bytes', async () => {
    const backend = createMisbehavingBackend();
    const backendPort = 19080;
    await listen(backend, backendPort);
    servers.push(backend);

    const proxyServer = http.createServer(
      createProxyHandler({
        appTarget: { host: 'localhost', port: backendPort },
        pagesTarget: { host: 'localhost', port: 1 }, // unused for this path
      }),
    );
    const proxyPort = 19000;
    await listen(proxyServer, proxyPort);
    servers.push(proxyServer);

    // The first request triggers the misbehaving backend's
    // trailing-garbage response - this is what used to crash the
    // proxy process shortly afterward.
    const status1 = await requestThroughProxy(proxyPort, '/index.php?route=%2Flogout');
    expect(status1).toBe(204);

    // Give the late, stray 'error' event time to fire on the proxy's
    // outgoing connection.
    await new Promise((resolve) => setTimeout(resolve, 200));

    // The real assertion: the proxy server is still alive and able to
    // serve a second, unrelated request. Before the fix, the process
    // would have crashed (uncaught ERR_HTTP_HEADERS_SENT) before this
    // point was ever reached.
    const status2 = await requestThroughProxy(proxyPort, '/index.php?route=%2Fhome');
    expect(status2).toBe(204);
  });
});
