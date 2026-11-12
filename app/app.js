import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000;

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.querySelector('.error');

/** Incident ids acked from this board, so a refresh keeps the mark. */
const acked = new Map(); // id -> ackedAt

// R5: viewer's locale and zone; en-GB/de-DE/pl-PL etc. give day before month.
const timeFmt = new Intl.DateTimeFormat(navigator.languages?.[0] ?? navigator.language, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
export function localTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : timeFmt.format(d);
}

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Latest data per incident id, so the panel shows what the board shows. */
const incidentsById = new Map();
/** The incident the panel is open on (by id, never by position). */
let selectedId = null;

const panel = document.querySelector('[data-testid="incident-panel"]');
const panelAction = panel.querySelector('.panel-action');

function buildRow(i) {
  const li = el('li', { 'data-testid': 'incident-row', 'data-id': i.id, class: `row ${i.severity}`, tabindex: '0', 'aria-label': `Open ${i.id}` });
  li.append(
    el('span', { class: 'id' }, i.id),
    el('span', { class: 'sev' }, i.severity),
    el('span', { class: 'what' }, `${i.service} · ${i.region} · ${i.summary}`),
    el('time', { datetime: i.openedAt, title: i.openedAt }, localTime(i.openedAt)),
    el('span', { class: 'mark' }),
  );
  renderMark(li, i.id);
  // Product decision (SCHED-4515): a row opens its incident panel; Ack lives in the panel.
  li.addEventListener('click', () => openPanel(i.id));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPanel(i.id);
    }
  });
  return li;
}

function renderMark(li, id) {
  const slot = li.querySelector('.mark');
  slot.replaceChildren();
  if (acked.has(id)) slot.append(el('span', { 'data-testid': 'acked', class: 'acked', title: acked.get(id) }, 'Acked'));
}

function openPanel(id) {
  selectedId = id;
  for (const li of list.children) li.classList.toggle('selected', li.dataset.id === id);
  renderPanel();
  panel.hidden = false;
}

function closePanel() {
  selectedId = null;
  for (const li of list.children) li.classList.remove('selected');
  panel.hidden = true;
}

function renderPanel() {
  const i = incidentsById.get(selectedId);
  if (!i) return;
  panel.dataset.id = i.id;
  panel.querySelector('.panel-id').textContent = i.id;
  panel.querySelector('.panel-sev').textContent = i.severity;
  panel.querySelector('.panel-sev').className = `panel-sev ${i.severity}`;
  panel.querySelector('.panel-service').textContent = i.service;
  panel.querySelector('.panel-region').textContent = i.region;
  panel.querySelector('.panel-summary').textContent = i.summary;
  const t = panel.querySelector('.panel-time');
  t.setAttribute('datetime', i.openedAt);
  t.textContent = localTime(i.openedAt);
  renderPanelAction(i.id);
}

function renderPanelAction(id) {
  if (panelAction.dataset.id === id && panelAction.dataset.state === (acked.has(id) ? 'acked' : 'open')) return;
  panelAction.dataset.id = id;
  panelAction.dataset.state = acked.has(id) ? 'acked' : 'open';
  panelAction.replaceChildren();
  if (acked.has(id)) {
    panelAction.append(el('span', { class: 'acked panel-acked' }, `${id} acked`));
    return;
  }
  const btn = el('button', { type: 'button', 'data-testid': 'panel-ack', class: 'ack' }, `Ack ${id}`);
  btn.addEventListener('click', () => onAck(id, btn));
  panelAction.append(btn);
}

async function onAck(id, btn) {
  btn.disabled = true;
  btn.textContent = `Acking ${id}…`;
  try {
    const reply = await ack(id);
    acked.set(id, reply.ackedAt);
    const li = list.querySelector(`[data-testid="incident-row"][data-id="${CSS.escape(id)}"]`);
    if (li) renderMark(li, id);
    if (selectedId === id) renderPanelAction(id);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = `Ack ${id}`;
    showError(err);
  }
}

panel.querySelector('.panel-close').addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !panel.hidden) closePanel();
});

function showError(err) {
  errorBox.textContent = `Could not reach the incident API: ${err.message}`;
  errorBox.hidden = false;
}

/** R1: keyed update, newest first. Existing rows keep their DOM node (and any click in flight). */
function render(incidents) {
  for (const i of incidents) incidentsById.set(i.id, i);
  const existing = new Map([...list.children].map((li) => [li.dataset.id, li]));
  const wanted = incidents.map((i) => {
    const li = existing.get(i.id);
    if (!li) return buildRow(i);
    const t = li.querySelector('time');
    if (t.getAttribute('datetime') !== i.openedAt) {
      t.setAttribute('datetime', i.openedAt);
      t.title = i.openedAt;
      t.textContent = localTime(i.openedAt);
    }
    return li;
  });
  const keep = new Set(incidents.map((i) => i.id));
  for (const [id, li] of existing) if (!keep.has(id)) li.remove();
  wanted.forEach((li, idx) => {
    if (list.children[idx] !== li) list.insertBefore(li, list.children[idx] ?? null);
  });
  if (selectedId) {
    if (keep.has(selectedId)) renderPanel();
    else closePanel();
  }
  list.hidden = incidents.length === 0;
  empty.hidden = incidents.length !== 0;
}

async function refresh() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    loader.hidden = true; // R3
    errorBox.hidden = true;
  } catch (err) {
    showError(err);
  }
}

// R4: refresh every 2 s while open; no overlapping requests.
async function loop() {
  await refresh();
  setTimeout(loop, REFRESH_MS);
}
loop();
