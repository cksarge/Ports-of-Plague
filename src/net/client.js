// A player's device: joins a room by its 4-character code and sends requests.
// The device id lives in sessionStorage (one per browser tab, kept across a
// reload) so a reloaded or woken-up phone gets its house back.
import { openTransport } from './transport.js';
import { makeClientId, HELLO, PING, LEAVE, ROLL_CALL, PING_EVERY_MS } from './protocol.js';

const CID_KEY = 'ports-of-plague-device';
const ROOM_KEY = 'ports-of-plague-room';
let memoryCid = null;

function clientId() {
  try {
    let id = sessionStorage.getItem(CID_KEY);
    if (!id) { id = makeClientId(); sessionStorage.setItem(CID_KEY, id); }
    return id;
  } catch {
    return (memoryCid ??= makeClientId());
  }
}

// The room this tab last joined, so a reload can go straight back in.
export function lastRoom() {
  try { return sessionStorage.getItem(ROOM_KEY); } catch { return null; }
}
function rememberRoom(code) {
  try { if (code) sessionStorage.setItem(ROOM_KEY, code); else sessionStorage.removeItem(ROOM_KEY); } catch { /* ignore */ }
}

export async function joinRoom(code, { onMessage }) {
  const cid = clientId();
  const t = await openTransport(code);
  let rev = null;
  let closed = false;
  t.onMessage((m) => {
    if (closed || !m || typeof m !== 'object' || (m.to && m.to !== cid)) return;
    if (m.t === ROLL_CALL) { hello(); return; }
    if (typeof m.rev === 'number') rev = m.rev;
    onMessage(m);
  });
  const send = (m) => { if (!closed) t.send({ ...m, from: cid }); };
  const hello = () => send({ t: HELLO });
  // The ping carries the last state seen, so the host can resend a missed update.
  const ping = setInterval(() => send({ t: PING, rev }), PING_EVERY_MS);
  const onVisible = () => { if (document.visibilityState === 'visible') hello(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', hello);
  rememberRoom(code);
  hello();
  return {
    cid,
    code,
    send,
    close({ leave = true } = {}) {
      if (closed) return;
      if (leave) send({ t: LEAVE });
      closed = true;
      clearInterval(ping);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', hello);
      rememberRoom(null);
      setTimeout(() => t.close(), 300);
    },
  };
}
