// The Mind - server otoritatif (Node.js + ws). Tangan tiap pemain hanya dikirim ke pemilknya.
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const page = path.join(__dirname, 'public', 'index.html');

const srv = http.createServer((q, r) => {
  if (q.url === '/healthz') return r.end('ok');
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
  r.end(fs.readFileSync(page));
});
const wss = new WebSocketServer({ server: srv });
const rooms = new Map();

const mkRoom = code => ({ code, roster: [], phase: 'lobby', players: [], hands: {}, pile: [], ready: {}, votes: {},
  lvl: 0, max: 0, lives: 0, stars: 0, msg: '', err: 0, touch: Date.now() });

function deal(R) {
  const d = Array.from({ length: 100 }, (_, i) => i + 1);
  for (let i = 99; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  R.hands = {};
  R.players.forEach((p, i) => R.hands[p] = d.slice(i * R.lvl, (i + 1) * R.lvl).sort((a, b) => a - b));
  R.pile = []; R.ready = {}; R.votes = {}; R.phase = 'ready';
}
function check(R) {
  if (R.lives <= 0) { R.phase = 'lost'; R.msg = 'Nyawa habis.'; return; }
  if (R.players.some(p => R.hands[p].length)) return;
  if ([3, 6, 9].includes(R.lvl)) R.lives = Math.min(5, R.lives + 1);
  if ([2, 5, 8].includes(R.lvl)) R.stars = Math.min(3, R.stars + 1);
  if (R.lvl >= R.max) { R.phase = 'won'; R.msg = ''; return; }
  const pre = R.msg ? R.msg + ' ' : ''; R.lvl++; deal(R); R.msg = pre + 'Level selesai! Lanjut level ' + R.lvl + '.';
}
function act(R, id, m) {
  const P = R.players.includes(id), over = R.phase === 'won' || R.phase === 'lost';
  if (m.t === 'start') {
    if (R.phase !== 'lobby' && !over) return;
    const on = R.roster.filter(x => x.ws).map(x => x.id).slice(0, 4);
    if (on.length < 2) return;
    R.players = on;
    Object.assign(R, { lvl: 1, max: { 2: 12, 3: 10, 4: 8 }[on.length], lives: on.length, stars: 1, msg: '' });
    deal(R);
  } else if (!P || R.phase === 'lobby' || over) return;
  else if (m.t === 'ready' && R.phase === 'ready') {
    R.ready[id] = 1;
    if (R.players.every(p => R.ready[p])) { R.phase = 'play'; R.msg = ''; }
  } else if (m.t === 'play' && R.phase === 'play' && R.hands[id].includes(m.c)) {
    const c = m.c; R.hands[id] = R.hands[id].filter(x => x !== c); R.pile.push(c); R.msg = '';
    const bad = [];
    R.players.forEach(p => { R.hands[p].forEach(x => { if (x < c) bad.push(x); }); R.hands[p] = R.hands[p].filter(x => x > c); });
    if (bad.length) {
      R.lives--; R.err++; R.phase = 'ready'; R.ready = {}; R.votes = {};
      R.msg = 'Salah! ' + c + ' keluar, padahal ada ' + bad.sort((a, b) => a - b).join(', ') + ' (hangus). Nyawa -1.';
    }
    check(R);
  } else if (m.t === 'sv' && R.phase === 'play' && R.stars > 0) {
    R.votes[id] = 1;
    if (R.players.every(p => R.votes[p])) {
      const out = []; R.players.forEach(p => { if (R.hands[p].length) out.push(R.hands[p].shift()); });
      R.stars--; R.phase = 'ready'; R.ready = {}; R.votes = {};
      R.msg = 'Shuriken! Kartu terbuang: ' + out.sort((a, b) => a - b).join(', ');
      check(R);
    }
  } else if (m.t === 'sc') delete R.votes[id];
}
function send(R) {
  R.touch = Date.now();
  const counts = {}; R.players.forEach(p => counts[p] = R.hands[p].length);
  R.roster.forEach(x => {
    if (!x.ws || x.ws.readyState !== 1) return;
    x.ws.send(JSON.stringify({ me: x.id, room: R.code, phase: R.phase, roster: R.roster.map(y => ({ id: y.id, name: y.name, on: !!y.ws })),
      players: R.players, lvl: R.lvl, max: R.max, lives: R.lives, stars: R.stars, pile: R.pile, counts, ready: R.ready,
      votes: R.votes, hand: R.hands[x.id] || [], msg: R.msg, err: R.err }));
  });
}
const clean = (s, n) => String(s || '').replace(/[^\w\- ]/g, '').trim().slice(0, n);

wss.on('connection', ws => {
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'ping') return;
    if (m.t === 'join') {
      const code = clean(m.room, 8).toUpperCase(), id = clean(m.pid, 24), name = clean(m.name, 12);
      if (code.length < 3 || !id || !name) return;
      let R = rooms.get(code); if (!R) rooms.set(code, R = mkRoom(code));
      let me = R.roster.find(x => x.id === id);
      if (me) { if (me.ws && me.ws !== ws) try { me.ws.close(); } catch {} me.ws = ws; me.name = name; }
      else if (R.roster.length < 8) R.roster.push(me = { id, name, ws });
      else return;
      ws.R = R; ws.pid = id; send(R); return;
    }
    if (ws.R) { act(ws.R, ws.pid, m); send(ws.R); }
  });
  ws.on('close', () => {
    const R = ws.R; if (!R) return;
    const me = R.roster.find(x => x.id === ws.pid);
    if (!me || me.ws !== ws) return;
    me.ws = null;
    if (R.phase === 'lobby' || R.phase === 'won' || R.phase === 'lost') R.roster = R.roster.filter(x => x !== me);
    send(R);
  });
});
setInterval(() => rooms.forEach((R, k) => {
  if (!R.roster.some(x => x.ws) && Date.now() - R.touch > 3600e3) rooms.delete(k);
}), 600e3);
srv.listen(PORT, () => console.log('The Mind jalan di port ' + PORT));
