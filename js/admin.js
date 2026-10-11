'use strict';
/* Панель администратора: обзор, тесты (редактор), пользователи, доступы, результаты */

let me = null;
/* гостевые ссылки всегда ведут на основной бэкенд (там живёт /t/страница) */
const LINK_ORIGIN = 'https://calondera.github.io';

/* ------------------------------ загрузка ------------------------------- */
async function boot() {
  try { me = (await api('/api/me')).user; }
  catch { location.href = '/'; return; }
  if (me.role !== 'admin') { location.href = '/app'; return; }

  document.getElementById('userName').textContent = me.name;
  document.getElementById('userRole').textContent = me.main ? 'Главный администратор' : 'Администратор';
  document.getElementById('userAva').textContent = (me.name[0] || '?').toUpperCase();
  document.getElementById('logoutBtn').innerHTML = ICONS.logout;

  const NAV = { overview: 'Обзор', tests: 'Тесты', users: 'Пользователи', results: 'Результаты' };
  const NAV_ICONS = { overview: ICONS.grid, tests: ICONS.doc, users: ICONS.users, results: ICONS.chart };
  document.querySelectorAll('#nav a').forEach(a => {
    a.innerHTML = NAV_ICONS[a.dataset.view] + `<span>${NAV[a.dataset.view]}</span>`;
    a.href = '#' + a.dataset.view;
  });

  document.getElementById('newTestBtn').innerHTML = ICONS.plus + '<span>Создать тест</span>';
  document.getElementById('newTestBtn').onclick = () => openTestEditor(null);
  document.getElementById('newUserBtn').innerHTML = ICONS.plus + '<span>Добавить пользователя</span>';
  document.getElementById('newUserBtn').onclick = () => openUserEditor(null);
  document.getElementById('logoutBtn').onclick = async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    location.href = '/';
  };

  window.addEventListener('hashchange', switchView);
  switchView();
}

function switchView() {
  let v = (location.hash || '#overview').slice(1);
  const valid = ['overview', 'tests', 'users', 'results'];
  if (!valid.includes(v)) v = 'overview';
  document.querySelectorAll('.view').forEach(s => { s.hidden = s.id !== 'view-' + v; });
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
  ({ overview: loadOverview, tests: loadTests, users: loadUsers, results: loadResults })[v]();
}

/* ------------------------------- ОБЗОР ---------------------------------- */
async function loadOverview() {
  const [stats, recent] = await Promise.all([api('/api/stats'), api('/api/results')]);
  const tiles = [
    { v: stats.tests, l: plural(stats.tests, 'тест', 'теста', 'тестов') },
    { v: stats.questions, l: plural(stats.questions, 'вопрос', 'вопроса', 'вопросов') },
    { v: stats.users, l: plural(stats.users, 'пользователь', 'пользователя', 'пользователей') },
    { v: stats.attempts, l: 'завершённых прохождений' },
    { v: stats.avgPercent === null ? '—' : stats.avgPercent + '%', l: 'средний результат' }
  ];
  document.getElementById('statsRow').innerHTML = tiles.map(t =>
    `<div class="panel stat"><div class="v">${t.v}</div><div class="l">${t.l}</div></div>`).join('');
  renderResultsTable(recent.slice(0, 8), document.getElementById('recentResults'), 'Пока никто не проходил тесты');
}

/* ------------------------------- ТЕСТЫ ---------------------------------- */
async function loadTests() {
  const tests = await api('/api/tests');
  const box = document.getElementById('testsTable');
  if (!tests.length) {
    box.innerHTML = `<div class="empty">${ICONS.doc}<b>Тестов пока нет</b>Создайте первый тест: один вопрос или сколько нужно — с таймером на каждый.<div><button class="btn" onclick="openTestEditor(null)">Создать тест</button></div></div>`;
    return;
  }
  box.innerHTML = `<table class="tbl"><thead><tr>
    <th>Название</th><th>Вопросов</th><th>Время / вопрос</th><th>Проходной</th><th>Доступ</th><th>Ссылки</th><th>Прохождений</th><th></th>
  </tr></thead><tbody>${tests.map(t => {
    const availBadge = t.availableUntil === null || t.availableUntil === undefined
      ? ''
      : t.available
        ? `<span class="badge" title="Тест временно доступен">${ICONS.clock} до ${fmtDate(t.availableUntil)}</span>`
        : `<span class="badge badge--danger" title="Срок доступности истёк">${ICONS.clock} закрыт</span>`;
    return `<tr>
    <td><b>${esc(t.title)}</b>${t.description ? `<div style="font-size:12.5px;color:var(--muted)">${esc(t.description)}</div>` : ''}${availBadge ? `<div style="margin-top:4px">${availBadge}</div>` : ''}${t.canEdit ? '' : '<div style="font-size:12.5px;color:var(--warn)">Редактирование закрыто: доступ не выдан главным администратором</div>'}</td>
    <td class="num">${t.questionCount}</td>
    <td class="num">${t.timePerQuestion} c</td>
    <td class="num">${t.passPercent}%</td>
    <td><span class="badge badge--neutral">${t.accessCount} ${plural(t.accessCount, 'чел.', 'чел.', 'чел.')}</span></td>
    <td>${t.activeLinks ? `<span class="badge">${t.activeLinks} акт.</span>` : '<span class="badge badge--neutral">—</span>'}</td>
    <td class="num">${t.attemptsCount}</td>
    <td style="white-space:nowrap">
      <button class="icon-btn" title="Временная ссылка" onclick="openLinks('${t.id}')">${ICONS.link}</button>
      <button class="icon-btn" title="Временная доступность теста" onclick="openAvailability('${t.id}')">${ICONS.clock}</button>
      ${t.canEdit ? `
      <button class="icon-btn" title="Доступ" onclick="openAccess('${t.id}')">${ICONS.key}</button>
      <button class="icon-btn" title="Редактировать" onclick="openTestEditorById('${t.id}')">${ICONS.edit}</button>
      <button class="icon-btn icon-btn--danger" title="Удалить" onclick="deleteTest('${t.id}', ${t.attemptsCount > 0})">${ICONS.trash}</button>`
      : `
      <button class="icon-btn" disabled title="Доступ закрыт — выдаёт главный администратор">${ICONS.key}</button>
      <button class="icon-btn" disabled title="Редактирование недоступно: доступ не выдан">${ICONS.edit}</button>
      <button class="icon-btn icon-btn--danger" disabled title="Удаление недоступно: доступ не выдан">${ICONS.trash}</button>`}
    </td>
  </tr>`;
  }).join('')}</tbody></table>`;
}

async function openTestEditorById(id) {
  try { openTestEditor(await api('/api/tests/' + id)); }
  catch (e) { toast(e.message, 'err'); }
}

async function deleteTest(id, hasAttempts) {
  if (!confirm(hasAttempts ? 'Удалить тест вместе с результатами прохождений?' : 'Удалить тест?')) return;
  try { await api('/api/tests/' + id, { method: 'DELETE' }); toast('Тест удалён'); loadTests(); }
  catch (e) { toast(e.message, 'err'); }
}

/* ---------------------- редактор теста (модалка) ------------------------ */

/* ссылки на картинки: пустые и битые значения приводим к пустой строке */
const normPic = v => (typeof v === 'string' && /^\/uploads\/[\w.-]+$/.test(v)) ? v : '';

/* загрузка картинки: выбор файла → data URL → /api/uploads */
function pickImage(onDone) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/png,image/jpeg,image/gif,image/webp';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast('Картинка больше 5 МБ', 'err'); return; }
    try {
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(f);
      });
      const up = await api('/api/uploads', { method: 'POST', body: { dataUrl } });
      onDone(up.url);
    } catch (e) { toast(e.message || 'Не удалось загрузить картинку', 'err'); }
  };
  inp.click();
}

function openTestEditor(test) {
  const isNew = !test;
  const arrCorrect = c => {
    const a = (Array.isArray(c) ? c.slice() : [c]).map(Number).filter(Number.isInteger);
    return a.length ? a : [0];
  };
  const arrImgs = q => q.options.map((_, oi) => normPic(Array.isArray(q.optionImages) ? q.optionImages[oi] : ''));
  const data = {
    title: test ? test.title : '',
    description: test ? test.description : '',
    timePerQuestion: test ? test.timePerQuestion : 60,
    passPercent: test ? test.passPercent : 60,
    shuffle: test ? !!test.shuffle : true,
    qs: test ? test.questions.map(q => ({ id: q.id, text: q.text, image: normPic(q.image), options: q.options.slice(), optionImages: arrImgs(q), correct: arrCorrect(q.correct) })) : [newQ()]
  };

  const modal = openModal(`
    <div class="modal__head"><h2>${isNew ? 'Новый тест' : 'Редактирование теста'}</h2><button class="icon-btn" data-close>${ICONS.x}</button></div>
    <div class="modal__body">
      <div class="field"><label>Название теста</label>
        <input class="input" id="te_title" maxlength="120" placeholder="Например: Основы программирования" value="${esc(data.title)}"></div>
      <div class="field"><label>Описание <span style="color:var(--muted);font-weight:400">— необязательно</span></label>
        <textarea class="input" id="te_desc" rows="2" placeholder="Что проверяет тест, для кого он">${esc(data.description)}</textarea></div>
      <div class="row">
        <div class="field"><label>Время на один вопрос</label>
          <div class="row" style="gap:8px">
            <input class="input" id="te_time" type="number" min="5" max="3600" step="5" value="${data.timePerQuestion}" style="flex:1">
            <span style="align-self:center;color:var(--muted);font-size:13px;white-space:nowrap">секунд</span>
          </div>
          <span class="hint">Рекомендуем 30–120 секунд</span></div>
        <div class="field"><label>Проходной балл</label>
          <div class="row" style="gap:8px">
            <input class="input" id="te_pass" type="number" min="1" max="100" value="${data.passPercent}" style="flex:1">
            <span style="align-self:center;color:var(--muted);font-size:13px;white-space:nowrap">%</span>
          </div>
          <span class="hint">От скольких процентов тест считается пройденным</span></div>
      </div>
      <div class="field"><label class="switch"><input type="checkbox" id="te_shuffle" ${data.shuffle ? 'checked' : ''}><span class="track"></span><span class="lbl">Перемешивать вопросы и варианты</span></label></div>
      <hr>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h2 style="margin:0;font-size:16px">Вопросы <span id="te_qcount" style="color:var(--muted);font-weight:400"></span></h2>
        <button class="btn btn--soft btn--sm" id="te_addq">${ICONS.plus}<span>Добавить вопрос</span></button>
      </div>
      <div class="hint-correct" style="margin:0 0 10px">Отметьте кружки у верных вариантов: можно один или несколько. К вопросу и к любому варианту можно добавить картинку</div>
      <div id="te_questions"></div>
    </div>
    <div class="modal__foot">
      <button class="btn btn--ghost" data-close>Отмена</button>
      <button class="btn" id="te_save">${isNew ? 'Создать тест' : 'Сохранить'}</button>
    </div>`, { wide: true });

  function newQ() { return { text: '', image: '', options: ['', ''], optionImages: ['', ''], correct: [0], id: null }; }

  function renderQs() {
    document.getElementById('te_qcount').textContent = data.qs.length ? `(${data.qs.length})` : '';
    document.getElementById('te_questions').innerHTML = data.qs.map((q, qi) => `
      <div class="qcard" data-qi="${qi}">
        <div class="qcard__head">
          <div class="qnum">${qi + 1}</div>
          <textarea class="input" data-f="text" rows="2" placeholder="Текст вопроса" style="flex:1">${esc(q.text)}</textarea>
          ${data.qs.length > 1 ? `<button class="icon-btn icon-btn--danger" data-act="delq" title="Удалить вопрос">${ICONS.trash}</button>` : ''}
        </div>
        <div class="qmedia">
          ${q.image
            ? `<span class="img-prev"><img src="${esc(q.image)}" alt=""><button class="icon-btn" data-act="delqimg" title="Убрать картинку">${ICONS.x}</button></span>`
            : `<button class="btn btn--ghost btn--sm" data-act="qimg">${ICONS.img}<span>Картинка к вопросу</span></button>`}
        </div>
        <div class="opts-edit">
          ${q.options.map((o, oi) => {
            const oim = (q.optionImages && q.optionImages[oi]) || '';
            return `
            <div class="opt-row">
              <label title="Верный ответ (можно отметить несколько)"><input class="pick" type="checkbox" data-qi="${qi}" data-oi="${oi}" ${q.correct.includes(oi) ? 'checked' : ''}><span class="bubble">✓</span></label>
              <input class="input" data-oi="${oi}" placeholder="Вариант ${LETTERS[oi]}" value="${esc(o)}">
              ${oim
                ? `<span class="oimg-thumb"><img src="${esc(oim)}" alt=""><button class="oimg-del" data-act="deloimg" data-oi="${oi}" title="Убрать картинку">✕</button></span>`
                : `<button class="icon-btn oimg-add" data-act="oimg" data-oi="${oi}" title="Добавить картинку к варианту">${ICONS.img}</button>`}
              ${q.options.length > 2 ? `<button class="icon-btn del icon-btn--danger" data-act="delopt" data-oi="${oi}" title="Удалить вариант">${ICONS.x}</button>` : ''}
            </div>`;
          }).join('')}
        </div>
        ${q.options.length < 8 ? `<button class="btn btn--ghost btn--sm" data-act="addopt" style="margin-left:36px">${ICONS.plus}<span>Вариант</span></button>` : ''}
      </div>`).join('');
  }
  renderQs();

  /* делегирование событий внутри редактора */
  modal.addEventListener('input', e => {
    const qc = e.target.closest('.qcard');
    if (!qc) return;
    const qi = +qc.dataset.qi;
    if (e.target.dataset.f === 'text') data.qs[qi].text = e.target.value;
    if (e.target.matches('.opt-row .input')) data.qs[qi].options[+e.target.dataset.oi] = e.target.value;
  });
  modal.addEventListener('change', e => {
    if (!e.target.classList.contains('pick')) return;
    const q = data.qs[+e.target.dataset.qi];
    const oi = +e.target.dataset.oi;
    if (e.target.checked) {
      if (!q.correct.includes(oi)) q.correct.push(oi);
    } else {
      if (q.correct.length === 1) {
        e.target.checked = true;
        toast('У вопроса должен остаться хотя бы один верный ответ', 'err');
        return;
      }
      q.correct = q.correct.filter(x => x !== oi);
    }
  });
  modal.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const qc = e.target.closest('.qcard');
    const qi = qc ? +qc.dataset.qi : -1;
    const act = btn.dataset.act;
    if (act === 'addopt') { data.qs[qi].options.push(''); data.qs[qi].optionImages.push(''); renderQs(); }
    if (act === 'delopt') {
      const oi = +btn.dataset.oi;
      const q = data.qs[qi];
      q.options.splice(oi, 1);
      q.optionImages.splice(oi, 1);
      q.correct = q.correct.filter(x => x !== oi).map(x => x > oi ? x - 1 : x);
      if (!q.correct.length) q.correct = [0];
      renderQs();
    }
    if (act === 'delq') { data.qs.splice(qi, 1); renderQs(); }
    if (act === 'qimg') pickImage(url => { data.qs[qi].image = url; renderQs(); });
    if (act === 'delqimg') { data.qs[qi].image = ''; renderQs(); }
    if (act === 'oimg') { const oi = +btn.dataset.oi; pickImage(url => { data.qs[qi].optionImages[oi] = url; renderQs(); }); }
    if (act === 'deloimg') { data.qs[qi].optionImages[+btn.dataset.oi] = ''; renderQs(); }
  });
  document.getElementById('te_addq').onclick = () => { data.qs.push(newQ()); renderQs(); modal.scrollIntoView({ block: 'end' }); };

  document.getElementById('te_save').onclick = async () => {
    const body = {
      title: document.getElementById('te_title').value,
      description: document.getElementById('te_desc').value,
      timePerQuestion: +document.getElementById('te_time').value,
      passPercent: +document.getElementById('te_pass').value,
      shuffle: document.getElementById('te_shuffle').checked,
      questions: data.qs.map(q => ({
        id: q.id, text: q.text, image: q.image || '',
        options: q.options,
        optionImages: q.options.map((_, oi) => (q.optionImages && q.optionImages[oi]) || ''),
        correct: q.correct.slice().sort((a, b) => a - b)
      }))
    };
    try {
      if (isNew) await api('/api/tests', { method: 'POST', body });
      else await api('/api/tests/' + test.id, { method: 'PUT', body });
      modal.closest('.overlay').remove();
      toast(isNew ? 'Тест создан' : 'Тест сохранён');
      loadTests();
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* ------------------------ доступ к тесту (модалка) ---------------------- */
async function openAccess(testId) {
  let allowed = [], users = [];
  try { ({ allowed, users } = await api(`/api/tests/${testId}/access`)); }
  catch (e) { toast(e.message, 'err'); return; }

  const modal = openModal(`
    <div class="modal__head"><h2>Доступ к тесту</h2><button class="icon-btn" data-close>${ICONS.x}</button></div>
    <div class="modal__body">
      <p style="color:var(--muted);font-size:13.5px">Отметьте, кому выдан доступ: пользователи смогут проходить тест, администраторы — редактировать его. Изменения применяются сразу.</p>
      <div class="field"><input class="input" id="ac_search" placeholder="Поиск по имени или логину"></div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn btn--ghost btn--sm" id="ac_all">Выбрать всех</button>
        <button class="btn btn--ghost btn--sm" id="ac_none">Снять всех</button>
        <span class="badge badge--neutral" id="ac_count" style="margin-left:auto;align-self:center"></span>
      </div>
      <div class="pick-list" id="ac_list"></div>
    </div>
    <div class="modal__foot">
      <button class="btn btn--ghost" data-close>Отмена</button>
      <button class="btn" id="ac_save">Сохранить доступ</button>
    </div>`);

  const set = new Set(allowed);
  const list = () => users.filter(u => !u.main);

  function renderList() {
    const q = document.getElementById('ac_search').value.trim().toLowerCase();
    const rows = list().filter(u => !q || u.name.toLowerCase().includes(q) || u.login.includes(q));
    document.getElementById('ac_list').innerHTML = rows.length ? rows.map(u => `
      <label class="pick-item"><input type="checkbox" class="cbx" data-id="${u.id}" ${set.has(u.id) ? 'checked' : ''}>
        <span class="nm"><b>${esc(u.name)}</b><span>@${esc(u.login)}</span></span>
        ${u.role === 'admin' ? '<span class="badge">может редактировать</span>' : ''}
      </label>`).join('')
      : `<div class="empty" style="padding:24px"><b>Никого не найдено</b>Создайте пользователей во вкладке «Пользователи»</div>`;
    document.getElementById('ac_count').textContent = `доступ: ${set.size}`;
  }
  renderList();

  document.getElementById('ac_search').addEventListener('input', renderList);
  document.getElementById('ac_list').addEventListener('change', e => {
    if (e.target.matches('.cbx')) { e.target.checked ? set.add(e.target.dataset.id) : set.delete(e.target.dataset.id); renderList(); }
  });
  document.getElementById('ac_all').onclick = () => { list().forEach(u => set.add(u.id)); renderList(); };
  document.getElementById('ac_none').onclick = () => { set.clear(); renderList(); };

  document.getElementById('ac_save').onclick = async () => {
    try {
      await api(`/api/tests/${testId}/access`, { method: 'PUT', body: { userIds: [...set] } });
      modal.closest('.overlay').remove();
      toast('Доступ обновлён');
      loadTests();
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* ------------------- временные ссылки на тест (модалка) ------------------ */
async function openLinks(testId) {
  const [tests, links] = await Promise.all([
    api('/api/tests'),
    api(`/api/tests/${testId}/links`).catch(() => [])
  ]);
  const t = tests.find(x => x.id === testId);
  if (!t) { toast('Тест не найден', 'err'); return; }

  const modal = openModal(`
    <div class="modal__head"><h2>Временные ссылки — «${esc(t.title)}»</h2><button class="icon-btn" data-close>${ICONS.x}</button></div>
    <div class="modal__body">
      <p style="color:var(--muted);font-size:13.5px">По ссылке тест может пройти любой человек без аккаунта — перед началом он укажет имя. По истечении срока ссылка «сгорает» автоматически; её можно отозвать и раньше.</p>
      <div class="field"><label>Сколько времени будет действовать новая ссылка</label>
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <button class="btn btn--ghost btn--sm pre" data-min="20">20 минут</button>
          <button class="btn btn--ghost btn--sm pre" data-min="30">30 минут</button>
          <button class="btn btn--ghost btn--sm pre" data-min="60">1 час</button>
          <button class="btn btn--ghost btn--sm pre" data-min="1440">Сутки</button>
          <button class="btn btn--ghost btn--sm pre" data-perm="1">Бессрочная</button>
        </div>
        <div class="row" style="gap:8px">
          <input class="input" id="ln_min" type="number" min="1" max="1440" value="30" style="flex:1">
          <button class="btn" id="ln_gen" style="flex:none">${ICONS.link}<span>Создать ссылку</span></button>
        </div>
        <label class="switch" style="margin-top:8px"><input type="checkbox" id="ln_perm" checked><span class="track"></span><span class="lbl">Бессрочная — действует, пока не отзовёте (для этой ссылки поле срока не учитывается)</span></label>
      </div>
      <div id="ln_new"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0 8px">
        <b style="font-size:14px">Активные ссылки</b>
        <span class="badge badge--neutral" id="ln_count"></span>
      </div>
      <div id="ln_list"></div>
    </div>
    <div class="modal__foot"><button class="btn btn--ghost" data-close>Закрыть</button></div>`);

  async function refresh() {
    const rows = await api(`/api/tests/${testId}/links`).catch(() => []);
    document.getElementById('ln_count').textContent = rows.length;
    const list = document.getElementById('ln_list');
    if (!rows.length) { list.innerHTML = `<div class="empty" style="padding:20px"><b>Активных ссылок нет</b>Создайте ссылку и отправьте её участникам</div>`; return; }
    list.innerHTML = rows.map(l => `
      <div class="review-item" style="display:flex;align-items:center;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="font:500 13px var(--f-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" id="ln_url_${l.token}">${LINK_ORIGIN}/t/${l.token}</div>
          <div style="font-size:12px;color:var(--muted)">${l.permanent
            ? '<span style="color:var(--ok)">бессрочная</span> — действует, пока не отзовёте'
            : `истекает (временная) в ${fmtDate(l.expiresAt)} (через <span class="ln-left" data-exp="${l.expiresAt}"></span>)`}</div>
        </div>
        <button class="btn btn--soft btn--sm" onclick="copyLink('${l.token}')">Копировать</button>
        <button class="icon-btn icon-btn--danger" title="Отозвать" onclick="revokeLink('${testId}','${l.token}')">${ICONS.trash}</button>
      </div>`).join('');
    tickLeft();
  }
  function tickLeft() {
    document.querySelectorAll('.ln-left').forEach(el => {
      const s = Math.max(0, Math.round((+el.dataset.exp - Date.now()) / 1000));
      el.textContent = s > 0 ? fmtTimeLeft(s) : 'истекла';
    });
  }
  refresh();
  /* таймер отсчёта: сам выключается, когда модалка закрыта */
  const interval = setInterval(() => {
    if (!document.body.contains(modal)) { clearInterval(interval); return; }
    tickLeft();
  }, 1000);

  modal.addEventListener('click', e => {
    const pre = e.target.closest('.pre');
    if (!pre) return;
    if (pre.dataset.perm) {
      const cb = document.getElementById('ln_perm');
      cb.checked = true;
      toast('Создадим бессрочную ссылку — поле срока не учитывается');
    } else {
      document.getElementById('ln_perm').checked = false;
      document.getElementById('ln_min').value = pre.dataset.min;
    }
  });

  document.getElementById('ln_gen').onclick = async () => {
    const permanent = document.getElementById('ln_perm').checked;
    const minutes = +document.getElementById('ln_min').value;
    try {
      const l = await api(`/api/tests/${testId}/links`, { method: 'POST', body: permanent ? { permanent: true } : { minutes } });
      const url = `${LINK_ORIGIN}/t/${l.token}`;
      document.getElementById('ln_new').innerHTML = `
        <div class="review-item ok" style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font:500 13px var(--f-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${url}</div>
            <div style="font-size:12px;color:var(--ok)">готова · ${permanent ? 'бессрочная — действует, пока не отзовёте' : `действует ${minutes} ${plural(minutes, 'минута', 'минуты', 'минут')}`}</div>
          </div>
          <button class="btn btn--soft btn--sm" onclick="copyLink('${l.token}')">Копировать</button>
        </div>`;
      try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch { /* clipboard может быть недоступен */ }
      refresh();
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* --------------- временная доступность теста (модалка) ------------------ */
const dtLocal = ms => {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function openAvailability(testId) {
  const tests = await api('/api/tests');
  const t = tests.find(x => x.id === testId);
  if (!t) { toast('Тест не найден', 'err'); return; }

  const hasLimit = t.availableUntil !== null && t.availableUntil !== undefined;
  const modal = openModal(`
    <div class="modal__head"><h2>Доступность теста — «${esc(t.title)}»</h2><button class="icon-btn" data-close>${ICONS.x}</button></div>
    <div class="modal__body">
      <p style="color:var(--muted);font-size:13.5px">Обычный тест доступен всегда. Если включить ограничение, проходить его можно будет только до выбранного момента — после этого тест закроется и для пользователей, и для гостей по ссылкам. Продлить или убрать ограничение можно в любой момент.</p>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:14px">
        <label class="switch"><input type="radio" name="av_mode" value="always" ${hasLimit ? '' : 'checked'}>
          <span class="track" style="display:none"></span><span class="lbl"><b>Всегда доступен</b> — без ограничения по времени</span></label>
        <label class="switch" style="align-items:flex-start"><input type="radio" name="av_mode" value="until" ${hasLimit ? 'checked' : ''}>
          <span class="track" style="display:none"></span>
          <span class="lbl"><b>Временно</b> — доступен до:<br>
            <span style="display:inline-flex;gap:8px;flex-wrap:wrap;margin-top:6px">
              <input class="input" id="av_dt" type="datetime-local" style="width:auto" value="${dtLocal(hasLimit ? t.availableUntil : Date.now() + 3600000)}">
            </span>
            <span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
              <button class="btn btn--ghost btn--sm pre" data-min="30">+30 мин</button>
              <button class="btn btn--ghost btn--sm pre" data-min="60">+1 час</button>
              <button class="btn btn--ghost btn--sm pre" data-min="180">+3 часа</button>
              <button class="btn btn--ghost btn--sm pre" data-min="1440">+сутки</button>
              <button class="btn btn--ghost btn--sm pre" data-min="10080">+неделя</button>
            </span>
            <span class="hint" id="av_status" style="margin-top:8px"></span>
          </span></label>
      </div>
    </div>
    <div class="modal__foot">
      <button class="btn btn--ghost" data-close>Отмена</button>
      <button class="btn" id="av_save">Сохранить</button>
    </div>`);

  const mode = () => modal.querySelector('input[name="av_mode"]:checked').value;
  const dt = () => document.getElementById('av_dt');
  function statusLine() {
    const el = document.getElementById('av_status');
    if (mode() !== 'until' || !dt().value) { el.textContent = ''; return; }
    const ms = new Date(dt().value).getTime();
    const left = ms - Date.now();
    el.textContent = left > 0
      ? `будет доступен ещё ${plural(Math.ceil(left / 60000), 'минуту', 'минуты', 'минут')} (до ${fmtDate(ms)})`
      : 'это время уже в прошлом — тест будет закрыт сразу';
    el.style.color = left > 0 ? '' : 'var(--danger)';
  }
  statusLine();
  dt().addEventListener('input', statusLine);
  modal.addEventListener('change', e => { if (e.target.name === 'av_mode') statusLine(); });
  modal.addEventListener('click', e => {
    const pre = e.target.closest('.pre');
    if (pre) { dt().value = dtLocal(Date.now() + (+pre.dataset.min) * 60000); statusLine(); }
  });

  document.getElementById('av_save').onclick = async () => {
    const body = { availableUntil: null };
    if (mode() === 'until') {
      if (!dt().value) { toast('Укажите время окончания', 'err'); return; }
      body.availableUntil = new Date(dt().value).getTime();
    }
    try {
      await api(`/api/tests/${testId}/availability`, { method: 'PUT', body });
      modal.closest('.overlay').remove();
      toast(body.availableUntil ? 'Ограничение по времени сохранено' : 'Тест снова всегда доступен');
      loadTests();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function copyLink(token) {
  const url = `${LINK_ORIGIN}/t/${token}`;
  try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); }
  catch {
    /* резервный путь копирования */
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove(); toast('Ссылка скопирована');
  }
}

async function revokeLink(testId, token) {
  if (!confirm('Отозвать ссылку? Пройти по ней будет нельзя.')) return;
  try { await api('/api/links/' + token, { method: 'DELETE' }); toast('Ссылка отозвана'); loadTests(); }
  catch (e) { toast(e.message, 'err'); }
}

/* ---------------------------- ПОЛЬЗОВАТЕЛИ ------------------------------ */
async function loadUsers() {
  const users = await api('/api/users');
  const box = document.getElementById('usersTable');
  box.innerHTML = `<table class="tbl"><thead><tr>
    <th>Имя</th><th>Логин</th><th>Роль</th><th>Доступ к тестам</th><th>Прохождений</th><th>Создан</th><th></th>
  </tr></thead><tbody>${users.map(u => `<tr>
    <td><b>${esc(u.name)}</b></td>
    <td class="num">@${esc(u.login)}</td>
    <td>${u.main ? '<span class="badge">Главный админ</span>' : u.role === 'admin' ? '<span class="badge">Администратор</span>' : '<span class="badge badge--neutral">Пользователь</span>'}</td>
    <td class="num">${u.accessCount}</td>
    <td class="num">${u.attemptsCount}</td>
    <td class="num">${fmtDate(u.createdAt)}</td>
    <td style="white-space:nowrap">
      <button class="icon-btn" title="Редактировать" onclick="openUserEditor('${u.id}')">${ICONS.edit}</button>
      ${!u.main && u.id !== me.id ? `<button class="icon-btn icon-btn--danger" title="Удалить" onclick="deleteUser('${u.id}', '${esc(u.name).replace(/'/g, "\\'")}')">${ICONS.trash}</button>` : ''}
    </td>
  </tr>`).join('')}</tbody></table>`;
}

async function openUserEditor(id) {
  const users = await api('/api/users');
  const u = users.find(x => x.id === id) || null;
  const isNew = !u;
  const modal = openModal(`
    <div class="modal__head"><h2>${isNew ? 'Новый пользователь' : 'Редактирование'}</h2><button class="icon-btn" data-close>${ICONS.x}</button></div>
    <div class="modal__body">
      <div class="form-error" id="ue_err"></div>
      <div class="field"><label>Имя и фамилия</label>
        <input class="input" id="ue_name" placeholder="Например: Дана Абаева" value="${esc(u ? u.name : '')}"></div>
      <div class="field"><label>Логин</label>
        <input class="input" id="ue_login" placeholder="латиница, 3–32 символа" value="${esc(u ? u.login : '')}"></div>
      <div class="field"><label>Пароль ${isNew ? '' : '<span style="color:var(--muted);font-weight:400">— оставьте пустым, чтобы не менять</span>'}</label>
        <input class="input" id="ue_pass" type="password" placeholder="${isNew ? 'минимум 4 символа' : 'новый пароль'}"></div>
      <div class="field"><label>Роль</label>
        <select class="select" id="ue_role" ${u && u.main ? 'disabled' : ''}>
          <option value="user" ${!u || u.role === 'user' ? 'selected' : ''}>Пользователь — проходит тесты</option>
          <option value="admin" ${u && u.role === 'admin' && !u.main ? 'selected' : ''}>Администратор — создаёт тесты</option>
        </select>
        ${u && u.main ? '<span class="hint">Роль главного администратора изменить нельзя</span>' : ''}</div>
    </div>
    <div class="modal__foot">
      <button class="btn btn--ghost" data-close>Отмена</button>
      <button class="btn" id="ue_save">${isNew ? 'Создать' : 'Сохранить'}</button>
    </div>`);

  document.getElementById('ue_save').onclick = async () => {
    const errBox = document.getElementById('ue_err');
    errBox.classList.remove('show');
    const body = {
      name: document.getElementById('ue_name').value.trim(),
      login: document.getElementById('ue_login').value.trim(),
      role: document.getElementById('ue_role').value
    };
    const pass = document.getElementById('ue_pass').value;
    if (pass || isNew) body.password = pass;
    try {
      if (isNew) await api('/api/users', { method: 'POST', body });
      else await api('/api/users/' + u.id, { method: 'PUT', body });
      modal.closest('.overlay').remove();
      toast(isNew ? 'Пользователь создан' : 'Изменения сохранены');
      loadUsers();
    } catch (e) { errBox.textContent = e.message; errBox.classList.add('show'); }
  };
}

async function deleteUser(id, name) {
  if (!confirm(`Удалить пользователя «${name}»? Его доступы и результаты будут удалены.`)) return;
  try { await api('/api/users/' + id, { method: 'DELETE' }); toast('Пользователь удалён'); loadUsers(); }
  catch (e) { toast(e.message, 'err'); }
}

/* ----------------------------- РЕЗУЛЬТАТЫ ------------------------------- */
async function loadResults() {
  const [tests, results] = await Promise.all([api('/api/tests'), api('/api/results')]);
  const sel = document.getElementById('resultsFilter');
  const cur = sel.value;
  sel.innerHTML = `<option value="">Все тесты</option>` + tests.map(t => `<option value="${t.id}" ${cur === t.id ? 'selected' : ''}>${esc(t.title)}</option>`).join('');
  sel.onchange = loadResults;
  renderResultsTable(results.filter(r => !sel.value || r.testId === sel.value), document.getElementById('resultsTable'), 'Результатов пока нет');
}

function renderResultsTable(rows, box, emptyText) {
  if (!rows.length) { box.innerHTML = `<div class="empty">${ICONS.chart}<b>${emptyText}</b></div>`; return; }
  box.innerHTML = `<table class="tbl"><thead><tr>
    <th>Дата</th><th>Пользователь</th><th>Тест</th><th>Балл</th><th>Результат</th><th></th>
  </tr></thead><tbody>${rows.map(r => `<tr>
    <td class="num">${fmtDate(r.finishedAt)}</td>
    <td><b>${esc(r.userName)}</b> <span style="color:var(--muted);font-size:12px">@${esc(r.userLogin)}</span></td>
    <td>${esc(r.testTitle)}</td>
    <td class="num">${fmtScore(r.score)} / ${r.total}</td>
    <td><span class="badge ${r.passed ? 'badge--ok' : 'badge--danger'}">${r.percent}%</span></td>
    <td><button class="btn btn--ghost btn--sm" onclick="showAttempt('${r.id}')">Разбор</button></td>
  </tr>`).join('')}</tbody></table>`;
}

async function showAttempt(id) {
  let d;
  try { d = await api('/api/attempts/' + id); }
  catch (e) { toast(e.message, 'err'); return; }
  const modal = openModal(`
    <div class="modal__head"><h2>Разбор прохождения</h2><button class="icon-btn" data-close>${ICONS.x}</button></div>
    <div class="modal__body">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <span class="badge badge--neutral">${esc(d.userName)}</span>
        <span class="badge badge--neutral">${esc(d.testTitle)}</span>
        <span class="badge badge--neutral">${fmtDate(d.finishedAt)}</span>
        <span class="badge ${d.passed ? 'badge--ok' : 'badge--danger'}">${d.score} / ${d.total} · ${d.percent}%</span>
      </div>
      <div id="att_review"></div>
    </div>
    <div class="modal__foot"><button class="btn" data-close>Закрыть</button></div>`, { wide: true });
  renderReview(d.review, modal.querySelector('#att_review'));
}

boot();
