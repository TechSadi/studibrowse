import type { Page, Route } from '@playwright/test';
import type { AckData, AckEventName, ClientPayload } from '@studibrowse/shared';

/** Answers for acknowledged events. An event without one is acked with `{}`. */
export type SocketHandlers = {
  [E in AckEventName]?: (payload: ClientPayload<E>) => AckData<E>;
};

export interface MockSocket {
  /** Every event the client emitted, in order. */
  emitted: { event: string; payload: unknown }[];
}

// Engine.IO v4 over HTTP long-polling, which is how socket.io-client starts. No upgrades are offered, so it
// never switches to a WebSocket. https://socket.io/docs/v4/engine-io-protocol/
const PACKET_SEPARATOR = '\x1e';
const SID = 'mock-sid';
/** Long enough that the client never expects a ping during a test. */
const HANDSHAKE = `0${JSON.stringify({ sid: SID, upgrades: [], pingInterval: 600_000, pingTimeout: 600_000, maxPayload: 1_000_000 })}`;
/** How long an empty poll waits before answering with a noop, so it can't hang forever. */
const POLL_WAIT_MS = 10_000;

/**
 * A stand-in Socket.IO server for tests that stub the API: it accepts the connection, answers acknowledged
 * events from `handlers` and records what the client sent. Register it after mockApi, which blocks sockets;
 * Playwright tries the most recently added route first.
 */
export async function mockSocket(page: Page, handlers: SocketHandlers = {}): Promise<MockSocket> {
  const mock: MockSocket = { emitted: [] };
  const outbox: string[] = [];
  let wake: (() => void) | null = null;

  function send(packet: string) {
    outbox.push(packet);
    wake?.();
  }

  /** One Socket.IO packet, without its Engine.IO MESSAGE prefix. */
  function receive(packet: string) {
    // CONNECT, with the auth token, which the mock accepts as is.
    if (packet.startsWith('0')) {
      send(`40${JSON.stringify({ sid: 'mock-socket' })}`);
      return;
    }
    // EVENT, with an ack id when the client wants an answer: 2<id>["event", payload]
    const match = /^2(\d*)(\[.*\])$/s.exec(packet);
    if (!match) return;
    const [event, payload] = JSON.parse(match[2]!) as [string, unknown];
    mock.emitted.push({ event, payload });
    if (!match[1]) return;
    const handler = handlers[event as AckEventName] as ((payload: unknown) => unknown) | undefined;
    send(`43${match[1]}${JSON.stringify([{ ok: true, data: handler ? handler(payload) : {} }])}`);
  }

  async function poll(route: Route) {
    if (outbox.length === 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, POLL_WAIT_MS);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      wake = null;
    }
    const body = outbox.length ? outbox.splice(0).join(PACKET_SEPARATOR) : '6';
    await route
      .fulfill({ status: 200, contentType: 'text/plain; charset=UTF-8', body })
      .catch(() => undefined);
  }

  await page.route('**/socket.io/**', async (route) => {
    const request = route.request();
    const sid = new URL(request.url()).searchParams.get('sid');
    if (!sid) {
      await route.fulfill({ status: 200, contentType: 'text/plain; charset=UTF-8', body: HANDSHAKE });
      return;
    }
    if (request.method() === 'POST') {
      for (const packet of (request.postData() ?? '').split(PACKET_SEPARATOR)) {
        // Engine.IO MESSAGE packets start with 4; the rest of the packet is Socket.IO's.
        if (packet.startsWith('4')) receive(packet.slice(1));
      }
      await route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
      return;
    }
    await poll(route);
  });
  return mock;
}
