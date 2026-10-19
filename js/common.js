'use strict';
/* Общие хелперы: API-обёртка, тосты, форматирование, разбор результатов */

/* адрес сервера: на основном сайте пусто (тот же домен), на зеркалах —
   основной бэкенд, куда уходят все запросы */
const API_BASE = window.__API_BASE || '';

async function api(path, opts = {}) {
  /* сетевые сбои повторяем: GET — 3 попытки, остальные — 2; ошибки самого
     сервера (4xx/5xx) не повторяем. У каждой попытки лимит времени: если
     ответ не приходит (сеть «подвисла»), запрос прерывается и повторяется —
     страница никогда не висит бесконечно. На старых браузерах без
     AbortController работает без лимита, но не падает. */
  const maxTries = (opts.method || 'GET') === 'GET' ? 3 : 2;
  let res = null;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const canAbort = typeof AbortController === 'function';
    const ctrl = canAbort ? new AbortController() : null;
    const timer = canAbort ? setTimeout(() => ctrl.abort(), 12000) : null;
    try {
      res = await fetch(API_BASE + path, {
        method: opts.method || 'GET',
        headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        credentials: API_BASE ? 'include' : 'same-origin',
        ...(ctrl ? { signal: ctrl.signal } : {})
      });
      if (timer) clearTimeout(timer);
      break;
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (attempt < maxTries - 1) await new Promise(r => setTimeout(r, 1200));
    }
  }
  if (!res) throw new Error('Сервер не отвечает. Проверьте интернет и попробуйте ещё раз.');
  let data = null;
  try { data = await res.json(); } catch { /* пусто */ }
  if (!res.ok) {
    const e = new Error((data && data.error) || `Ошибка ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, type = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3200);
  setTimeout(() => t.remove(), 3600);
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtTimeLeft(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return s < 10 ? `${m}:0${s}` : `${m}:${s}`;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З'];

/* модальное окно; content — HTML строки; возвращает элемент .modal */
function openModal(contentHTML, { wide = false } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal${wide ? ' modal--wide' : ''}">${contentHTML}</div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });
  ov.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return ov.querySelector('.modal');
}

/* балл может быть дробным (частичный зачёт) — красивый вывод */
function fmtScore(s) {
  const v = Math.round((Number(s) || 0) * 100) / 100;
  return Number.isInteger(v) ? String(v) : String(v).replace(/0$/, '');
}

/* разбор попытки: список вопросов с верным/неверным ответом (поддерживает несколько ответов и картинки) */
function renderReview(review, container) {
  container.innerHTML = review.map(r => {
    const norm = v => Array.isArray(v) ? v : (v === null || v === undefined ? [] : [v]);
    const chosen = norm(r.chosen);
    const correct = norm(r.correct);
    const optImg = ci => {
      const im = (r.optionImages || [])[ci];
      return im ? `<img class="rthumb" src="${esc(im)}" alt="">` : '';
    };
    const chosenLines = chosen.length
      ? chosen.map(ci => `<div class="rowline"><span class="tag tag--chosen">ваш ответ</span><span>${LETTERS[ci]}. ${esc(r.options[ci])}</span>${optImg(ci)}</div>`).join('')
      : `<div class="rowline"><span class="tag tag--missed">нет ответа</span></div>`;
    const correctLines = correct.map(ci => `<div class="rowline"><span class="tag tag--correct">верный ответ</span><span>${LETTERS[ci]}. ${esc(r.options[ci])}</span>${optImg(ci)}</div>`).join('');
    const partialBadge = (!r.ok && r.frac > 0)
      ? `<span class="tag tag--partial">частичный зачёт: ${r.frac}% вопроса</span>`
      : '';
    return `<div class="review-item ${r.ok ? 'ok' : 'bad'}">
      <div class="rhead"><span class="mark">${r.ok ? '✓' : '✕'}</span><span class="q">${esc(r.text)}</span>${partialBadge}</div>
      ${r.image ? `<div class="rimg"><img src="${esc(r.image)}" alt=""></div>` : ''}
      <div class="answers">${chosenLines}${correctLines}</div>
    </div>`;
  }).join('');
}

/* итог попытки: показываем только неверные вопросы, верные не отвлекают */
function renderMistakes(review, container) {
  const wrong = review.filter(r => !r.ok);
  if (!wrong.length) {
    container.innerHTML = '<div class="mistakes-none"><span>✓</span>Все ответы верные — ошибок нет</div>';
    return;
  }
  container.innerHTML = `
    <div class="mistakes__head">Что неверно <span class="badge badge--danger">${wrong.length}</span></div>
    <div class="mistakes__list"></div>`;
  renderReview(wrong, container.querySelector('.mistakes__list'));
}

/* иконки */
const ICONS = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>',
  img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
};
