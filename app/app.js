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

function buildRow(i) {
  const li = el('li', { 'data-testid': 'incident-row', 'data-id': i.id, class: `row ${i.severity}` });
  li.append(
    el('span', { class: 'id' }, i.id),
    el('span', { class: 'sev' }, i.severity),
    el('span', { class: 'what' }, `${i.service} · ${i.region} · ${i.summary}`),
    el('time', { datetime: i.openedAt, title: i.openedAt }, localTime(i.openedAt)),
    el('span', { class: 'action' }),
  );
  renderAction(li, i.id);
  return li;
}

function renderAction(li, id) {
  const slot = li.querySelector('.action');
  slot.replaceChildren();
  if (acked.has(id)) {
    slot.append(el('span', { 'data-testid': 'acked', class: 'acked', title: acked.get(id) }, 'Acked'));
    return;
  }
  const btn = el('button', { type: 'button', 'data-testid': 'ack', class: 'ack' }, 'Ack');
  btn.addEventListener('click', () => onAck(li, id, btn));
  slot.append(btn);
}

async function onAck(li, id, btn) {
  btn.disabled = true;
  btn.textContent = 'Acking…';
  try {
    const reply = await ack(id);
    acked.set(id, reply.ackedAt);
    renderAction(li, id);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Ack';
    showError(err);
  }
}

function showError(err) {
  errorBox.textContent = `Could not reach the incident API: ${err.message}`;
  errorBox.hidden = false;
}

/** R1: keyed update, newest first. Existing rows keep their DOM node (and any click in flight). */
function render(incidents) {
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
