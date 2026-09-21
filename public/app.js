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
    doneCount: $('doneCount'), doneMins: $('doneMins'), resetStats: $('resetStats'),
    focusMin: $('focusMin'), shortMin: $('shortMin'), longMin: $('longMin'),
    interval: $('interval'), autoNext: $('autoNext'), soundOn: $('soundOn'),
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

  const today = () => new Date().toISOString().slice(0, 10);

  let settings = Object.assign({}, DEFAULTS, store.get('medpomo.settings', {}));
  let stats = store.get('medpomo.stats', { date: today(), count: 0, minutes: 0 });
  if (stats.date !== today()) stats = { date: today(), count: 0, minutes: 0 };

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
    el.doneCount.textContent = stats.count;
    el.doneMins.textContent = stats.minutes;
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

  function complete() {
    stop();
    chime();
    if (mode === 'focus') {
      round += 1;
      stats.date = today();
      stats.count += 1;
      stats.minutes += settings.focus;
      store.set('medpomo.stats', stats);
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

  el.resetStats.addEventListener('click', () => {
    stats = { date: today(), count: 0, minutes: 0 };
    store.set('medpomo.stats', stats);
    render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); running ? pause() : start(); }
    if (e.key === 'r' || e.key === 'R') reset();
  });

  // Keep the display honest after the tab has been backgrounded.
  document.addEventListener('visibilitychange', () => { if (running) tick(); });

  fillSettings();
  setMode('focus', false);
})();
