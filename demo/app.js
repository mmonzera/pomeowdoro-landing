(() => {
const T = window.__TAURI__;
const { invoke } = T.core, { listen } = T.event;
const W = T.window, DPI = T.dpi || T.window;
const win = W.getCurrentWindow();
const $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

/* =============== settings =============== */
const defaults = { sound: true, cat: !reduce, autoPause: false, hideFs: true, monitor: 0, scale: 0.85, idleHide: true, lyrics: false };
let S = { ...defaults, ...JSON.parse(localStorage.getItem('p2s') || '{}') };
const saveS = () => localStorage.setItem('p2s', JSON.stringify(S));

/* =============== window / island state =============== */
// ukuran island (px desain) per tampilan; window dibuat pas supaya tidak menutupi tab browser
const BASE = { pill: [196, 40], open: [570, 340], thin: [70, 6] };
const MARGIN = 8;
const sizeOf = v => ({ w: Math.round(BASE[v][0] * S.scale) + MARGIN, h: Math.round(BASE[v][1] * S.scale) + MARGIN + (v === 'thin' ? 6 : 0) });
async function place(sz) {
  try {
    const ms = await W.availableMonitors();
    const m = ms[S.monitor] || await W.primaryMonitor();
    const sf = m.scaleFactor;
    const x = m.position.x / sf + (m.size.width / sf - sz.w) / 2, y = m.position.y / sf;
    await win.setSize(new DPI.LogicalSize(sz.w, sz.h));
    await win.setPosition(new DPI.LogicalPosition(Math.round(x), Math.round(y)));
  } catch (e) { console.error(e); }
}
const isl = $('island');
let expanded = false, popup = false, hoverT, leaveT, collT, idleT;
const isIdle = () => S.idleHide && !running && !popup && !expanded;   // musik saja (tanpa timer) tetap dianggap idle
async function settle() {            // atur ukuran island & window saat collapsed (pill biasa atau garis tipis saat idle)
  if (expanded) return;
  const thin = isIdle();
  if (thin) { isl.classList.add('thin'); await place(sizeOf('thin')); }
  else { await place(sizeOf('pill')); isl.classList.remove('thin'); }
}
async function expand() {
  clearTimeout(collT);
  if (expanded) return;
  expanded = true;
  await place(sizeOf('open'));
  isl.classList.remove('thin');
  isl.classList.add('open');
  arena.start();
}
function collapse() {
  if (window.__HERO_DEMO) return;                      // landing-page demo stays open
  if (!expanded || popup) return;
  expanded = false;
  isl.classList.remove('open');
  arena.stop();
  collT = setTimeout(settle, 320);
}
const root = document.documentElement;
root.addEventListener('mouseenter', () => { clearTimeout(leaveT); if (!expanded) hoverT = setTimeout(expand, 300); });
root.addEventListener('mouseleave', () => {
  clearTimeout(hoverT); clearTimeout(leaveT);
  if (expanded && !popup) leaveT = setTimeout(collapse, arena.awake() ? 2500 : 500);   // jeda lebih panjang kalau lagi main sama kucing
});
isl.addEventListener('click', () => { if (!expanded) expand(); });
function applyScale() { isl.style.zoom = S.scale; }

/* =============== sounds =============== */
function tone(seq, vol = .08, type = 'square') {
  if (!S.sound) return;
  try {
    const c = new AudioContext();
    seq.forEach(([f, t, d = .1]) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f;
      o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(vol, c.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + t + d);
      o.start(c.currentTime + t); o.stop(c.currentTime + t + d + .02);
    });
  } catch (e) {}
}
const beep = () => tone([[880, 0, .2], [880, .25, .2], [880, .5, .2]], .2, 'sine');

/* =============== cat sprites =============== */
const sleepImg = new Image(); sleepImg.src = 'assets/cat.png';
function drawSleep(cx) {
  cx.clearRect(0, 0, 320, 220);
  if (!sleepImg.naturalWidth) return;
  cx.drawImage(sleepImg, 0, 0);
  cx.globalCompositeOperation = 'source-in'; cx.fillStyle = CAT_COLOR; cx.fillRect(0, 0, 320, 220);
  cx.globalCompositeOperation = 'source-over';
}
sleepImg.onload = () => { pillCat.key = ''; pillCat.update(); };

/* ----- chaser: tidur -> bangun -> ngejar bola -> duduk -> balik tidur ----- */
function chaser(cv, { w = 96, bounds, minY = 0, speed = 230 }) {
  const cx = cv.getContext('2d'), h = w * 220 / 320;
  let b = bounds(), pos = { x: b.w / 2 - w / 2, y: b.h - h - 6 }, home = { ...pos }, tgt = null, face = 1,
    dist = 0, last = 0, key = '', st = 'sleep', stT = 0, leaveAt = 0, active = false, raf = 0, food = null;
  const draw = (p, o) => { const k = p + JSON.stringify(o); if (k !== key) { key = k; p === 'sleep' ? drawSleep(cx) : paintGrid(cx, poseGrid(p, o)); } };
  function loop(t) {
    if (!active) return;
    const dt = Math.min(.05, (t - last) / 1000 || 0); last = t; b = bounds();
    if (!S.cat) { draw('sleep'); raf = requestAnimationFrame(loop); place2(); return; }
    if (food && (st === 'sleep' || st === 'drowsy')) { st = 'wake'; stT = t; }          // bangun karena dikasih makan
    if (st === 'sleep') { draw('sleep'); face = 1; if (tgt) { st = 'wake'; stT = t; } }
    else if (st === 'wake') { const e = t - stT; draw(e < 500 ? 'sit' : 'stretch', { eyes: e < 250 ? 'closed' : 'open' }); if (e > 1000) st = 'idle'; }
    else if (st === 'eat') {
      const e = t - stT; draw('eat', { frame: Math.floor(e / 170) % 2 });
      if (food.onProgress) food.onProgress(Math.min(1, e / 1900));
      if (e > 1900) { const f = food; food = null; if (f.onDone) f.onDone(pos, face); st = 'idle'; leaveAt = t; }
    }
    else if (food) {                       // lari ke ikan
      const right = pos.x + w / 2 < food.x; face = right ? 1 : -1;
      const gx = Math.max(0, Math.min(b.w - w, right ? food.x - w * .76 : food.x - w * .24)), gy = Math.max(minY, Math.min(b.h - h, food.y - h * .55));
      const dx = gx - pos.x, dy = gy - pos.y, d = Math.hypot(dx, dy);
      if (d > 3) { const s = Math.min(d, Math.min(speed * 1.1, d * 4 + 40) * dt); pos.x += dx / d * s; pos.y += dy / d * s; dist += s; draw('run', { frame: Math.floor(dist / (w / 12)) % 4 }); }
      else { st = 'eat'; stT = t; if (food.onStart) food.onStart(); }
    }
    else {
      let goal = null;
      if (tgt) goal = { x: tgt.x - w / 2, y: tgt.y - h * .62 };
      else if (t - leaveAt > 2500) goal = { ...home };
      if (goal) {
        goal.x = Math.max(0, Math.min(b.w - w, goal.x)); goal.y = Math.max(minY, Math.min(b.h - h, goal.y));
        const dx = goal.x - pos.x, dy = goal.y - pos.y, d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 4) face = dx > 0 ? 1 : -1;
        if (d > (tgt ? w * .28 : 3)) {
          const s = Math.min(d, Math.min(speed, d * 4 + 30) * dt); pos.x += dx / d * s; pos.y += dy / d * s; dist += s;
          draw('run', { frame: Math.floor(dist / (w / 12)) % 4 });
        } else if (!tgt) { st = 'drowsy'; stT = t; }
        else draw('sit', { eyes: 'open', wag: Math.floor(t / 350) % 2 });
      } else draw('sit', { eyes: 'open', wag: Math.floor(t / 350) % 2 });
    }
    if (st === 'drowsy') { draw('sit', { eyes: 'closed' }); face = 1; if (tgt) { st = 'wake'; stT = t; } else if (t - stT > 900) { st = 'sleep'; key = ''; } }
    place2();
    raf = requestAnimationFrame(loop);
  }
  function place2() { cv.style.transform = `translate(${pos.x}px,${pos.y}px) scaleX(${face})`; }
  return {
    feed: f => { food = f; },
    set: p => { tgt = p; if (!p) leaveAt = performance.now(); },
    awake: () => st !== 'sleep',
    start() { if (active) return; active = true; last = performance.now(); key = ''; b = bounds(); home = { x: b.w / 2 - w / 2, y: b.h - h - 6 }; if (st === 'sleep') pos = { ...home }; raf = requestAnimationFrame(loop); },
    stop() { active = false; cancelAnimationFrame(raf); },
  };
}

/* arena (panel) */
// Dicentang saat layar "Session ended" baru muncul -> langsung lewati layar itu; kalau agak lama, tunggu layar hilang dulu
function requestFeed() {
  if (!popup) { feedCat(); return; }
  if (Date.now() - finAt < 2500) { hideFin(); feedCat(); }
  else setTimeout(feedCat, Math.max(0, finUntil - Date.now()) + 450);
}
function feedCat() {
  const L = $('lcd');
  if (!S.cat || !expanded) return;
  const fish = pixelCanvas(FISH_ROWS, 3, '#ffd37a'); fish.className = 'fish';
  const fx = 50 + Math.random() * Math.max(10, L.clientWidth - 150), fy = L.clientHeight - 34;
  fish.style.transform = `translate(${fx}px,-30px)`; L.append(fish); fish.getBoundingClientRect();
  fish.style.transition = 'transform .6s cubic-bezier(.3,1.5,.5,1)'; fish.style.transform = `translate(${fx}px,${fy}px)`;
  arena.feed({
    x: fx + 24, y: fy,
    onProgress: p => { fish.style.clipPath = `inset(0 ${Math.round(p * 100)}% 0 0)`; },
    onDone: (pos, face) => {
      fish.remove();
      showFin('Task done', 'Thank you!', "Let's take a rest before you continue");
      for (let i = 0; i < 3; i++) {
        const hrt = pixelCanvas(HEART_ROWS, 3, '#ff8aa0'); hrt.className = 'heart';
        hrt.style.left = (pos.x + (face === 1 ? 70 : 14) + i * 9 - 9) + 'px'; hrt.style.top = (pos.y + 4) + 'px'; hrt.style.animationDelay = (i * 160) + 'ms';
        L.append(hrt); setTimeout(() => hrt.remove(), 1700 + i * 160);
      }
    },
  });
}
const lcd = $('lcd'), ball = $('ball'), time = $('time');
const arena = chaser($('cat'), { w: 96, bounds: () => ({ w: lcd.clientWidth, h: lcd.clientHeight }), minY: 66 });
lcd.addEventListener('mousemove', e => {
  const r = lcd.getBoundingClientRect(), k = r.width / lcd.offsetWidth, x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
  const onTime = e.target === time;                          // di atas angka: bola hilang supaya bisa edit
  lcd.classList.toggle('play', !onTime);
  ball.style.display = onTime ? 'none' : 'block';
  ball.style.transform = `translate(${x - 6}px,${y - 6}px)`;
  arena.set({ x, y });
});
lcd.addEventListener('mouseleave', () => { ball.style.display = 'none'; lcd.classList.remove('play'); arena.set(null); });

/* =============== timer =============== */
let FOCUS = +localStorage.getItem('focus') || 25 * 60, BREAK = +localStorage.getItem('break') || 5 * 60;
let session = 1, isBreak = false, left = FOCUS, running = false, timer = null, endAt = 0, finUntil = 0, finAt = 0, finTimer = null;
const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

function render() {
  const f = fmt(left);
  $('ptime').textContent = f; time.value = f; time.readOnly = running;
  $('sess').textContent = isBreak ? 'Break' : 'Session';
  $('golabel').textContent = running ? 'Pause' : 'Start';
  $('goicon').innerHTML = running ? '<path d="M3 2h4v14H3zM11 2h4v14h-4z" fill="#fff"/>' : '<path d="M4 2.5v13a.8.8 0 0 0 1.2.7l10.5-6.5a.8.8 0 0 0 0-1.4L5.2 1.8A.8.8 0 0 0 4 2.5z" fill="#fff"/>';
  const total = isBreak ? BREAK : FOCUS;
  $('pbar').firstElementChild.style.width = (running || left !== total ? Math.round((1 - left / total) * 100) : 0) + '%';
  const task = focusText();
  $('ptask').textContent = running && !isBreak && task ? task : '';
  document.title = f + ' - Pomeowdoro';
  pillCat.update();
  if (!expanded) { clearTimeout(idleT); idleT = setTimeout(settle, 200); }
}

function showFin(a, b, c) {
  $('fa').textContent = a; $('fb').textContent = b; $('fc').textContent = c;
  $('fin').classList.add('on'); popup = true; finAt = Date.now(); finUntil = finAt + 4000;
  expand();
  clearTimeout(finTimer);
  finTimer = setTimeout(() => { $('fin').classList.remove('on'); popup = false; pillCat.update(); if (!isl.matches(':hover')) collapse(); }, 4000);
  pillCat.update();
}
function hideFin() { clearTimeout(finTimer); $('fin').classList.remove('on'); popup = false; pillCat.update(); }
$('fin').onclick = hideFin;

function tick() {
  left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
  if (left <= 0) {
    beep();
    if (isBreak) { showFin('', 'Break ended', ''); isBreak = false; session++; left = FOCUS; }
    else { bumpPomo(); showFin('', 'Session ended', ''); isBreak = true; left = BREAK; }
    endAt = Date.now() + left * 1000;
  }
  render();
}

let pausedMusic = false;
function musicWithTimer(on) {
  if (!S.autoPause) return;
  if (on) { if (pausedMusic) { invoke('media_cmd', { cmd: 'play' }); pausedMusic = false; } }
  else if (media.has && media.playing) { invoke('media_cmd', { cmd: 'pause' }); pausedMusic = true; }
}
function toggle() {
  running = !running;
  if (running) { endAt = Date.now() + left * 1000; timer = setInterval(tick, 250); }
  else clearInterval(timer);
  musicWithTimer(running);
  render();
}
$('go').onclick = () => { tone(running ? [[500, 0], [350, .08]] : [[600, 0], [900, .08]]); toggle(); };
$('reset').onclick = () => {
  tone([[700, 0], [500, .08], [350, .16]]);
  clearInterval(timer); const was = running; running = false; isBreak = false; session = 1; left = FOCUS;
  if (was) musicWithTimer(false);
  render();
};
time.onfocus = () => time.select();
time.onkeydown = e => { if (e.key === 'Enter') time.blur(); };
time.onblur = () => {
  if (running) { render(); return; }
  const m = time.value.trim().match(/^(\d{1,3})(?::(\d{1,2}))?$/);
  if (m) {
    const s = Math.min(+m[1] * 60 + (+m[2] || 0), 180 * 60);
    if (s > 0) { left = s; if (isBreak) { BREAK = s; localStorage.setItem('break', s); } else { FOCUS = s; localStorage.setItem('focus', s); } }
  }
  render();
};

/* =============== pill cat (reaksi per fase) =============== */
const pillCat = (() => {
  const cv = $('pcat'), cx = cv.getContext('2d');
  let key = '', frame = 0, iv = null, mode = '';
  function modeNow() {
    if (popup) return 'fin';
    if (running) return isBreak ? 'break' : 'focus';
    return 'idle';
  }
  function paint() {
    const m = modeNow(), f = frame++;
    let k = m, fn;
    if (!S.cat || m === 'idle') { k = 'idle'; fn = () => drawSleep(cx); }
    else if (m === 'focus') { k = 'focus' + (f >> 2) % 2; fn = () => paintGrid(cx, poseGrid('sit', { eyes: 'open', wag: (f >> 2) % 2 })); }
    else if (m === 'break') { k = 'break'; fn = () => paintGrid(cx, poseGrid('stretch', {})); }
    else { k = 'fin' + f % 4; fn = () => paintGrid(cx, poseGrid('run', { frame: f % 4 })); }
    if (k !== obj.key) { obj.key = k; fn(); }
    if (m === 'fin') cv.style.transform = `translateX(${Math.round(((f * 6) % 170))}px) `;   // lari kecil sepanjang pill
    else cv.style.transform = '';
  }
  function update() {
    const m = modeNow(); if (m === mode && iv !== null) { paint(); return; }
    mode = m; clearInterval(iv); iv = null;
    paint();
    if (!S.cat) return;
    if (m === 'fin') iv = setInterval(paint, 110);
    else if (m === 'focus') iv = setInterval(paint, 450);
  }
  const obj = { key: '', update };
  return obj;
})();

/* =============== tabs =============== */
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.pg').forEach(p => p.classList.toggle('on', p.id === 'pg-' + b.dataset.p));
});

/* =============== system media =============== */
let media = { has: false, title: '', artist: '', playing: false };
function renderMedia() {
  $('mnone').hidden = media.has; $('mhave').hidden = !media.has;
  $('mtitle').textContent = media.title || 'Now playing';
  $('martist').textContent = media.artist || '';
  $('mplayico').innerHTML = media.playing ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  const eq = $('peq'); eq.hidden = !media.has; eq.classList.toggle('on', media.playing);
  if (!expanded) { clearTimeout(idleT); idleT = setTimeout(settle, 200); }
}
let mediaAt = 0;
listen('media', e => { media = e.payload; mediaAt = performance.now(); renderMedia(); lyricsFor(media); });
$('mprev').onclick = () => invoke('media_cmd', { cmd: 'prev' });
$('mnext').onclick = () => invoke('media_cmd', { cmd: 'next' });
$('mplay').onclick = () => invoke('media_cmd', { cmd: 'play_pause' });

/* =============== settings UI =============== */
async function initSettings() {
  $('s-snd').checked = S.sound; $('s-cat').checked = S.cat; $('s-ap').checked = S.autoPause; $('s-idle').checked = S.idleHide; $('s-size').value = String(S.scale); $('s-fs').checked = S.hideFs;
  $('s-snd').onchange = e => { S.sound = e.target.checked; saveS(); };
  $('s-cat').onchange = e => { S.cat = e.target.checked; saveS(); pillCat.update(); };
  $('s-idle').onchange = e => { S.idleHide = e.target.checked; saveS(); settle(); };
  $('s-size').onchange = async e => { S.scale = +e.target.value; saveS(); applyScale(); await place(sizeOf('open')); };
  $('s-lyr').checked = S.lyrics;
  $('s-lyr').onchange = e => { S.lyrics = e.target.checked; saveS(); lastLyrKey = ''; lyricsFor(media); };
  $('s-ap').onchange = e => { S.autoPause = e.target.checked; saveS(); };
  $('s-fs').onchange = e => { S.hideFs = e.target.checked; saveS(); invoke('set_hide_fullscreen', { on: S.hideFs }); };
  try {
    $('s-auto').checked = await invoke('plugin:autostart|is_enabled');
    $('s-auto').onchange = e => invoke(e.target.checked ? 'plugin:autostart|enable' : 'plugin:autostart|disable');
  } catch (e) { $('s-auto').disabled = true; }
  try {
    const ms = await W.availableMonitors(), sel = $('s-mon');
    sel.innerHTML = ms.map((m, i) => `<option value="${i}">Monitor ${i + 1} (${m.size.width}×${m.size.height})</option>`).join('');
    sel.value = Math.min(S.monitor, ms.length - 1);
    sel.onchange = async e => { S.monitor = +e.target.value; saveS(); await (expanded ? place(sizeOf('open')) : settle()); };
  } catch (e) {}
  $('quit').onclick = () => invoke('quit_app');
  invoke('set_hide_fullscreen', { on: S.hideFs });
}

/* =============== tabs helper =============== */
function openTab(name) {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.p === name));
  document.querySelectorAll('.pg').forEach(p => p.classList.toggle('on', p.id === 'pg-' + name));
}

/* =============== task list (Today / All + deadline) =============== */
const ymd = d => d.toLocaleDateString('en-CA');
const todayStr = () => ymd(new Date());
let tasks = JSON.parse(localStorage.getItem('tasks') || '[]').map((t, i) => ({ id: t.id || Date.now() + i, pomos: 0, due: '', ...t }));
let curId = +localStorage.getItem('curTask') || 0;
let tview = localStorage.getItem('tview') || 'today', pendingDue = '';
const saveTasks = () => { localStorage.setItem('tasks', JSON.stringify(tasks)); localStorage.setItem('curTask', curId); };
const curTask = () => tasks.find(t => t.id === curId && !t.done) || null;
function focusText() { const t = curTask(); return t ? t.t : ''; }
function bumpPomo() { const t = curTask(); if (t) { t.pomos = (t.pomos || 0) + 1; saveTasks(); renderTasks(); } }
function dueInfo(due) {
  if (!due) return null;
  const t = todayStr(), tm = ymd(new Date(Date.now() + 864e5));
  if (due === t) return { label: 'Today', cls: 'today' };
  if (due === tm) return { label: 'Tomorrow', cls: '' };
  const label = new Date(due + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return { label: due < t ? 'Overdue · ' + label : label, cls: due < t ? 'od' : '' };
}
const inToday = t => t.due && t.due <= todayStr();      // due hari ini atau sudah lewat
const dp = $('tdp');
let dpFor = null;
function pickDate(forTask) {
  dpFor = forTask; dp.value = forTask ? forTask.due : pendingDue;
  try { dp.showPicker(); } catch (e) { dp.focus(); dp.click(); }
}
dp.onchange = () => {
  if (dpFor) { dpFor.due = dp.value; saveTasks(); renderTasks(); }
  else { pendingDue = dp.value; renderTaskAdd(); }
};
$('tdate').onclick = () => pickDate(null);
function renderTaskAdd() {
  const d = dueInfo(pendingDue), b = $('tdate');
  $('tdl').textContent = d ? d.label.replace('Overdue · ', '') : '';
  b.classList.toggle('set', !!pendingDue);
  b.title = pendingDue ? 'Deadline: ' + pendingDue + ' (click to change)' : (tview === 'today' ? 'Deadline (default: today)' : 'Set a deadline');
}
function renderTasks() {
  const ul = $('tlist'); ul.innerHTML = '';
  const cur = curTask();
  const open = tasks.filter(t => !t.done);
  $('cT').textContent = open.filter(inToday).length; $('cA').textContent = open.length;
  document.querySelectorAll('#tseg button').forEach(b => b.classList.toggle('on', b.dataset.v === tview));
  let list = tview === 'today' ? tasks.filter(inToday) : tasks.slice();
  list.sort((x, y) => (x.done - y.done) || ((x.due || '9999') < (y.due || '9999') ? -1 : (x.due || '9999') > (y.due || '9999') ? 1 : x.id - y.id));
  list.forEach(t => {
    const li = document.createElement('li');
    li.className = (t.done ? 'done ' : '') + (cur && cur.id === t.id ? 'cur' : '');
    const chk = document.createElement('button'); chk.className = 'chk'; chk.title = 'Done';
    chk.onclick = () => { t.done = !t.done; if (t.done && curId === t.id) curId = 0; saveTasks(); renderTasks(); render(); if (t.done) requestFeed(); };
    const tt = document.createElement('span'); tt.className = 'tt'; tt.textContent = t.t; tt.title = 'Focus on this task';
    tt.onclick = () => { if (t.done) return; curId = t.id; saveTasks(); renderTasks(); render(); };
    li.append(chk, tt);
    const di = dueInfo(t.due), dueBtn = document.createElement('button');
    dueBtn.className = 'due ' + (di ? di.cls : ''); dueBtn.textContent = di ? di.label : '+ date'; dueBtn.title = 'Change deadline';
    if (!di) dueBtn.classList.add('empty');               // muncul saat di-hover
    dueBtn.onclick = () => pickDate(t);
    li.append(dueBtn);
    if (t.pomos) { const pm = document.createElement('span'); pm.className = 'pm'; pm.textContent = '×' + t.pomos; pm.title = t.pomos + ' focus session(s)'; li.append(pm); }
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = 'Remove';
    x.onclick = () => { tasks = tasks.filter(z => z !== t); if (curId === t.id) curId = 0; saveTasks(); renderTasks(); render(); };
    li.append(x); ul.append(li);
  });
  $('tnone').textContent = tview === 'today' ? 'Nothing due today. Add what you want to get done today, then start a session for each one.' : 'No tasks yet.';
  $('tnone').hidden = list.length > 0;
  const n = $('curname'), c = curTask();
  n.textContent = c ? c.t : (open.length ? 'Pick a task on the left' : 'Add a task first');
  n.classList.toggle('none', !c);
  renderTaskAdd();
}
document.querySelectorAll('#tseg button').forEach(b => b.onclick = () => { tview = b.dataset.v; localStorage.setItem('tview', tview); renderTasks(); });
$('tin').onkeydown = e => {
  if (e.key !== 'Enter') return;
  const v = e.target.value.trim(); if (!v) return;
  const t = { id: Date.now(), t: v, done: false, pomos: 0, due: pendingDue || (tview === 'today' ? todayStr() : '') };
  tasks.push(t); if (!curTask()) curId = t.id;
  e.target.value = ''; pendingDue = ''; saveTasks(); renderTasks(); render();
};

/* =============== shelf: files + text snippets =============== */
let shelf = JSON.parse(localStorage.getItem('shelf') || '[]').map(x => typeof x === 'string' ? { k: 'file', v: x } : x);
const saveShelf = () => localStorage.setItem('shelf', JSON.stringify(shelf));
const dragIcon = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#8fe3a2'; g.beginPath(); g.roundRect(2, 2, 28, 28, 7); g.fill(); return c.toDataURL('image/png'); })();
function addText(txt) {
  txt = (txt || '').trim().slice(0, 5000); if (!txt) return;
  shelf = shelf.filter(x => !(x.k === 'text' && x.v === txt)); shelf.unshift({ k: 'text', v: txt });
  shelf = shelf.slice(0, 30); saveShelf(); renderShelf();
}
function renderShelf() {
  const ul = $('slist'); ul.innerHTML = '';
  shelf.forEach(it => {
    const li = document.createElement('li'), fi = document.createElement('span'), fn = document.createElement('span');
    fi.className = 'fi'; fn.className = 'fn';
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = 'Remove from shelf';
    x.onclick = e => { e.stopPropagation(); shelf = shelf.filter(z => z !== it); saveShelf(); renderShelf(); };
    if (it.k === 'text') {
      fi.classList.add('txt'); fi.textContent = 'Aa';
      fn.textContent = it.v.replace(/\s+/g, ' '); li.title = 'Click to copy\n\n' + it.v.slice(0, 300);
      li.onclick = async () => {
        try { await navigator.clipboard.writeText(it.v); li.classList.add('copied'); const old = fn.textContent; fn.textContent = 'Copied!'; setTimeout(() => { fn.textContent = old; li.classList.remove('copied'); }, 900); } catch (e) { console.error(e); }
      };
      li.style.cursor = 'pointer';
      li.append(fi, fn, x);
    } else {
      const p = it.v, name = p.split(/[\\/]/).pop(), ext = (name.includes('.') ? name.split('.').pop() : '').slice(0, 4);
      fi.textContent = ext || '•'; fn.textContent = name; li.title = p + '\nDrag out to move it somewhere. Double-click to open.';
      const rv = document.createElement('button'); rv.className = 'x'; rv.title = 'Show in folder'; rv.textContent = '↗';
      rv.onclick = e => { e.stopPropagation(); invoke('reveal_path', { path: p }); };
      li.ondblclick = () => invoke('open_path', { path: p });
      let sx = 0, sy = 0, down = false;
      li.onmousedown = e => { if (e.target.tagName === 'BUTTON') return; down = true; sx = e.clientX; sy = e.clientY; };
      li.onmousemove = e => {
        if (!down || Math.hypot(e.clientX - sx, e.clientY - sy) < 8) return;
        down = false;
        try { T.drag.startDrag({ item: [p], icon: dragIcon }); } catch (err) { console.error(err); }
      };
      li.onmouseup = li.onmouseleave = () => { down = false; };
      li.append(fi, fn, rv, x);
    }
    ul.append(li);
  });
  $('snone').hidden = shelf.length > 0;
}
$('sin').onkeydown = e => { if (e.key === 'Enter') { addText(e.target.value); e.target.value = ''; } };
$('sbtn').onclick = () => { addText($('sin').value); $('sin').value = ''; $('sin').focus(); };
document.addEventListener('paste', e => {               // Ctrl+V di tab Shelf (di luar kotak ketik) langsung disimpan
  if (!$('pg-shelf').classList.contains('on') || e.target.tagName === 'INPUT') return;
  const t = e.clipboardData && e.clipboardData.getData('text'); if (t) { e.preventDefault(); addText(t); }
});
try {
  T.webview.getCurrentWebview().onDragDropEvent(ev => {
    const p = ev.payload, box = $('sbox');
    if (p.type === 'enter' || p.type === 'over') { if (!expanded) { expand(); } openTab('shelf'); box.classList.add('over'); }
    else if (p.type === 'drop') {
      box.classList.remove('over');
      (p.paths || []).forEach(f => { if (!shelf.some(x => x.k === 'file' && x.v === f)) shelf.unshift({ k: 'file', v: f }); });
      shelf = shelf.slice(0, 30); saveShelf(); renderShelf();
    } else box.classList.remove('over');
  });
} catch (e) { console.error(e); }
/* =============== synced lyrics (LRCLIB) =============== */
let lyrics = null, lastLyrKey = '', lyrCache = {};
const clean = s => (s || '').replace(/\s*[\(\[][^\)\]]*(official|lyric|video|audio|remaster|visualizer)[^\)\]]*[\)\]]/ig, '').replace(/\s*-\s*topic$/i, '').trim();
function parseLrc(txt) {
  const out = [];
  txt.split('\n').forEach(line => {
    const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)], text = line.replace(/\[[^\]]*\]/g, '').trim();
    tags.forEach(m => out.push({ t: (+m[1] * 60 + parseFloat(m[2])) * 1000, s: text }));
  });
  return out.sort((a, b) => a.t - b.t);
}
let netErr = '';
const hasLrc = x => x && /\[\d+:\d+/.test(x.syncedLyrics || '');   // beberapa entri LRCLIB isinya cuma URL, bukan lirik
const norm = s => (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
async function lrcSearch(q, dur, accept) {
  try {
    const r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams({ q }));
    if (!r.ok) { netErr = 'HTTP ' + r.status; return null; }
    const list = (await r.json()).filter(x => hasLrc(x) && accept(x));
    if (!list.length) return null;
    if (dur) list.sort((x, y) => Math.abs(x.duration - dur) - Math.abs(y.duration - dur));   // paling mirip durasinya
    return list[0];
  } catch (e) { netErr = String(e); return null; }
}
async function findLyrics(m) {
  netErr = '';
  const title = clean(m.title), artist = clean(m.artist), dur = Math.round(m.dur_ms / 1000);
  try {                                                         // 1) pencarian tepat (cocok untuk Spotify)
    const q = new URLSearchParams({ track_name: title, artist_name: artist });
    if (dur) q.set('duration', dur);
    const r = await fetch('https://lrclib.net/api/get?' + q);
    if (r.ok) { const j = await r.json(); if (hasLrc(j)) return j; }
  } catch (e) { netErr = String(e); }
  // 2) judul YouTube sering "Channel - Artis - Judul": coba buang bagian depan satu per satu
  const parts = title.split(/\s+[-–—|]\s+/).map(s => s.trim()).filter(Boolean);
  const tries = [];
  for (let k = 0; k < parts.length; k++) tries.push(parts.slice(k).join(' '));
  tries.push(artist + ' ' + title);
  // hanya terima hasil yang judulnya DAN artisnya ada di info lagu, supaya tidak salah lirik
  const hay = ' ' + norm(m.title + ' ' + m.artist) + ' ';
  const accept = x => {
    const tn = norm(x.trackName), an = norm((x.artistName || '').split(/,|&| feat\.? /i)[0]);
    return tn.length >= 3 && an.length >= 2 && hay.includes(' ' + tn + ' ') && hay.includes(' ' + an + ' ');
  };
  for (const q of [...new Set(tries)]) { const r = await lrcSearch(q, dur, accept); if (r) return r; }
  return null;
}
async function lyricsFor(m) {
  const box = $('lyr');
  if (!S.lyrics || !m.has || !m.title) { lyrics = null; lastLyrKey = ''; box.hidden = true; return; }
  const key = m.artist + '|' + m.title + '|' + Math.round(m.dur_ms / 1000);
  if (key === lastLyrKey) return;
  lastLyrKey = key; lyrics = null; lastIdx = -9; box.hidden = false; showLyr(-2);
  if (key in lyrCache) { lyrics = lyrCache[key]; showLyr(-3); return; }
  const res = await findLyrics(m);
  if (key !== lastLyrKey) return;                 // lagu sudah ganti
  lyrics = res && res.syncedLyrics ? parseLrc(res.syncedLyrics) : [];
  lyrCache[key] = lyrics; showLyr(-3);
}function showLyr(idx) {
  const L = lyrics || [], set = (el, s) => { el.textContent = s || ''; };
  if (idx === -2) { set($('l0'), ''); set($('l1'), 'Looking for lyrics…'); set($('l2'), ''); return; }
  if (!L.length) { set($('l0'), ''); set($('l1'), netErr ? "Can't reach lrclib.net" : 'No synced lyrics found'); set($('l2'), netErr ? netErr.slice(0, 60) : ''); return; }
  set($('l0'), idx > 0 ? L[idx - 1].s : ''); set($('l1'), idx >= 0 ? L[idx].s || '♪' : ''); set($('l2'), L[idx + 1] ? L[idx + 1].s : '');
}
let lastIdx = -9;
setInterval(() => {
  if (!expanded || !S.lyrics || !lyrics || !lyrics.length || !media.has) return;
  const pos = media.pos_ms + (media.playing ? performance.now() - mediaAt : 0);
  let idx = -1; for (let i = 0; i < lyrics.length; i++) { if (lyrics[i].t <= pos + 150) idx = i; else break; }
  if (idx !== lastIdx) { lastIdx = idx; showLyr(idx); }
}, 250);

/* =============== boot =============== */
localStorage.removeItem('fed');
renderTasks(); renderShelf();
render(); renderMedia(); initSettings();
applyScale(); settle();
invoke('media_cmd', { cmd: 'refresh' });
})();
