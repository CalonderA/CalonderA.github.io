'use strict';
/* Кабинет пользователя: доступные тесты, прохождение с таймером, результаты */

let me = null;

/* ------------------------------- загрузка ------------------------------- */
async function boot() {
  try { me = (await api('/api/me')).user; }
  catch { location.href = '/'; return; }
  if (me.role === 'admin') { location.href = '/admin'; return; }

  document.getElementById('userName').textContent = me.name;
  document.getElementById('userAva').textContent = (me.name[0] || '?').toUpperCase();
  document.getElementById('logoutBtn').innerHTML = ICONS.logout;
  document.getElementById('logoutBtn').onclick = async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    location.href = '/';
  };

  const NAV = { tests: 'Мои тесты', results: 'Мои результаты' };
  const NAV_ICONS = { tests: ICONS.doc, results: ICONS.chart };
  document.querySelectorAll('#nav a').forEach(a => {
    a.innerHTML = NAV_ICONS[a.dataset.view] + `<span>${NAV[a.dataset.view]}</span>`;
    a.href = '#' + a.dataset.view;
  });

  document.getElementById('answerBtn').onclick = () => submitAnswer();
  window.addEventListener('hashchange', () => {
    if (taking) { /* во время прохождения навигация заблокирована */
      history.forward();
      return;
    }
    switchView();
  });
  switchView();
}

function showOnly(id) {
  document.querySelectorAll('.view').forEach(s => { s.hidden = s.id !== id; });
  const v = id.replace('view-', '');
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
}

function switchView() {
  let v = (location.hash || '#tests').slice(1);
  if (!['tests', 'results'].includes(v)) v = 'tests';
  showOnly('view-' + v);
  if (v === 'tests') loadTests();
  else loadResults();
}

/* ---------------------------- МОИ ТЕСТЫ --------------------------------- */
const CLOCK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:12px;height:12px;vertical-align:-1px"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;

async function loadTests() {
  const rows = await api('/api/my/tests');
  const grid = document.getElementById('testsGrid');
  if (!rows.length) {
    grid.innerHTML = `<div class="panel empty" style="grid-column:1/-1">${ICONS.doc}<b>Пока нет доступных тестов</b>Когда администратор выдаст вам доступ, тесты появятся здесь.</div>`;
    return;
  }
  grid.innerHTML = rows.map(t => {
    const limited = t.availableUntil !== null && t.availableUntil !== undefined;
    const availBadge = !limited
      ? ''
      : t.expired
        ? `<span class="badge badge--danger">${CLOCK_SVG} время вышло</span>`
        : `<span class="badge badge--ok">${CLOCK_SVG} доступен до ${fmtDate(t.availableUntil)}</span>`;
    return `
    <div class="panel test-card">
      <h3>${esc(t.title)}</h3>
      <div class="desc">${esc(t.description) || 'Описание не задано'}</div>
      <div class="meta-row">
        <span class="badge badge--neutral">${t.questionCount} ${plural(t.questionCount, 'вопрос', 'вопроса', 'вопросов')}</span>
        <span class="badge badge--neutral">${CLOCK_SVG} ${t.timePerQuestion} c на вопрос</span>
        <span class="badge badge--neutral">проходной ${t.passPercent}%</span>
      </div>
      ${availBadge ? `<div class="meta-row">${availBadge}</div>` : ''}
      ${t.attempts ? `<div class="meta-row"><span class="badge ${t.bestPercent >= t.passPercent ? 'badge--ok' : ''}">лучший результат: ${t.bestPercent}%</span><span class="badge badge--neutral">${t.attempts} ${plural(t.attempts, 'попытка', 'попытки', 'попыток')}</span></div>` : ''}
      ${t.expired
        ? '<div style="color:var(--muted);font-size:13.5px">Срок доступности теста истёк — попросите администратора продлить время.</div>'
        : `<button class="btn btn--lg" onclick="startTest('${t.id}')">Начать тест</button>`}
    </div>`;
  }).join('');
}

/* --------------------------- МОИ РЕЗУЛЬТАТЫ ----------------------------- */
async function loadResults() {
  const rows = await api('/api/my/results');
  const box = document.getElementById('resultsTable');
  if (!rows.length) {
    box.innerHTML = `<div class="empty">${ICONS.chart}<b>Вы ещё не проходили тесты</b>Начните первый тест во вкладке «Мои тесты».</div>`;
    return;
  }
  box.innerHTML = `<table class="tbl"><thead><tr>
    <th>Дата</th><th>Тест</th><th>Балл</th><th>Результат</th><th></th>
  </tr></thead><tbody>${rows.map(r => `<tr>
    <td class="num">${fmtDate(r.finishedAt)}</td>
    <td><b>${esc(r.testTitle)}</b></td>
    <td class="num">${fmtScore(r.score)} / ${r.total}</td>
    <td><span class="badge ${r.passed ? 'badge--ok' : 'badge--danger'}">${r.percent}%</span></td>
    <td><button class="btn btn--ghost btn--sm" onclick="showMyResult('${r.id}')">Разбор</button></td>
  </tr>`).join('')}</tbody></table>`;
}

async function showMyResult(id) {
  let d;
  try { d = await api('/api/attempts/' + id); }
  catch (e) { toast(e.message, 'err'); return; }
  const modal = openModal(`
    <div class="modal__head"><h2>Разбор прохождения</h2><button class="icon-btn" data-close>${ICONS.x}</button></div>
    <div class="modal__body">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <span class="badge badge--neutral">${esc(d.testTitle)}</span>
        <span class="badge badge--neutral">${fmtDate(d.finishedAt)}</span>
        <span class="badge ${d.passed ? 'badge--ok' : 'badge--danger'}">${d.score} / ${d.total} · ${d.percent}%</span>
      </div>
      <div id="mr_review"></div>
    </div>
    <div class="modal__foot"><button class="btn" data-close>Закрыть</button></div>`, { wide: true });
  renderReview(d.review, modal.querySelector('#mr_review'));
}

/* ------------------------ ПРОХОЖДЕНИЕ ТЕСТА ----------------------------- */
let taking = null; // {attemptId, test, questions, idx, selected, timerId, deadline}

async function startTest(testId) {
  let d;
  try { d = await api('/api/attempts', { method: 'POST', body: { testId } }); }
  catch (e) { toast(e.message, 'err'); return; }

  /* пока шёл тест, общее время истекло — сервер завершил попытку сам */
  if (d.finished) return renderResult(d.result, d.testTitle);

  const resume = !!d.resumed;
  const msg = resume
    ? `Тест «${d.test.title}» не завершён.\n\nПродолжить с вопроса ${d.idx + 1} из ${d.test.questionCount}?`
    : `Начать «${d.test.title}»?\n\nВопросов: ${d.test.questionCount}\nНа каждый вопрос: ${d.test.timePerQuestion} секунд\nТаймер нельзя поставить на паузу.`;
  if (!confirm(msg)) return;

  taking = {
    attemptId: d.attemptId,
    test: d.test,
    testId: testId,
    questions: d.questions,
    idx: d.idx || 0,
    selected: [],
    timerId: null,
    masterId: null,
    deadline: 0,
    busy: false,
    recovering: false,
    log: []
  };
  showOnly('view-take');
  document.getElementById('takeTitle').textContent = d.test.title;
  showQuestion(d.qTimeLeft);
}

function showQuestion(remaining) {
  const t = taking;
  const q = t.questions[t.idx];
  document.getElementById('takeCounter').textContent = `Вопрос ${t.idx + 1} из ${t.questions.length}`;
  document.getElementById('takeBar').style.width = (t.idx / t.questions.length * 100) + '%';
  document.getElementById('qText').textContent = q.text;
  t.selected = [];
  const hint = document.getElementById('qHint');
  if (hint) hint.hidden = !q.multi;
  const imgBox = document.getElementById('qImg');
  if (imgBox) {
    imgBox.hidden = !q.image;
    imgBox.innerHTML = q.image ? `<img src="${esc(q.image)}" alt="">` : '';
  }

  document.getElementById('qOpts').innerHTML = q.options.map((o, i) => `
    <button class="opt${o.image ? ' opt--img' : ''}" data-i="${o.i}">
      <span class="bub">${LETTERS[i]}</span>
      <span class="opt__body">${o.image ? `<img class="opt__img" src="${esc(o.image)}" alt="">` : ''}${o.text ? `<span>${esc(o.text)}</span>` : ''}</span>
    </button>`).join('');

  document.querySelectorAll('#qOpts .opt').forEach(btn => {
    btn.onclick = () => {
      const i = +btn.dataset.i;
      if (q.multi) {
        t.selected = t.selected.includes(i) ? t.selected.filter(x => x !== i) : t.selected.concat(i);
      } else {
        t.selected = [i];
        document.querySelectorAll('#qOpts .opt').forEach(b => b.classList.remove('selected'));
      }
      btn.classList.toggle('selected', t.selected.includes(i));
      document.getElementById('answerBtn').disabled = !t.selected.length;
    };
  });
  const ab = document.getElementById('answerBtn');
  ab.disabled = true;
  ab.textContent = t.idx === t.questions.length - 1 ? 'Завершить тест' : 'Ответить';

  armTimer(remaining);
}

const CIRC = 2 * Math.PI * 33; /* длина окружности r=33 */

function armTimer(remaining) {
  const total = taking.test.timePerQuestion;
  const left0 = (typeof remaining === 'number' && remaining >= 0) ? Math.min(remaining, total) : total;
  taking.deadline = Date.now() + left0 * 1000;
  const arc = document.getElementById('timerArc');
  if (arc) { arc.style.strokeDasharray = CIRC; arc.style.strokeDashoffset = 0; }
  ensureMasterTimer();
}

function ensureMasterTimer() {
  if (!taking || taking.masterId) return;
  taking.masterId = setInterval(masterTick, 250);
}

/* независимый сторож: даже если таймер вопроса потерялся, через 3 секунды
   после дедлайна он оживит отправку — тест не может зависнуть намертво */
setInterval(() => {
  if (!taking || taking.busy || taking.recovering) return;
  if (Date.now() > taking.deadline + 3000) {
    taking.deadline = Date.now() + 3000;
    ensureMasterTimer();
    submitAnswer(true);
  }
}, 1000);

function masterTick() {
  if (!taking) return;
  const timerEl = document.getElementById('takeTimer');
  if (!timerEl) return;
  const left = Math.max(0, Math.round((taking.deadline - Date.now()) / 1000));
  const total = taking.test.timePerQuestion || 1;
  const num = document.getElementById('timerNum');
  const arc = document.getElementById('timerArc');
  if (num) num.textContent = fmtTimeLeft(left);
  const frac = Math.max(0, Math.min(1, left / total));
  if (arc) {
    arc.style.strokeDasharray = CIRC;
    arc.style.strokeDashoffset = CIRC * (1 - frac);
  }
  timerEl.className = 'timer' + (frac <= .12 ? ' timer--danger' : frac <= .3 ? ' timer--warn' : '');
  if (left <= 0 && !taking.busy && !taking.recovering) submitAnswer(true);
}

async function submitAnswer(auto = false) {
  if (!taking || taking.busy || taking.recovering) return;
  const t = taking;
  const q = t.questions[t.idx];
  t.busy = true;
  try {
    await api(`/api/attempts/${t.attemptId}/answer`, {
      method: 'POST',
      body: { questionId: q.id, options: t.selected }
    });
  } catch (e) {
    t.busy = false;
    if (e.status === 404) {
      /* попытка потерялась — молча создаём новую, повторяем ответы, продолжаем */
      return recoverAttempt(q);
    }
    if (e.status && e.status !== 500 && e.status !== 429) {
      /* сервер ответил постоянным отказом — получаем финал */
      toast(e.message, 'err');
      return finishTest();
    }
    /* сеть или сервер моргнули: остаёмся на вопросе и повторяем автоматически.
       Дедлайн продлевается минимум до 5 секунд — таймер не «умирает» никогда */
    toast('Повторяем отправку — ответ не потеряется', 'err');
    const left = Math.max(0, Math.round((t.deadline - Date.now()) / 1000));
    t.deadline = Date.now() + Math.max(left, 5) * 1000;
    ensureMasterTimer();
    return;
  }

  t.busy = false;
  t.log.push({ questionId: q.id, options: t.selected }); /* журнал для самовосстановления */
  t.idx++;
  if (t.idx >= t.questions.length) finishTest();
  else showQuestion();
}

/* потерянная попытка: новая + повтор всех предыдущих ответов + продолжение.
   Флаг recovering ОБЯЗАН сбрасываться на любом исходе — иначе тест умрёт.
   После 3 неудач возвращаемся к списку с честным сообщением */
async function recoverAttempt(currentQ) {
  const t = taking;
  if (!t || t.recovering) return;
  t.recovering = true;
  t.recovers = (t.recovers || 0) + 1;
  if (t.recovers > 3) {
    t.recovering = false;
    toast('Не удаётся продолжить тест — начните его заново из списка', 'err');
    taking = null;
    location.hash = '#tests';
    switchView();
    return;
  }
  toast('Восстанавливаем тест…');
  try {
    const d = await api('/api/attempts', { method: 'POST', body: { testId: t.testId } });
    if (d.finished) return renderResult(d.result, d.testTitle);
    for (const entry of t.log) {
      await api(`/api/attempts/${d.attemptId}/answer`, { method: 'POST', body: { questionId: entry.questionId, options: entry.options } });
    }
    const curId = currentQ.id;
    const newIndex = Math.max(0, d.questions.findIndex(x => x.id === curId));
    clearInterval(t.masterId);
    taking = { attemptId: d.attemptId, test: d.test, testId: t.testId, questions: d.questions, idx: newIndex, selected: [], timerId: null, masterId: null, deadline: 0, busy: false, recovering: false, recovers: 0, log: t.log.slice() };
    showQuestion(d.qTimeLeft);
    toast('Тест восстановлен — продолжайте', 'ok');
  } catch (e2) {
    toast(e2.message || 'Пробуем восстановить ещё раз…', 'err');
    t.recovering = false; /* обязательно снимаем флаг — иначе всё зависнет */
    t.deadline = Date.now() + 5000; /* сторож через 5 секунд повторит */
    ensureMasterTimer();
  }
}

async function finishTest() {
  if (!taking) return;
  clearInterval(taking.timerId);
  const attemptId = taking.attemptId;
  const testTitle = taking.test.title;
  taking = null;
  let d;
  try { d = await api(`/api/attempts/${attemptId}/finish`, { method: 'POST' }); }
  catch (e) {
    if (!e.status) {
      /* сети нет: попытка сохранена, при следующем «Начать тест» сервер сам покажет результат */
      toast('Нет связи с сервером. Попытка сохранена — зайдите в тест ещё раз.');
      location.hash = '#tests';
      switchView();
      return;
    }
    toast(e.message, 'err');
    location.hash = '#tests';
    switchView();
    return;
  }

  renderResult(d, testTitle);
}

function renderResult(d, testTitle) {
  const ringColor = d.passed ? '#1F9D63' : '#D64545';
  const C = 2 * Math.PI * 70;

  /* результат на весь экран — как экран прохождения */
  taking = null;
  showOnly('view-finish');
  document.getElementById('finishBox').innerHTML = `
    <div class="take__top">
      <div><b>${esc(testTitle)}</b><div class="take__counter" style="margin-top:2px">Результат</div></div>
    </div>
    <div class="take__progress"><i style="width:100%"></i></div>
    <div class="panel qcard__take">
      <div class="finish-wrap">
        <div class="result-hero">
          <div class="score-ring score-ring--lg">
            <svg viewBox="0 0 168 168"><circle class="bgc" cx="84" cy="84" r="70"/><circle class="fgc" cx="84" cy="84" r="70" style="stroke:${ringColor};stroke-dasharray:${C};stroke-dashoffset:${C * (1 - d.percent / 100)}"/></svg>
            <div class="val">${d.percent}<small>%</small></div>
          </div>
          <div class="verdict" style="color:${ringColor}">${d.passed ? 'Тест пройден' : 'Тест не пройден'}</div>
          <div class="detail">Верно ${fmtScore(d.score)} из ${d.total} · проходной балл ${d.passPercent}%</div>
        </div>
        <div class="mistakes" id="resMistakes"></div>
      </div>
      <div class="take__foot" style="justify-content:center">
        <button class="btn btn--lg" id="resBack">К моим тестам</button>
      </div>
    </div>`;
  renderMistakes(d.review, document.getElementById('resMistakes'));
  document.getElementById('resBack').onclick = () => {
    document.getElementById('finishBox').innerHTML = '';
    location.hash = '#tests';
    switchView();
  };
}

boot();
