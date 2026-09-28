// The big screen's side of a room: hands out the room code, keeps the list
// of seats (one per house, in player order), and relays requests from phones
// to the game. The game itself still runs only here.
import { openTransport } from './transport.js';
import {
  makeRoomCode, trimState, validateJoin, HELLO, PING, JOIN, LEAVE, ACT, DECIDE, END, NEXT,
  LOBBY, STATE, TOAST, REJECT, CLOSED, PROBE, HOST_HERE, ROLL_CALL, BEAT, PING_EVERY_MS, OFFLINE_AFTER_MS,
} from './protocol.js';

// Resolves true if another big screen already answers on this code.
function codeInUse(t) {
  return new Promise((resolve) => {
    t.onMessage((m) => { if (m.t === HOST_HERE) resolve(true); });
    t.send({ t: PROBE });
    setTimeout(() => resolve(false), 900);
  });
}

// seats: [{ cid, name, home }] when reopening a saved game's room.
export async function hostRoom({ code = null, seats = [], started = false, joinRules }) {
  let t;
  for (let tries = 0; ; tries++) {
    const tryCode = code ?? makeRoomCode();
    t = await openTransport(tryCode);
    if (!(await codeInUse(t))) { code = tryCode; break; }
    t.close();
    code = null;
    if (tries >= 5) throw new Error('No free room code.');
  }

  let rev = 0;
  let last = null;
  let closed = false;
  const room = {
    code,
    started,
    seats: seats.map((s) => ({ cid: s.cid, name: s.name, home: s.home, online: false, lastSeen: 0, rid: 0 })),
    options: {},
    onChange: () => {},
    onIntent: () => {},
    // rid: the last request from that device the game has finished handling.
    publicSeats: () => room.seats.map(({ cid, name, home, online, rid }) => ({ cid, name, home, online, rid })),
    savedSeats: () => room.seats.map(({ cid, name, home }) => ({ cid, name, home })),
    pushLobby() { t.send({ t: LOBBY, seats: room.publicSeats(), options: room.options }); },
    pushState(state, view) {
      last = { t: STATE, rev: ++rev, state: trimState(state), view, seats: room.publicSeats() };
      t.send(last);
    },
    handled(msg) {
      const s = room.seats.find((x) => x.cid === msg.from);
      if (s && typeof msg.rid === 'number') s.rid = Math.max(s.rid, msg.rid);
    },
    toast(seat, text) { const s = room.seats[seat]; if (s) t.send({ t: TOAST, to: s.cid, text }); },
    removeSeat(i) { room.seats.splice(i, 1); room.pushLobby(); room.onChange(); },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(watch);
      clearInterval(beat);
      window.removeEventListener('pagehide', onPageHide);
      t.send({ t: CLOSED });
      setTimeout(() => t.close(), 300);
    },
  };
  const resend = () => { if (room.started && last) { last = { ...last, seats: room.publicSeats() }; t.send(last); } else room.pushLobby(); };

  t.onMessage((m) => {
    if (closed || !m || typeof m !== 'object') return;
    if (m.t === PROBE) { t.send({ t: HOST_HERE }); return; }
    const i = room.seats.findIndex((s) => s.cid === m.from);
    const seat = room.seats[i];
    if (seat) {
      const wasOnline = seat.online;
      seat.online = true;
      seat.lastSeen = Date.now();
      if (!wasOnline) room.onChange();
    }
    switch (m.t) {
      case HELLO: resend(); break;
      case PING: if (room.started && last && m.rev !== last.rev) resend(); break;
      case JOIN: onJoin(m, i); break;
      case LEAVE:
        if (i >= 0 && !room.started) room.removeSeat(i);
        else if (seat) { seat.online = false; room.onChange(); }
        break;
      case ACT: case DECIDE: case END: case NEXT:
        if (room.started) room.onIntent(m);
        break;
      default:
    }
  });

  function onJoin(m, i) {
    const name = String(m.name ?? '').trim();
    if (room.started) {
      // A device that lost its place (new browser, cleared data) takes its
      // house back by typing the same house name.
      const j = room.seats.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
      if (j < 0) { t.send({ t: REJECT, to: m.from, reason: 'This game has already started. To rejoin, type your house name exactly as before.' }); return; }
      Object.assign(room.seats[j], { cid: m.from, online: true, lastSeen: Date.now() });
      room.onChange();
      resend();
      return;
    }
    const others = room.seats.filter((_, k) => k !== i);
    const problem = validateJoin(others, { name, home: m.home }, joinRules);
    if (problem) { t.send({ t: REJECT, to: m.from, reason: problem }); return; }
    if (i >= 0) Object.assign(room.seats[i], { name, home: m.home });
    else room.seats.push({ cid: m.from, name, home: m.home, online: true, lastSeen: Date.now(), rid: 0 });
    room.pushLobby();
    room.onChange();
  }

  // Mark devices that stopped sending heartbeats as offline.
  const watch = setInterval(() => {
    let changed = false;
    for (const s of room.seats) {
      if (s.online && Date.now() - s.lastSeen > OFFLINE_AFTER_MS) { s.online = false; changed = true; }
    }
    if (changed) { room.onChange(); if (!room.started) room.pushLobby(); }
  }, 4000);

  // A heartbeat, so devices notice if this screen disappears without saying goodbye
  // (crash, lost connection), and a goodbye when its tab is closed or reloaded.
  const beat = setInterval(() => t.send({ t: BEAT }), PING_EVERY_MS);
  const onPageHide = () => room.close();
  window.addEventListener('pagehide', onPageHide);

  // Devices still on the page from before (a reopened saved game) report in now.
  t.send({ t: ROLL_CALL });
  return room;
}
