// A transport is one room's message pipe: { send(msg), onMessage(fn), close() }.
// Every message goes to every other device in the room; each device ignores
// messages that are not for it.
//   - Supabase Realtime (Broadcast channels) for real games across devices.
//   - BroadcastChannel (tabs of one browser) when the page address has
//     ?net=local, for testing without internet or a Supabase project.
import { RealtimeClient } from '@supabase/realtime-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const EVENT = 'm';
let client = null;

export function useLocalTransport() {
  try { return new URLSearchParams(location.search).get('net') === 'local'; } catch { return false; }
}

// false when multi-device play cannot work on this page (no project set up).
export function netAvailable() {
  return useLocalTransport() ? typeof BroadcastChannel === 'function' : !!(SUPABASE_URL && SUPABASE_KEY);
}

export function openTransport(code) {
  return useLocalTransport() ? openLocal(code) : openSupabase(code);
}

function openLocal(code) {
  const ch = new BroadcastChannel(`pop-room-${code}`);
  const handlers = [];
  ch.onmessage = (e) => handlers.forEach((h) => h(e.data));
  return Promise.resolve({
    send: (msg) => ch.postMessage(msg),
    onMessage: (fn) => handlers.push(fn),
    close: () => ch.close(),
  });
}

function openSupabase(code) {
  client ??= new RealtimeClient(`${SUPABASE_URL.replace(/^http/, 'ws').replace(/\/$/, '')}/realtime/v1`, { params: { apikey: SUPABASE_KEY } });
  const ch = client.channel(`pop-room-${code}`, { config: { broadcast: { self: false } } });
  const handlers = [];
  ch.on('broadcast', { event: EVENT }, ({ payload }) => handlers.forEach((h) => h(payload)));
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => fail(new Error('timed out')), 12000);
    function fail(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.removeChannel(ch);
      reject(err);
    }
    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED' && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          send: (msg) => ch.send({ type: 'broadcast', event: EVENT, payload: msg }),
          onMessage: (fn) => handlers.push(fn),
          close: () => client.removeChannel(ch),
        });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        fail(err ?? new Error(status));
      }
    });
  });
}
