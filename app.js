'use strict';

/* ====================================================================
 * 体調ノート
 * データはこの端末のブラウザ（localStorage）にだけ保存する。
 * ==================================================================== */

/* ---------- 定数 ---------- */
const STORE_KEY = 'taicho-note:v1';
const BP_SLOTS = [
  { key: 'morning', label: '朝' },
  { key: 'evening', label: '夜' },
];
const MED_SLOTS = [
  { key: 'morning', label: '朝' },
  { key: 'noon', label: '昼' },
  { key: 'evening', label: '夜' },
  { key: 'bedtime', label: '寝る前' },
];
const CONDITIONS = [
  { v: 1, face: '😣', label: 'とても悪い' },
  { v: 2, face: '🙁', label: '悪い' },
  { v: 3, face: '😐', label: 'ふつう' },
  { v: 4, face: '🙂', label: '良い' },
  { v: 5, face: '😄', label: 'とても良い' },
];
const SYMPTOMS = ['頭痛', 'めまい', 'だるさ', '息切れ', '動悸', 'むくみ', '胃腸の不調', '眠気', '肩こり', '関節の痛み'];
const EXERCISES = ['ウォーキング', 'ジョギング', '筋トレ', 'ストレッチ', 'ヨガ', '水泳', '自転車', 'その他'];
const MEALS = [
  { key: 'breakfast', label: '朝食', ph: '例：トースト、ヨーグルト、コーヒー' },
  { key: 'lunch', label: '昼食', ph: '例：焼き魚定食' },
  { key: 'dinner', label: '夕食', ph: '例：ごはん、豚汁、サラダ' },
  { key: 'snack', label: '間食・飲み物', ph: '例：みかん1個' },
];
const READING_FIELDS = [
  { key: 'sys', label: '最高血圧', short: '最高', unit: 'mmHg' },
  { key: 'dia', label: '最低血圧', short: '最低', unit: 'mmHg' },
  { key: 'pulse', label: '脈拍', short: '脈拍', unit: '回/分' },
  { key: 'resp', label: '呼吸数', short: '呼吸数', unit: '回/分' },
];
// 入力ミスを知らせるための「ありえそうな範囲」（医学的な基準ではない）
const PLAUSIBLE = {
  sys: [60, 260], dia: [30, 160], pulse: [30, 220], resp: [4, 60],
  weight: [20, 250], hours: [0, 24], minutes: [0, 1440], steps: [0, 100000],
};

/* ---------- ユーティリティ ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => toKey(new Date());
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const fmtDate = k => { const d = fromKey(k); return `${d.getMonth() + 1}月${d.getDate()}日(${WEEK[d.getDay()]})`; };
const shortDate = k => { const d = fromKey(k); return `${d.getMonth() + 1}/${d.getDate()}`; };
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const mean = arr => { const xs = arr.filter(isNum); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
const round = (v, d = 0) => (isNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
const fmt = (v, d = 0) => (isNum(v) ? round(v, d).toFixed(d) : '—');
const signed = (v, d = 1) => (isNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d) : '—');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function parseNum(s) {
  const t = String(s ?? '')
    .replace(/[０-９．，]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(',', '.')
    .trim();
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

/* ---------- データ ---------- */
function blankRecord(date) {
  return {
    date,
    bp: { morning: [{}], evening: [{}] },
    weight: null,
    condition: null,
    symptoms: [],
    conditionNote: '',
    meals: { breakfast: '', lunch: '', dinner: '', snack: '' },
    sleep: { bed: '', wake: '', hours: null },
    exercise: { types: [], minutes: null, steps: null },
    meds: {},
    memo: '',
  };
}
function normalizeRecord(r, date) {
  const b = blankRecord(date);
  const readings = list => (Array.isArray(list) && list.length ? list.slice(0, 2).map(x => ({ ...x })) : [{}]);
  return {
    ...b,
    ...r,
    date,
    bp: { morning: readings(r?.bp?.morning), evening: readings(r?.bp?.evening) },
    symptoms: Array.isArray(r?.symptoms) ? [...r.symptoms] : [],
    conditionNote: r?.conditionNote || '',
    memo: r?.memo || '',
    meals: { ...b.meals, ...r?.meals },
    sleep: { ...b.sleep, ...r?.sleep },
    exercise: { ...b.exercise, ...r?.exercise, types: Array.isArray(r?.exercise?.types) ? [...r.exercise.types] : [] },
    meds: { ...r?.meds },
  };
}
const hasReading = r => READING_FIELDS.some(f => isNum(r?.[f.key]));
const slotHas = (rec, slot) => (rec?.bp?.[slot] || []).some(hasReading);
function slotAvg(rec, slot) {
  const list = (rec?.bp?.[slot] || []).filter(hasReading);
  const out = { n: list.length };
  for (const f of READING_FIELDS) out[f.key] = mean(list.map(r => r[f.key]));
  return out;
}
function isEmptyRecord(r) {
  return !slotHas(r, 'morning') && !slotHas(r, 'evening')
    && !isNum(r.weight) && r.condition == null && !r.symptoms.length && !r.conditionNote.trim()
    && Object.values(r.meals).every(v => !String(v).trim())
    && !r.sleep.bed && !r.sleep.wake && !isNum(r.sleep.hours)
    && !r.exercise.types.length && !isNum(r.exercise.minutes) && !isNum(r.exercise.steps)
    && Object.values(r.meds).every(v => v == null)
    && !r.memo.trim();
}

function defaultSettings() {
  return { medSlots: ['morning', 'evening'], targetWeight: null, bpSys: 135, bpDia: 85, lastBackup: null };
}
function loadDb() {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { console.warn(e); }
  const records = {};
  for (const [k, r] of Object.entries(data.records || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) records[k] = normalizeRecord(r, k);
  }
  return { version: 1, records, settings: { ...defaultSettings(), ...data.settings } };
}
let db = loadDb();
let persistAsked = false;

function saveNow() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    toast('保存できませんでした（容量不足の可能性があります）');
    return false;
  }
  if (!persistAsked && navigator.storage?.persist) {
    persistAsked = true;
    navigator.storage.persist().catch(() => {});
  }
  return true;
}
const saveSoon = debounce(() => { if (saveNow()) toast('✓ 保存しました'); }, 600);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
window.addEventListener('pagehide', saveNow);

const sortedKeys = () => Object.keys(db.records).sort();

/* ---------- 画面の状態 ---------- */
const defaultBpSlot = () => (new Date().getHours() < 15 ? 'morning' : 'evening');
const state = {
  tab: 'record',
  date: todayKey(),
  bpSlot: defaultBpSlot(),
  range: 30,
  gBp: 'morning',
};
let cur = null; // 編集中の記録

/* ---------- 共通部品 ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}
const setHeader = html => { $('#appbar').innerHTML = html; };
const card = (title, icon, body, aside = '') =>
  `<section class="card"><h2 class="card-title"><span class="card-icon" aria-hidden="true">${icon}</span>${title}${aside ? `<span class="aside">${aside}</span>` : ''}</h2>${body}</section>`;
function numField(path, label, unit, val, { decimal = false, extra = '' } = {}) {
  const id = 'f-' + path.replace(/\./g, '-');
  return `<div class="field" data-field="${path}">
    <span class="field-label"><label for="${id}">${label}</label>${extra}</span>
    <span class="field-input"><input id="${id}" type="text" inputmode="${decimal ? 'decimal' : 'numeric'}" autocomplete="off"
      data-path="${path}" data-num value="${isNum(val) ? val : ''}"><span class="unit">${unit}</span></span>
  </div>`;
}
const chip = (group, value, active) =>
  `<button type="button" class="chip ${active ? 'active' : ''}" data-toggle="${group}" data-value="${esc(value)}" aria-pressed="${active}">${esc(value)}</button>`;

function render() {
  $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  const view = $('#view');
  if (state.tab === 'record') renderRecord(view);
  else if (state.tab === 'graph') renderGraphs(view);
  else if (state.tab === 'history') renderHistory(view);
  else renderSettings(view);
}

/* ====================================================================
 * 記録画面
 * ==================================================================== */
function renderRecord(view) {
  cur = db.records[state.date] || blankRecord(state.date);
  const today = todayKey();
  setHeader(`
    <button type="button" class="icon-btn" data-action="prev-day" aria-label="前の日">‹</button>
    <label class="date-btn">${fmtDate(state.date)}${state.date === today ? '<span class="badge">今日</span>' : ''}
      <input type="date" id="datePicker" value="${state.date}" max="${today}" aria-label="日付を選ぶ"></label>
    <button type="button" class="icon-btn" data-action="next-day" aria-label="次の日" ${state.date >= today ? 'disabled' : ''}>›</button>
    ${state.date !== today ? '<button type="button" class="today-btn" data-action="go-today">今日</button>' : ''}`);

  view.innerHTML = [
    bpCard(), weightCard(), conditionCard(), sleepCard(), mealsCard(), exerciseCard(), medsCard(), memoCard(),
    `<button type="button" class="danger-link" data-action="delete-day">この日の記録を削除</button>`,
  ].join('');
  updateDerived();
}

function bpCard() {
  const tabs = BP_SLOTS.map(s => `<button type="button" class="seg ${state.bpSlot === s.key ? 'active' : ''}" data-action="bp-slot" data-slot="${s.key}">
      ${s.label}の測定<span class="dot ${slotHas(cur, s.key) ? 'on' : ''}" data-dot="${s.key}"></span></button>`).join('');
  const panels = BP_SLOTS.map(s => `<div data-panel="${s.key}" ${state.bpSlot === s.key ? '' : 'hidden'}>${bpPanel(s.key)}</div>`).join('');
  return card('血圧・脈拍・呼吸数', '🩺', `<div class="segmented">${tabs}</div>${panels}`, '各2回まで');
}
function bpPanel(slot) {
  const list = cur.bp[slot];
  let html = list.map((r, i) => readingBlock(slot, i, r)).join('');
  if (list.length < 2) html += `<button type="button" class="add-btn" data-action="add-reading" data-slot="${slot}">＋ 2回目を記録する</button>`;
  return html + `<div class="avg" data-avg="${slot}"></div>`;
}
function readingBlock(slot, i, r) {
  const p = `bp.${slot}.${i}`;
  const counter = `<button type="button" class="link-btn" data-action="count-resp" data-path="${p}.resp">はかる</button>`;
  return `<div class="reading">
    <div class="reading-head">
      <span class="reading-title">${i + 1}回目</span>
      <input type="time" data-path="${p}.time" value="${esc(r.time || '')}" aria-label="${i + 1}回目の測定時刻">
      <button type="button" class="mini" data-action="now" data-path="${p}.time">今</button>
      ${i > 0 ? `<button type="button" class="mini ghost" data-action="remove-reading" data-slot="${slot}" aria-label="2回目を削除">✕</button>` : ''}
    </div>
    <div class="grid2">
      ${numField(`${p}.sys`, '最高血圧', 'mmHg', r.sys)}
      ${numField(`${p}.dia`, '最低血圧', 'mmHg', r.dia)}
      ${numField(`${p}.pulse`, '脈拍', '回/分', r.pulse)}
      ${numField(`${p}.resp`, '呼吸数', '回/分', r.resp, { extra: counter })}
    </div>
  </div>`;
}
function weightCard() {
  return card('体重', '⚖️', `<div class="grid2">${numField('weight', '体重', 'kg', cur.weight, { decimal: true })}</div>
    <div class="hint" data-hint="weight"></div>`);
}
function conditionCard() {
  const faces = CONDITIONS.map(c => `<button type="button" class="face ${cur.condition === c.v ? 'active' : ''}" data-set="condition" data-value="${c.v}" aria-pressed="${cur.condition === c.v}">
      <span class="emoji" aria-hidden="true">${c.face}</span>${c.label}</button>`).join('');
  return card('体調', '🌤️', `<div class="faces">${faces}</div>
    <div class="sub-label">気になる症状</div>
    <div class="chips">${SYMPTOMS.map(s => chip('symptoms', s, cur.symptoms.includes(s))).join('')}</div>
    <input type="text" class="text-input" data-path="conditionNote" value="${esc(cur.conditionNote)}" placeholder="体調メモ（例：午後から頭が重い）">`);
}
function sleepCard() {
  return card('睡眠', '🌙', `<div class="grid3">
      <div class="field"><span class="field-label"><label for="f-bed">就寝</label></span><input id="f-bed" type="time" data-path="sleep.bed" value="${esc(cur.sleep.bed)}"></div>
      <div class="field"><span class="field-label"><label for="f-wake">起床</label></span><input id="f-wake" type="time" data-path="sleep.wake" value="${esc(cur.sleep.wake)}"></div>
      ${numField('sleep.hours', '睡眠時間', '時間', cur.sleep.hours, { decimal: true })}
    </div>
    <div class="hint">前の晩から、この日の朝までの睡眠です。就寝・起床を入れると睡眠時間は自動で計算されます。</div>`);
}
function mealsCard() {
  return card('食事', '🍚', MEALS.map(m => `<div class="meal"><label for="f-${m.key}">${m.label}</label>
    <textarea id="f-${m.key}" rows="2" data-path="meals.${m.key}" placeholder="${m.ph}">${esc(cur.meals[m.key])}</textarea></div>`).join(''));
}
function exerciseCard() {
  return card('運動', '🚶', `<div class="chips">${EXERCISES.map(x => chip('exercise.types', x, cur.exercise.types.includes(x))).join('')}</div>
    <div class="grid2" style="margin-top:12px">
      ${numField('exercise.minutes', '運動時間', '分', cur.exercise.minutes)}
      ${numField('exercise.steps', '歩数', '歩', cur.exercise.steps)}
    </div>`);
}
function medsCard() {
  const slots = MED_SLOTS.filter(s => db.settings.medSlots.includes(s.key));
  const body = slots.length
    ? slots.map(s => `<div class="med-row"><span class="med-label">${s.label}</span><div class="med-btns">
        <button type="button" class="med-btn ok ${cur.meds[s.key] === true ? 'active' : ''}" data-med="${s.key}" data-value="true">✓ 飲んだ</button>
        <button type="button" class="med-btn ng ${cur.meds[s.key] === false ? 'active' : ''}" data-med="${s.key}" data-value="false">✕ 飲んでいない</button>
      </div></div>`).join('') + '<div class="hint">もう一度押すと未記録に戻ります。</div>'
    : '<p class="muted small" style="margin:0">服薬のタイミングが選ばれていません。設定タブで選べます。</p>';
  return card('服薬', '💊', body);
}
function memoCard() {
  return card('メモ', '📝', `<textarea rows="3" data-path="memo" placeholder="通院・気づいたことなど">${esc(cur.memo)}</textarea>`);
}

/** 入力に応じて変わる表示（平均・前回比・範囲外の警告）を更新する */
function updateDerived() {
  const { bpSys, bpDia } = db.settings;
  for (const s of BP_SLOTS) {
    const dot = $(`[data-dot="${s.key}"]`);
    if (dot) dot.classList.toggle('on', slotHas(cur, s.key));
    const el = $(`[data-avg="${s.key}"]`);
    if (!el) continue;
    const a = slotAvg(cur, s.key);
    if (!a.n) { el.innerHTML = ''; continue; }
    const bpKnown = isNum(a.sys) && isNum(a.dia);
    const over = (isNum(a.sys) && isNum(bpSys) && a.sys >= bpSys) || (isNum(a.dia) && isNum(bpDia) && a.dia >= bpDia);
    el.innerHTML = `<span class="muted">${a.n >= 2 ? '2回の平均' : s.label + 'の値'}</span>
      ${bpKnown ? `<strong>${fmt(a.sys)}/${fmt(a.dia)}</strong><span class="unit">mmHg</span>` : ''}
      ${isNum(a.pulse) ? `<span>脈拍 <b>${fmt(a.pulse)}</b></span>` : ''}
      ${isNum(a.resp) ? `<span>呼吸 <b>${fmt(a.resp)}</b></span>` : ''}
      ${over ? '<span class="tag-warn">基準線以上</span>' : ''}`;
  }

  const hint = $('[data-hint="weight"]');
  if (hint) {
    const parts = [];
    if (isNum(cur.weight)) {
      const prevKey = sortedKeys().filter(k => k < cur.date && isNum(db.records[k].weight)).pop();
      if (prevKey) parts.push(`前回（${shortDate(prevKey)}）より ${signed(cur.weight - db.records[prevKey].weight)} kg`);
      const t = db.settings.targetWeight;
      if (isNum(t)) parts.push(cur.weight > t ? `目標まであと ${(cur.weight - t).toFixed(1)} kg` : '目標体重を達成しています');
    }
    hint.textContent = parts.join('　/　');
  }

  $$('[data-field]').forEach(f => {
    const key = f.dataset.field.split('.').pop();
    const range = PLAUSIBLE[key];
    const v = getPath(cur, f.dataset.field);
    f.classList.toggle('out', !!range && isNum(v) && (v < range[0] || v > range[1]));
  });
}

/** 編集中の記録を保存対象に反映する */
function commit() {
  if (isEmptyRecord(cur)) delete db.records[cur.date];
  else { cur.updatedAt = Date.now(); db.records[cur.date] = cur; }
  saveSoon();
}

function sleepHours(bed, wake) {
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let min = (wh * 60 + wm) - (bh * 60 + bm);
  if (min <= 0) min += 24 * 60;
  return round(min / 60, 1);
}

function onRecordInput(el) {
  const path = el.dataset.path;
  const value = 'num' in el.dataset ? parseNum(el.value) : el.value;
  setPath(cur, path, value);

  // 血圧などを入れたとき、今日の記録で時刻が空なら現在時刻を入れる
  const m = path.match(/^bp\.(\w+)\.(\d)\.(sys|dia|pulse|resp)$/);
  if (m && state.date === todayKey()) {
    const r = cur.bp[m[1]][m[2]];
    if (!r.time && isNum(value)) {
      r.time = nowTime();
      const t = $(`input[data-path="bp.${m[1]}.${m[2]}.time"]`);
      if (t) t.value = r.time;
    }
  }
  if (path === 'sleep.bed' || path === 'sleep.wake') {
    const h = sleepHours(cur.sleep.bed, cur.sleep.wake);
    if (h != null) {
      cur.sleep.hours = h;
      const f = $('input[data-path="sleep.hours"]');
      if (f) f.value = h;
    }
  }
  updateDerived();
  commit();
}

function rerenderBpPanel(slot) {
  const panel = $(`[data-panel="${slot}"]`);
  if (panel) panel.innerHTML = bpPanel(slot);
  updateDerived();
}

/* ---------- 呼吸数カウンター ---------- */
const resp = { path: null, running: false, count: 0, timer: null, result: null };
function openRespCounter(path) {
  Object.assign(resp, { path, running: false, count: 0, result: null });
  clearInterval(resp.timer);
  $('#respTap').textContent = '開始';
  $('#respTap').classList.remove('running');
  $('#respTime').textContent = '30';
  $('#respCount').textContent = '0';
  $('#respApply').disabled = true;
  $('#respDialog').showModal();
}
function onRespTap() {
  const btn = $('#respTap');
  if (resp.running) {
    resp.count++;
    $('#respCount').textContent = resp.count;
    if (navigator.vibrate) navigator.vibrate(15);
    return;
  }
  Object.assign(resp, { running: true, count: 0, result: null });
  $('#respApply').disabled = true;
  $('#respCount').textContent = '0';
  btn.textContent = 'タップ';
  btn.classList.add('running');
  const start = Date.now();
  resp.timer = setInterval(() => {
    const left = Math.max(0, 30 - Math.floor((Date.now() - start) / 1000));
    $('#respTime').textContent = left;
    if (left === 0) {
      clearInterval(resp.timer);
      resp.running = false;
      resp.result = resp.count * 2;
      btn.classList.remove('running');
      btn.textContent = `${resp.result} 回/分`;
      $('#respApply').disabled = false;
    }
  }, 200);
}
function closeResp() {
  clearInterval(resp.timer);
  resp.running = false;
  $('#respDialog').close();
}
function applyResp() {
  if (resp.result == null || !resp.path) return;
  const input = $(`input[data-path="${resp.path}"]`);
  closeResp();
  if (input) {
    input.value = resp.result;
    onRecordInput(input);
  }
}

/* ====================================================================
 * グラフ画面
 * ==================================================================== */
const charts = {}; // id -> 描画設定

function rangeDates() {
  const today = todayKey();
  let start;
  if (state.range === 'all') start = sortedKeys()[0] || addDays(today, -29);
  else start = addDays(today, -(state.range - 1));
  if (start > today) start = today;
  const out = [];
  for (let k = start; k <= today; k = addDays(k, 1)) out.push(k);
  return out;
}

function renderGraphs(view) {
  setHeader('<h1>グラフ</h1>');
  if (!sortedKeys().length) {
    view.innerHTML = `<div class="empty"><div class="big">📈</div><p>まだ記録がありません。<br>記録するとここに推移が表示されます。</p>
      <button type="button" class="btn" data-tab="record">記録をつける</button>
      <button type="button" class="btn ghost" data-action="demo">お試しデータで見てみる</button></div>`;
    return;
  }
  const dates = rangeDates();
  const recs = dates.map(d => db.records[d]);
  const { bpSys, bpDia, targetWeight } = db.settings;
  const slotSeries = (slot, f) => recs.map(r => (r ? round(slotAvg(r, slot)[f], 1) : null));
  const val = fn => recs.map(r => (r ? (isNum(fn(r)) ? fn(r) : null) : null));

  // 血圧
  let bpSeries;
  if (state.gBp === 'both') {
    bpSeries = [
      { name: '朝 最高', color: 'var(--sys)', values: slotSeries('morning', 'sys') },
      { name: '夜 最高', color: 'var(--sys)', dash: true, values: slotSeries('evening', 'sys') },
      { name: '朝 最低', color: 'var(--dia)', values: slotSeries('morning', 'dia') },
      { name: '夜 最低', color: 'var(--dia)', dash: true, values: slotSeries('evening', 'dia') },
    ];
  } else {
    bpSeries = [
      { name: '最高', color: 'var(--sys)', values: slotSeries(state.gBp, 'sys') },
      { name: '最低', color: 'var(--dia)', values: slotSeries(state.gBp, 'dia') },
    ];
  }
  charts.bp = {
    label: '血圧の推移', dates, unit: 'mmHg', series: bpSeries,
    refs: [{ value: bpSys, color: 'var(--sys)', label: `基準 ${bpSys}` }, { value: bpDia, color: 'var(--dia)', label: `基準 ${bpDia}` }],
  };
  charts.pulse = {
    label: '脈拍の推移', dates, unit: '回/分',
    series: [
      { name: '朝', color: 'var(--pulse)', values: slotSeries('morning', 'pulse') },
      { name: '夜', color: 'var(--pulse)', dash: true, values: slotSeries('evening', 'pulse') },
    ],
  };
  charts.resp = {
    label: '呼吸数の推移', dates, unit: '回/分',
    series: [
      { name: '朝', color: 'var(--resp)', values: slotSeries('morning', 'resp') },
      { name: '夜', color: 'var(--resp)', dash: true, values: slotSeries('evening', 'resp') },
    ],
  };
  charts.weight = {
    label: '体重の推移', dates, unit: 'kg', decimals: 1,
    series: [{ name: '体重', color: 'var(--weight)', values: val(r => r.weight) }],
    refs: isNum(targetWeight) ? [{ value: targetWeight, color: 'var(--weight)', label: `目標 ${targetWeight}` }] : [],
  };
  charts.cond = {
    label: '体調の推移', dates, unit: '', yMin: 1, yMax: 5, ticks: [1, 2, 3, 4, 5],
    tickLabel: t => CONDITIONS[t - 1]?.face || '',
    valueLabel: v => { const c = CONDITIONS[Math.round(v) - 1]; return c ? `${c.face} ${c.label}` : '—'; },
    series: [{ name: '体調', color: 'var(--cond)', values: val(r => r.condition) }],
  };
  charts.sleep = {
    label: '睡眠時間', dates, unit: '時間', type: 'bar', decimals: 1,
    series: [{ name: '睡眠', color: 'var(--sleep)', values: val(r => r.sleep.hours) }],
  };
  charts.ex = {
    label: '運動時間', dates, unit: '分', type: 'bar',
    series: [{ name: '運動', color: 'var(--ex)', values: val(r => r.exercise.minutes) }],
  };
  const medSlots = MED_SLOTS.filter(s => db.settings.medSlots.includes(s.key));
  charts.meds = { label: '服薬の記録', dates, type: 'meds', slots: medSlots, recs };

  const legend = id => `<div class="legend">${charts[id].series.map(s =>
    `<span><i class="${charts[id].type === 'bar' ? 'box' : ''} ${s.dash ? 'dash' : ''}" style="${charts[id].type === 'bar' ? 'background' : 'border-color'}:${s.color}"></i>${s.name}</span>`).join('')}</div>`;
  const chartCard = (id, title, icon, extra = '') =>
    card(title, icon, `${extra}${charts[id].type === 'meds' ? '' : legend(id)}<div class="chart" data-chart="${id}"></div>`);
  const ranges = [[7, '1週間'], [30, '1か月'], [90, '3か月'], ['all', '全期間']];
  const gBpTabs = [['morning', '朝'], ['evening', '夜'], ['both', '朝と夜']];

  view.innerHTML = `
    <div class="range-bar"><div class="segmented">${ranges.map(([v, l]) =>
      `<button type="button" class="seg ${state.range === v ? 'active' : ''}" data-range="${v}">${l}</button>`).join('')}</div></div>
    ${statsHtml(dates)}
    ${chartCard('bp', '血圧', '🩺', `<div class="segmented small">${gBpTabs.map(([v, l]) =>
      `<button type="button" class="seg ${state.gBp === v ? 'active' : ''}" data-gbp="${v}">${l}</button>`).join('')}</div>`)}
    ${chartCard('pulse', '脈拍', '💓')}
    ${chartCard('resp', '呼吸数', '🌬️')}
    ${chartCard('weight', '体重', '⚖️')}
    ${chartCard('cond', '体調', '🌤️')}
    ${chartCard('sleep', '睡眠時間', '🌙')}
    ${chartCard('ex', '運動時間', '🚶')}
    ${medSlots.length ? chartCard('meds', '服薬', '💊', `<div class="legend">
      <span><i class="box" style="background:var(--ok)"></i>飲んだ</span>
      <span><i class="box" style="background:var(--ng)"></i>飲んでいない</span>
      <span><i class="box" style="background:var(--line)"></i>未記録</span></div>`) : ''}
    <p class="muted small" style="text-align:center">グラフをタップするとその日の値が表示されます</p>`;
  drawAllCharts();
}

function statsHtml(dates) {
  const recs = dates.map(d => db.records[d]).filter(Boolean);
  const bpStat = slot => {
    const days = recs.map(r => slotAvg(r, slot)).filter(a => isNum(a.sys) && isNum(a.dia));
    return days.length ? { sys: mean(days.map(a => a.sys)), dia: mean(days.map(a => a.dia)), n: days.length } : null;
  };
  const tile = (label, value, sub) => `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`;
  const bpTile = (slot, label) => {
    const s = bpStat(slot);
    return tile(`${label}の血圧（平均）`, s ? `${fmt(s.sys)}/${fmt(s.dia)}<small>mmHg</small>` : '—', s ? `${s.n}日分` : '記録なし');
  };
  const ws = recs.filter(r => isNum(r.weight));
  const wLast = ws.length ? ws[ws.length - 1].weight : null;
  const wDelta = ws.length >= 2 ? wLast - ws[0].weight : null;
  const sleeps = recs.map(r => r.sleep.hours).filter(isNum);
  const exMin = recs.map(r => r.exercise.minutes).filter(isNum);
  const exDays = recs.filter(r => (isNum(r.exercise.minutes) && r.exercise.minutes > 0) || r.exercise.types.length).length;
  let taken = 0, total = 0;
  for (const r of recs) {
    for (const s of db.settings.medSlots) {
      if (r.meds[s] === true) { taken++; total++; } else if (r.meds[s] === false) total++;
    }
  }
  return `<div class="stats">
    ${bpTile('morning', '朝')}
    ${bpTile('evening', '夜')}
    ${tile('体重（最新）', isNum(wLast) ? `${fmt(wLast, 1)}<small>kg</small>` : '—', isNum(wDelta) ? `期間中 ${signed(wDelta)} kg` : ws.length ? '1日分' : '記録なし')}
    ${tile('睡眠（平均）', sleeps.length ? `${fmt(mean(sleeps), 1)}<small>時間</small>` : '—', sleeps.length ? `${sleeps.length}日分` : '記録なし')}
    ${tile('運動（合計）', exMin.length ? `${fmt(exMin.reduce((a, b) => a + b, 0))}<small>分</small>` : '—', exDays ? `${exDays}日 運動` : '記録なし')}
    ${tile('服薬', total ? `${Math.round(taken / total * 100)}<small>%</small>` : '—', total ? `${total}回中 ${taken}回 飲んだ` : '記録なし')}
  </div>`;
}

function drawAllCharts() {
  $$('[data-chart]').forEach(el => {
    const cfg = charts[el.dataset.chart];
    if (cfg.type === 'meds') drawMedGrid(el, cfg);
    else drawChart(el, cfg);
  });
}
window.addEventListener('resize', debounce(() => { if (state.tab === 'graph') drawAllCharts(); }, 150));

function niceTicks(lo, hi, count = 4) {
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 1e6; v += step) out.push(round(v, 6));
  return out;
}

function chartFrame(el, n, H) {
  const W = Math.max(260, Math.round(el.clientWidth));
  const m = { l: 34, r: 10, t: 12, b: 22 };
  const band = (W - m.l - m.r) / n;
  return { W, H, m, band, xAt: i => m.l + band * (i + 0.5) };
}
function xLabels(f, dates) {
  const n = dates.length;
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((f.W - f.m.l - f.m.r) / 52))));
  let s = '';
  for (let i = n - 1; i >= 0; i -= step) {
    s += `<text x="${f.xAt(i)}" y="${f.H - 6}" text-anchor="middle">${shortDate(dates[i])}</text>`;
  }
  return s;
}

function drawChart(el, cfg) {
  const { dates, series } = cfg;
  const n = dates.length;
  const vals = series.flatMap(s => s.values.filter(isNum));
  if (!vals.length) { el.innerHTML = '<p class="nodata">この期間の記録はありません</p>'; return; }
  const f = chartFrame(el, n, cfg.height || 180);
  const { W, H, m, band, xAt } = f;
  const isBar = cfg.type === 'bar';

  let lo = cfg.yMin ?? Math.min(...vals);
  let hi = cfg.yMax ?? Math.max(...vals);
  for (const r of cfg.refs || []) if (isNum(r.value) && cfg.yMin == null) { lo = Math.min(lo, r.value); hi = Math.max(hi, r.value); }
  if (isBar) lo = 0;
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  const ticks = cfg.ticks || niceTicks(isBar ? 0 : lo - span * 0.05, hi + span * 0.05, 5);
  lo = ticks[0]; hi = ticks[ticks.length - 1];
  const yAt = v => m.t + (H - m.t - m.b) * (1 - (v - lo) / (hi - lo));
  const d = cfg.decimals || 0;
  const tickDecimals = Math.min(2, Math.max(0, -Math.floor(Math.log10(ticks[1] - ticks[0]) + 1e-9)));

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${cfg.label}">`;
  for (const t of ticks) {
    s += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${yAt(t)}" y2="${yAt(t)}"/>`;
    s += `<text x="${m.l - 6}" y="${yAt(t)}" dy="0.35em" text-anchor="end">${cfg.tickLabel ? cfg.tickLabel(t) : t.toFixed(tickDecimals)}</text>`;
  }
  s += xLabels(f, dates);
  for (const r of cfg.refs || []) {
    if (!isNum(r.value)) continue;
    const y = yAt(r.value);
    s += `<line class="ref" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" style="stroke:${r.color}"/>`;
    s += `<text class="reflab" x="${W - m.r}" y="${y - 4}" text-anchor="end" style="fill:${r.color}">${r.label}</text>`;
  }
  s += `<line class="guide" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}"/>`;

  if (isBar) {
    const bw = Math.max(2, Math.min(band * 0.7, 18) / series.length);
    series.forEach((ser, si) => ser.values.forEach((v, i) => {
      if (!isNum(v) || v <= 0) return;
      const x = xAt(i) - (bw * series.length) / 2 + bw * si;
      const y = yAt(v);
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${yAt(0) - y}" rx="${Math.min(3, bw / 2)}" style="fill:${ser.color}"/>`;
    }));
  } else {
    const r = n > 60 ? 1.6 : n > 14 ? 2.3 : 3.4;
    for (const ser of series) {
      const pts = ser.values.map((v, i) => (isNum(v) ? [xAt(i), yAt(v)] : null)).filter(Boolean);
      if (pts.length > 1) {
        s += `<path class="series ${ser.dash ? 'dash' : ''}" style="stroke:${ser.color}" d="M${pts.map(p => p.map(x => x.toFixed(1)).join(',')).join('L')}"/>`;
      }
      for (const [x, y] of pts) s += `<circle class="pt" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${ser.dash ? r * 0.85 : r}" style="fill:${ser.color}"/>`;
    }
  }
  s += '</svg>';

  attachTip(el, s, f, dates, i => series.map(ser => {
    const v = ser.values[i];
    const text = !isNum(v) ? '—' : cfg.valueLabel ? cfg.valueLabel(v) : `${fmt(v, d)}${cfg.unit ? ' ' + cfg.unit : ''}`;
    return `<div><i style="background:${ser.color}"></i>${ser.name} <b>${text}</b></div>`;
  }).join(''));
}

function drawMedGrid(el, cfg) {
  const { dates, slots, recs } = cfg;
  const n = dates.length;
  const rowH = 22;
  const f = chartFrame(el, n, slots.length * rowH + 30);
  f.m.t = 4;
  const { W, H, m, band, xAt } = f;
  const cw = Math.max(1, Math.min(band - (band > 6 ? 2 : 0.5), 18));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${cfg.label}">`;
  s += `<line class="guide" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}"/>`;
  slots.forEach((slot, row) => {
    const y = m.t + row * rowH;
    s += `<text x="${m.l - 6}" y="${y + rowH / 2}" dy="0.35em" text-anchor="end">${slot.label}</text>`;
    recs.forEach((r, i) => {
      const v = r?.meds?.[slot.key];
      const color = v === true ? 'var(--ok)' : v === false ? 'var(--ng)' : 'var(--line)';
      s += `<rect x="${(xAt(i) - cw / 2).toFixed(1)}" y="${y + 3}" width="${cw.toFixed(1)}" height="${rowH - 6}" rx="${Math.min(3, cw / 3)}" style="fill:${color}"/>`;
    });
  });
  s += xLabels(f, dates) + '</svg>';
  const label = v => (v === true ? '✓ 飲んだ' : v === false ? '✕ 飲んでいない' : '未記録');
  attachTip(el, s, f, dates, i => slots.map(slot => `<div>${slot.label} <b>${label(recs[i]?.meds?.[slot.key])}</b></div>`).join(''));
}

/** タップ（マウスなら移動）でその日の値を表示する */
function attachTip(el, svgHtml, f, dates, rowsHtml) {
  el.innerHTML = svgHtml + '<div class="tip" hidden></div>';
  const svg = $('svg', el), tip = $('.tip', el), guide = $('.guide', svg);
  const show = ev => {
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / f.W;
    const x = (ev.clientX - rect.left) / scale;
    const i = Math.floor((x - f.m.l) / f.band);
    if (i < 0 || i >= dates.length) return;
    guide.setAttribute('x1', f.xAt(i));
    guide.setAttribute('x2', f.xAt(i));
    guide.style.opacity = 0.5;
    tip.innerHTML = `<div class="tip-date">${fmtDate(dates[i])}</div>${rowsHtml(i)}`;
    tip.hidden = false;
    const px = f.xAt(i) * scale;
    const left = px + 12 + tip.offsetWidth > rect.width ? px - 12 - tip.offsetWidth : px + 12;
    tip.style.left = Math.max(0, left) + 'px';
  };
  const hide = () => { tip.hidden = true; guide.style.opacity = 0; };
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') show(e); });
  svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
}

/* ====================================================================
 * 履歴画面
 * ==================================================================== */
function renderHistory(view) {
  setHeader('<h1>履歴</h1>');
  const keys = sortedKeys().reverse();
  if (!keys.length) {
    view.innerHTML = `<div class="empty"><div class="big">🗓️</div><p>まだ記録がありません。</p>
      <button type="button" class="btn" data-tab="record">記録をつける</button></div>`;
    return;
  }
  let html = backupNotice();
  let month = '';
  for (const k of keys) {
    const r = db.records[k];
    const d = fromKey(k);
    const mk = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    if (mk !== month) { month = mk; html += `<div class="month-head">${mk}</div>`; }

    const bp = BP_SLOTS.map(s => {
      const a = slotAvg(r, s.key);
      return isNum(a.sys) && isNum(a.dia) ? `<span class="lbl">${s.label}</span>${fmt(a.sys)}/${fmt(a.dia)}` : '';
    }).filter(Boolean).join('　');
    const meta = [];
    if (isNum(r.weight)) meta.push(`⚖️ ${fmt(r.weight, 1)}kg`);
    if (r.condition) meta.push(`${CONDITIONS[r.condition - 1].face} ${CONDITIONS[r.condition - 1].label}`);
    if (isNum(r.sleep.hours)) meta.push(`🌙 ${fmt(r.sleep.hours, 1)}h`);
    if (isNum(r.exercise.minutes) || r.exercise.types.length) meta.push(`🚶 ${isNum(r.exercise.minutes) ? r.exercise.minutes + '分' : r.exercise.types.join('・')}`);
    const meds = db.settings.medSlots.map(s => r.meds[s]).filter(v => v != null);
    if (meds.length) meta.push(`💊 ${meds.map(v => (v ? '✓' : '✕')).join('')}`);
    const meals = MEALS.map(x => r.meals[x.key]).filter(v => v.trim()).join(' / ');
    const notes = [r.symptoms.join('・'), r.conditionNote, r.memo].filter(Boolean).join(' / ');

    html += `<button type="button" class="hist" data-open="${k}">
      <div class="hist-date"><div class="hist-day">${d.getDate()}</div><div class="hist-wd ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}">${WEEK[d.getDay()]}</div></div>
      <div class="hist-body">
        ${bp ? `<div class="hist-bp">${bp} <span class="lbl">mmHg</span></div>` : ''}
        ${meta.length ? `<div class="hist-meta">${meta.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
        ${meals ? `<div class="hist-line">🍚 ${esc(meals)}</div>` : ''}
        ${notes ? `<div class="hist-line">📝 ${esc(notes)}</div>` : ''}
      </div></button>`;
  }
  view.innerHTML = html;
}

function backupNotice() {
  const n = sortedKeys().length;
  const last = db.settings.lastBackup;
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  if (n < 7 || (days != null && days < 30)) return '';
  return `<div class="notice"><span>💾 ${last ? `最後のバックアップから${days}日たっています。` : 'まだバックアップがありません。'}</span>
    <button type="button" class="mini" data-action="export-json">保存する</button></div>`;
}

/* ====================================================================
 * 設定画面
 * ==================================================================== */
function renderSettings(view) {
  setHeader('<h1>設定</h1>');
  const st = db.settings;
  const n = sortedKeys().length;
  const last = st.lastBackup ? new Date(st.lastBackup) : null;
  const setField = (key, label, unit, decimal) => `<div class="field" data-field="${key}">
    <span class="field-input"><input type="text" inputmode="${decimal ? 'decimal' : 'numeric'}" autocomplete="off" aria-label="${label}"
      data-setting="${key}" value="${isNum(st[key]) ? st[key] : ''}"><span class="unit">${unit}</span></span></div>`;

  view.innerHTML = [
    card('服薬のタイミング', '💊', `<div class="chips">${MED_SLOTS.map(s =>
      `<button type="button" class="chip ${st.medSlots.includes(s.key) ? 'active' : ''}" data-medslot="${s.key}" aria-pressed="${st.medSlots.includes(s.key)}">${s.label}</button>`).join('')}</div>
      <div class="hint">記録画面に表示する服薬のタイミングを選びます。</div>`),
    card('グラフの基準線', '📏', `
      <div class="setting-row"><span>最高血圧</span>${setField('bpSys', '最高血圧の基準', 'mmHg')}</div>
      <div class="setting-row"><span>最低血圧</span>${setField('bpDia', '最低血圧の基準', 'mmHg')}</div>
      <div class="setting-row"><span>目標体重</span>${setField('targetWeight', '目標体重', 'kg', true)}</div>
      <div class="hint">初期値の 135/85 mmHg は、日本高血圧学会のガイドラインで家庭血圧の高血圧基準とされている値です。主治医から目標値を指示されている場合は、その値に変更してください。</div>`),
    card('データのバックアップ', '💾', `
      <p class="small muted" style="margin:0 0 12px">記録はこのスマホの中だけに保存されています。機種変更やブラウザのデータ削除で消えてしまうため、ときどきバックアップを保存してください。<br>
      記録：${n}日分　最終バックアップ：${last ? `${last.getMonth() + 1}月${last.getDate()}日` : 'なし'}</p>
      <button type="button" class="btn" data-action="export-json">バックアップを保存（JSON）</button>
      <button type="button" class="btn ghost" data-action="export-csv">表形式で書き出す（CSV・Excel用）</button>
      <button type="button" class="btn ghost" data-action="import">バックアップから復元</button>`),
    card('その他', '⚙️', `
      ${n ? '' : '<button type="button" class="btn ghost" data-action="demo">お試しデータを入れてみる</button>'}
      <button type="button" class="btn danger" data-action="clear-all" ${n ? '' : 'disabled'}>すべての記録を削除</button>
      <div class="about" style="margin-top:14px">
        <p>体調ノート v1.0</p>
        <p>このアプリは記録を整理するためのものです。体調や数値に不安があるときは医療機関に相談してください。</p>
      </div>`),
  ].join('');
}

/* ---------- 書き出し・読み込み ---------- */
async function shareOrDownload(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile && navigator.canShare) {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return true;
      } catch (e) {
        if (e.name === 'AbortError') return false;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
const stamp = () => todayKey().replace(/-/g, '');

async function exportJson() {
  const done = await shareOrDownload(`体調ノート_バックアップ_${stamp()}.json`, 'application/json', JSON.stringify({ app: 'taicho-note', ...db }, null, 1));
  if (done) {
    db.settings.lastBackup = Date.now();
    saveNow();
    render();
    toast('バックアップを保存しました');
  }
}

function toCsv() {
  const q = v => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['日付'];
  for (const s of BP_SLOTS) for (const i of [0, 1]) {
    head.push(`${s.label}${i + 1}回目_時刻`, ...READING_FIELDS.map(f => `${s.label}${i + 1}回目_${f.label}`));
  }
  head.push('朝_平均最高血圧', '朝_平均最低血圧', '夜_平均最高血圧', '夜_平均最低血圧',
    '体重(kg)', '体調(1-5)', '体調', '症状', '体調メモ', ...MEALS.map(m => m.label),
    '就寝', '起床', '睡眠時間(h)', '運動内容', '運動時間(分)', '歩数', ...MED_SLOTS.map(m => `服薬_${m.label}`), 'メモ');
  const rows = [head];
  for (const k of sortedKeys()) {
    const r = db.records[k];
    const row = [k];
    for (const s of BP_SLOTS) for (const i of [0, 1]) {
      const x = r.bp[s.key][i] || {};
      row.push(x.time || '', ...READING_FIELDS.map(f => x[f.key] ?? ''));
    }
    const am = slotAvg(r, 'morning'), pm = slotAvg(r, 'evening');
    row.push(round(am.sys, 1), round(am.dia, 1), round(pm.sys, 1), round(pm.dia, 1),
      r.weight, r.condition, r.condition ? CONDITIONS[r.condition - 1].label : '', r.symptoms.join('・'), r.conditionNote,
      ...MEALS.map(m => r.meals[m.key]), r.sleep.bed, r.sleep.wake, r.sleep.hours,
      r.exercise.types.join('・'), r.exercise.minutes, r.exercise.steps,
      ...MED_SLOTS.map(m => (r.meds[m.key] === true ? '飲んだ' : r.meds[m.key] === false ? '飲んでいない' : '')), r.memo);
    rows.push(row);
  }
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
}

function importJson() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { alert('ファイルを読み込めませんでした。体調ノートのバックアップ（.json）を選んでください。'); return; }
    const entries = Object.entries(data?.records || {}).filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k));
    if (!entries.length) { alert('このファイルには記録が含まれていません。'); return; }
    const overlap = entries.filter(([k]) => db.records[k]).length;
    const msg = `${entries.length}日分の記録を読み込みます。` + (overlap ? `\n同じ日付の記録（${overlap}日分）はバックアップの内容で上書きされます。` : '') + '\nよろしいですか？';
    if (!confirm(msg)) return;
    for (const [k, r] of entries) db.records[k] = normalizeRecord(r, k);
    if (data.settings) db.settings = { ...db.settings, ...data.settings, lastBackup: db.settings.lastBackup };
    saveNow();
    render();
    toast(`${entries.length}日分を復元しました`);
  });
  input.click();
}

/* ---------- お試しデータ ---------- */
function makeDemo() {
  const rnd = (a, b) => Math.round(a + Math.random() * (b - a));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const today = todayKey();
  let weight = 66.2;
  for (let i = 59; i >= 0; i--) {
    const k = addDays(today, -i);
    if (i > 0 && Math.random() < 0.07) continue;
    const r = blankRecord(k);
    const trend = i * 0.12;
    const reading = (h, sys, dia) => ({ time: `${pad(h)}:${pad(rnd(0, 59))}`, sys: rnd(sys - 6, sys + 6), dia: rnd(dia - 4, dia + 4), pulse: rnd(62, 78), resp: rnd(14, 18) });
    r.bp.morning = [reading(6, 130 + trend, 84 + trend / 2)];
    if (Math.random() < 0.7) r.bp.morning.push(reading(7, 127 + trend, 82 + trend / 2));
    if (i > 0) {
      r.bp.evening = [reading(21, 124 + trend, 78 + trend / 2)];
      if (Math.random() < 0.6) r.bp.evening.push(reading(21, 122 + trend, 77 + trend / 2));
    }
    weight += (Math.random() - 0.58) * 0.4;
    r.weight = round(weight, 1);
    r.condition = pick([3, 3, 4, 4, 4, 5, 2]);
    if (r.condition <= 2) r.symptoms = [pick(['頭痛', 'だるさ', '肩こり', 'めまい'])];
    const bed = `${pick(['22', '23', '23', '00'])}:${pick(['00', '15', '30', '45'])}`;
    const wake = `0${pick([5, 6, 6, 7])}:${pick(['00', '15', '30', '45'])}`;
    r.sleep = { bed, wake, hours: sleepHours(bed, wake) };
    r.meals = {
      breakfast: pick(['トースト、ヨーグルト', 'ごはん、味噌汁、納豆', 'バナナ、コーヒー', 'おにぎり、ゆで卵']),
      lunch: i > 0 ? pick(['焼き魚定食', 'そば', 'サンドイッチ', '野菜炒め定食', 'お弁当']) : '',
      dinner: i > 0 ? pick(['ごはん、豚汁、サラダ', 'カレーライス', '鍋', '焼き鮭、おひたし', 'パスタ']) : '',
      snack: Math.random() < 0.3 ? pick(['みかん', 'せんべい2枚', 'ナッツ少し']) : '',
    };
    if (Math.random() < 0.6) {
      r.exercise = { types: [pick(['ウォーキング', 'ウォーキング', 'ストレッチ', '筋トレ'])], minutes: rnd(2, 6) * 10, steps: rnd(5000, 11000) };
    }
    r.meds = { morning: Math.random() < 0.95 };
    if (i > 0) r.meds.evening = Math.random() < 0.9;
    db.records[k] = r;
  }
  saveNow();
}

/* ====================================================================
 * イベント
 * ==================================================================== */
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'datePicker') return;
  if (el.dataset.path && cur && state.tab === 'record') onRecordInput(el);
  if (el.dataset.setting) {
    db.settings[el.dataset.setting] = parseNum(el.value);
    saveSoon();
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'datePicker') {
    if (el.value && el.value <= todayKey()) { state.date = el.value; render(); }
    return;
  }
  // 数値欄は確定時に表示を整える（全角数字など）
  if ('num' in el.dataset && el.dataset.path) {
    const v = getPath(cur, el.dataset.path);
    el.value = isNum(v) ? v : '';
  }
});

document.addEventListener('click', e => {
  const t = e.target.closest('button, input[type="date"]');
  if (!t) return;
  const ds = t.dataset;

  if (t.id === 'datePicker') { try { t.showPicker(); } catch { /* 未対応ブラウザは通常の動作 */ } return; }
  if (t.id === 'respTap') { onRespTap(); return; }

  if (ds.tab) {
    if (state.tab !== ds.tab) {
      state.tab = ds.tab;
      render();
      window.scrollTo(0, 0);
    }
    return;
  }
  if (ds.set) { // 体調（もう一度押すと解除）
    const v = Number(ds.value);
    cur[ds.set] = cur[ds.set] === v ? null : v;
    $$(`[data-set="${ds.set}"]`).forEach(b => {
      const on = Number(b.dataset.value) === cur[ds.set];
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on);
    });
    commit();
    return;
  }
  if (ds.toggle) { // 症状・運動の種類
    const list = getPath(cur, ds.toggle);
    const i = list.indexOf(ds.value);
    if (i >= 0) list.splice(i, 1); else list.push(ds.value);
    t.classList.toggle('active', i < 0);
    t.setAttribute('aria-pressed', i < 0);
    commit();
    return;
  }
  if (ds.med) {
    const v = ds.value === 'true';
    cur.meds[ds.med] = cur.meds[ds.med] === v ? null : v;
    $$(`[data-med="${ds.med}"]`).forEach(b => b.classList.toggle('active', cur.meds[ds.med] === (b.dataset.value === 'true')));
    commit();
    return;
  }
  if (ds.range) { state.range = ds.range === 'all' ? 'all' : Number(ds.range); render(); return; }
  if (ds.gbp) { state.gBp = ds.gbp; render(); return; }
  if (ds.open) { state.date = ds.open; state.bpSlot = 'morning'; state.tab = 'record'; render(); window.scrollTo(0, 0); return; }
  if (ds.medslot) {
    const list = db.settings.medSlots;
    const i = list.indexOf(ds.medslot);
    if (i >= 0) list.splice(i, 1);
    else db.settings.medSlots = MED_SLOTS.map(s => s.key).filter(k => k === ds.medslot || list.includes(k));
    saveSoon();
    render();
    return;
  }

  switch (ds.action) {
    case 'prev-day':
      state.date = addDays(state.date, -1); render(); break;
    case 'next-day':
      if (state.date < todayKey()) { state.date = addDays(state.date, 1); render(); }
      break;
    case 'go-today':
      state.date = todayKey(); state.bpSlot = defaultBpSlot(); render(); break;
    case 'bp-slot':
      state.bpSlot = ds.slot;
      $$('[data-action="bp-slot"]').forEach(b => b.classList.toggle('active', b.dataset.slot === ds.slot));
      $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== ds.slot; });
      break;
    case 'add-reading':
      cur.bp[ds.slot].push({});
      rerenderBpPanel(ds.slot);
      break;
    case 'remove-reading':
      if (!hasReading(cur.bp[ds.slot][1]) || confirm('2回目の記録を削除しますか？')) {
        cur.bp[ds.slot].splice(1);
        rerenderBpPanel(ds.slot);
        commit();
      }
      break;
    case 'now': {
      const input = $(`input[data-path="${ds.path}"]`);
      input.value = nowTime();
      onRecordInput(input);
      break;
    }
    case 'count-resp':
      openRespCounter(ds.path); break;
    case 'resp-close':
      closeResp(); break;
    case 'resp-apply':
      applyResp(); break;
    case 'delete-day':
      if (!db.records[state.date]) { toast('この日の記録はありません'); break; }
      if (confirm(`${fmtDate(state.date)}の記録を削除しますか？\nこの操作は取り消せません。`)) {
        delete db.records[state.date];
        saveNow();
        render();
        toast('削除しました');
      }
      break;
    case 'export-json':
      exportJson(); break;
    case 'export-csv':
      shareOrDownload(`体調ノート_${stamp()}.csv`, 'text/csv', toCsv()); break;
    case 'import':
      importJson(); break;
    case 'demo':
      makeDemo(); state.tab = 'graph'; render(); toast('お試しデータを入れました'); break;
    case 'clear-all':
      if (confirm('すべての記録を削除します。この操作は取り消せません。\n先にバックアップを保存しましたか？')
        && confirm('本当にすべての記録を削除しますか？')) {
        db.records = {};
        saveNow();
        render();
        toast('すべての記録を削除しました');
      }
      break;
  }
});

$('#respDialog').addEventListener('close', () => { clearInterval(resp.timer); resp.running = false; });

/* ---------- 起動 ---------- */
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e)));
}
