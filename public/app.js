(() => {
  'use strict';

  const DEFAULTS = { focus: 25, short: 5, long: 15, interval: 4, autoNext: false, sound: true };
  const LABELS = { focus: 'Time to focus', short: 'Short break', long: 'Long break' };
  const CIRC = 2 * Math.PI * 112;

  const $ = (id) => document.getElementById(id);
  const el = {
    time: $('time'), label: $('label'), ring: $('ringFill'),
    start: $('startBtn'), reset: $('resetBtn'), skip: $('skipBtn'),
    settingsBtn: $('settingsBtn'), settings: $('settings'),
    doneCount: $('doneCount'), doneMins: $('doneMins'), resetStats: $('resetStats'), log: $('logBtn'), undo: $('undoBtn'),
    focusMin: $('focusMin'), shortMin: $('shortMin'), longMin: $('longMin'),
    interval: $('interval'), autoNext: $('autoNext'), soundOn: $('soundOn'),
    grid: $('grid'), streak: $('streak'),
  };

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    },
  };

  // Local calendar date, not UTC: a day here has to end at the user's
  // midnight, not at 07:00 for anyone east of Greenwich.
  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const today = () => dateKey(new Date());

  // `log` holds the minutes credited per session, newest last, so undo can
  // remove exactly what was added even if the focus length changed since.
  const emptyStats = () => ({ date: today(), count: 0, minutes: 0, log: [] });

  let settings = Object.assign({}, DEFAULTS, store.get('medpomo.settings', {}));
  let stats = store.get('medpomo.stats', emptyStats());
  if (stats.date !== today()) stats = emptyStats();
  if (!Array.isArray(stats.log)) stats.log = [];   // stats saved before undo existed

  // Per-day totals, kept forever: { 'YYYY-MM-DD': { c: sessions, m: minutes } }.
  let history = store.get('medpomo.history', {});
  if (!history || typeof history !== 'object') history = {};

  function saveDay() {
    if (stats.count > 0) history[stats.date] = { c: stats.count, m: stats.minutes };
    else delete history[stats.date];
    store.set('medpomo.history', history);
  }

  let mode = 'focus';
  let round = 0;              // completed focus sessions in the current cycle
  let duration = settings.focus * 60 * 1000;
  let remaining = duration;
  let endsAt = 0;
  let running = false;
  let ticker = null;

  /* ---------- rendering ---------- */

  function mmss(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = String(Math.floor(total / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function render() {
    const text = mmss(remaining);
    el.time.textContent = text;
    el.label.textContent = LABELS[mode];
    document.title = running ? `${text} · MedPOMO` : 'MedPOMO';
    const progress = duration > 0 ? 1 - remaining / duration : 0;
    el.ring.style.strokeDashoffset = String(CIRC * progress);
    el.start.textContent = running ? 'Pause' : (remaining < duration ? 'Resume' : 'Start');
    document.body.classList.toggle('break', mode !== 'focus');
    document.querySelectorAll('.mode').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    el.doneCount.textContent = stats.count === 1 ? '1 session' : `${stats.count} sessions`;
    el.doneMins.textContent = stats.minutes;
    el.undo.disabled = stats.count === 0;
    renderHeatmap();
  }

  /* ---------- heatmap ---------- */

  const WEEKS = 12;
  const DAY_MS = 86400000;

  // Minutes -> ramp step. One hue, light to dark; 0 stays on the empty tone.
  function level(minutes) {
    if (!minutes) return 0;
    if (minutes < 50) return 1;      // a session or two
    if (minutes < 100) return 2;
    if (minutes < 180) return 3;
    return 4;                        // a long day
  }

  const FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  // The grid runs in week columns ending with the current week, so the last
  // column always holds today.
  function gridStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // back to this Monday
    d.setDate(d.getDate() - (WEEKS - 1) * 7);
    return d;
  }

  function currentStreak() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // A day with nothing logged yet doesn't break a streak until it's over.
    if (!history[dateKey(d)]) d.setDate(d.getDate() - 1);
    let n = 0;
    while (history[dateKey(d)]) { n += 1; d.setDate(d.getDate() - 1); }
    return n;
  }

  function renderHeatmap() {
    const start = gridStart();
    const todayKey = today();
    const cells = el.grid.children;
    for (let i = 0; i < WEEKS * 7; i += 1) {
      const col = Math.floor(i / 7);
      const row = i % 7;
      const date = new Date(start.getTime() + (col * 7 + row) * DAY_MS);
      const key = dateKey(date);
      const day = history[key];
      const cell = cells[i];
      const future = date.getTime() > Date.now();
      cell.dataset.level = future ? 'none' : String(level(day ? day.m : 0));
      cell.classList.toggle('is-today', key === todayKey);
      cell.setAttribute('title', future ? '' : `${FMT.format(date)} · ${day ? `${day.c} session${day.c === 1 ? '' : 's'} · ${day.m} min` : 'nothing logged'}`);
    }
    const streak = currentStreak();
    el.streak.textContent = streak === 0 ? 'No streak yet' : `${streak}-day streak`;
  }

  function buildHeatmap() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < WEEKS * 7; i += 1) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      frag.appendChild(cell);
    }
    el.grid.appendChild(frag);
  }

  /* ---------- timer ---------- */

  function minutesFor(m) { return settings[m === 'focus' ? 'focus' : m]; }

  function setMode(next, autoStart) {
    mode = next;
    duration = minutesFor(next) * 60 * 1000;
    remaining = duration;
    stop();
    render();
    if (autoStart) start();
  }

  function tick() {
    remaining = endsAt - Date.now();
    if (remaining <= 0) { remaining = 0; render(); complete(); return; }
    render();
  }

  function start() {
    if (running || remaining <= 0) return;
    running = true;
    endsAt = Date.now() + remaining;
    ticker = setInterval(tick, 250);
    render();
  }

  function stop() {
    running = false;
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function pause() {
    if (!running) return;
    remaining = Math.max(0, endsAt - Date.now());
    stop();
    render();
  }

  function reset() {
    stop();
    remaining = duration;
    render();
  }

  // Credits a finished focus session — used both by the timer and by the
  // "+1" button, for sessions run on another timer.
  function addSession(minutes) {
    if (stats.date !== today()) stats = emptyStats();
    stats.count += 1;
    stats.minutes += minutes;
    stats.log.push(minutes);
    store.set('medpomo.stats', stats);
    saveDay();
    render();
  }

  // Removes the most recently credited session, for a mis-tapped "+1".
  function undoSession() {
    if (stats.count === 0) return;
    const minutes = stats.log.length ? stats.log.pop() : settings.focus;
    stats.count -= 1;
    stats.minutes = Math.max(0, stats.minutes - minutes);
    store.set('medpomo.stats', stats);
    saveDay();
    render();
  }

  function complete() {
    stop();
    chime();
    if (mode === 'focus') {
      round += 1;
      addSession(settings.focus);
      const long = round % settings.interval === 0;
      setMode(long ? 'long' : 'short', settings.autoNext);
    } else {
      setMode('focus', settings.autoNext);
    }
  }

  function skip() {
    stop();
    if (mode === 'focus') {
      round += 1;
      setMode(round % settings.interval === 0 ? 'long' : 'short', false);
    } else {
      setMode('focus', false);
    }
  }

  /* ---------- chime ---------- */

  let audioCtx = null;
  function chime() {
    if (!settings.sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      [880, 1174.7].forEach((freq, i) => {
        const t0 = audioCtx.currentTime + i * 0.18;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + 1);
      });
    } catch (_) {}
  }

  /* ---------- settings ---------- */

  function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function fillSettings() {
    el.focusMin.value = settings.focus;
    el.shortMin.value = settings.short;
    el.longMin.value = settings.long;
    el.interval.value = settings.interval;
    el.autoNext.checked = settings.autoNext;
    el.soundOn.checked = settings.sound;
  }

  function readSettings() {
    settings.focus = clampInt(el.focusMin.value, 1, 180, DEFAULTS.focus);
    settings.short = clampInt(el.shortMin.value, 1, 60, DEFAULTS.short);
    settings.long = clampInt(el.longMin.value, 1, 120, DEFAULTS.long);
    settings.interval = clampInt(el.interval.value, 2, 12, DEFAULTS.interval);
    settings.autoNext = el.autoNext.checked;
    settings.sound = el.soundOn.checked;
    store.set('medpomo.settings', settings);
    fillSettings();
    if (!running) {
      duration = minutesFor(mode) * 60 * 1000;
      remaining = duration;
    }
    render();
  }

  /* ---------- events ---------- */

  el.start.addEventListener('click', () => (running ? pause() : start()));
  el.reset.addEventListener('click', reset);
  el.skip.addEventListener('click', skip);

  document.querySelectorAll('.mode').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode, false));
  });

  el.settingsBtn.addEventListener('click', () => {
    const open = el.settings.hasAttribute('hidden');
    el.settings.toggleAttribute('hidden', !open);
    el.settingsBtn.setAttribute('aria-expanded', String(open));
  });

  [el.focusMin, el.shortMin, el.longMin, el.interval].forEach((input) => {
    input.addEventListener('change', readSettings);
  });
  el.autoNext.addEventListener('change', readSettings);
  el.soundOn.addEventListener('change', readSettings);

  // Brief confirmation on a button, with its own timer so two buttons
  // flashing at once don't cancel each other's restore.
  const flashTimers = new WeakMap();
  function flash(btn, mark, restore) {
    btn.textContent = mark;
    clearTimeout(flashTimers.get(btn));
    flashTimers.set(btn, setTimeout(() => { btn.textContent = restore; }, 900));
  }

  el.log.addEventListener('click', () => {
    addSession(settings.focus);
    flash(el.log, '\u2713', '+1');
  });

  el.undo.addEventListener('click', () => {
    if (el.undo.disabled) return;
    undoSession();
    flash(el.undo, '\u2713', '\u22121');
  });

  el.resetStats.addEventListener('click', () => {
    stats = emptyStats();
    store.set('medpomo.stats', stats);
    saveDay();          // clears today from the heatmap too
    render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); running ? pause() : start(); }
    if (e.key === 'r' || e.key === 'R') reset();
  });

  // Keep the display honest after the tab has been backgrounded.
  document.addEventListener('visibilitychange', () => { if (running) tick(); });

  buildHeatmap();
  fillSettings();
  setMode('focus', false);
})();
