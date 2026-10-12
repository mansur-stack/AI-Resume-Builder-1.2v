/* ==========================================================
   AI Resume Builder - script.js
   Everything lives inside one IIFE, so nothing leaks to window.
   Sections: state, helpers, editor lists, skills, resume render,
   score, storage, AI demo, assistant, UI (theme/modal/toast), init
   ========================================================== */
(() => {
  'use strict';

  /* ---------- State ---------- */
  const STORAGE_KEY = 'airb.resume.v1';
  const THEME_KEY = 'airb.theme';
  const ACCENTS = { blue: '#2563eb', purple: '#7c3aed', green: '#059669', red: '#dc2626', black: '#111827' };

  const defaultData = () => ({
    personal: { name: '', title: '', email: '', phone: '', location: '', website: '', linkedin: '', github: '', photo: '' },
    summary: '',
    education: [],
    experience: [],
    skills: [],
    projects: [],
    languages: [],
    official: { since: '', position: '', birthDate: '', birthPlace: '', nationality: '', party: '', education: '', graduated: '', specialty: '', degree: '', title: '', languages: '', military: '', awards: '', deputy: '', work: '' },
    relatives: [],
    settings: { template: 'modern', font: "'Inter', sans-serif", size: 14, accent: 'blue', spacing: 1 }
  });

  let resumeData = defaultData();

  /* Field config for every repeatable list (education, experience, ...) */
  const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Native'];
  const LISTS = {
    education: {
      label: 'Education',
      fields: [
        ['school', 'University / School', 'text'], ['degree', 'Degree', 'text'],
        ['field', 'Field of Study', 'text'], ['start', 'Start Date', 'month'],
        ['end', 'End Date', 'month'], ['desc', 'Description', 'textarea']
      ]
    },
    experience: {
      label: 'Experience',
      fields: [
        ['company', 'Company', 'text'], ['position', 'Position', 'text'],
        ['location', 'Location', 'text'], ['start', 'Start Date', 'month'],
        ['end', 'End Date', 'month'], ['desc', 'Description', 'textarea']
      ]
    },
    projects: {
      label: 'Project',
      fields: [
        ['name', 'Project Name', 'text'], ['tech', 'Technologies', 'text'],
        ['url', 'Project URL', 'text'], ['github', 'GitHub URL', 'text'],
        ['desc', 'Project Description', 'textarea']
      ]
    },
    languages: {
      label: 'Language',
      fields: [['name', 'Language', 'text'], ['level', 'Level', 'select']]
    },
    relatives: {
      label: 'Qarindosh',
      fields: [
        ['relation', 'Qarindoshligi', 'text'], ['name', "Familiyasi, ismi va otasining ismi", 'text'],
        ['birth', "Tug'ilgan yili va joyi", 'textarea'], ['work', 'Ish joyi va lavozimi', 'text'],
        ['address', 'Turar joyi', 'textarea']
      ]
    }
  };

  /* ---------- Helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const stripProtocol = u => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  const hasText = v => typeof v === 'string' && v.trim().length > 0;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function fmtMonth(v) {
    if (!v) return '';
    const [y, m] = v.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return m ? `${names[+m - 1]} ${y}` : y;
  }
  function dateRange(start, end) {
    if (!start && !end) return '';
    return `${fmtMonth(start) || ''} - ${end ? fmtMonth(end) : 'Present'}`;
  }
  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj); }
  function setPath(obj, path, val) {
    const keys = path.split('.'); const last = keys.pop();
    keys.reduce((o, k) => o[k], obj)[last] = val;
  }

  let toastTimer;
  function toast(msg, type = 'ok') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = `toast show ${type === 'warn' ? 'warn' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ---------- Validation ---------- */
  function setError(el, msg) {
    const out = $('#err-' + el.id);
    if (out) out.textContent = msg;
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (out) el.setAttribute('aria-describedby', out.id);
  }
  function validateField(el) {
    const v = el.value.trim();
    let msg = '';
    if (el.id === 'p-name' && !v) msg = 'Please enter your name.';
    if (el.id === 'p-title' && !v) msg = 'Please enter your professional title.';
    if (el.id === 'p-email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) msg = 'Please enter a valid email address.';
    setError(el, msg);
    return !msg;
  }
  /** Name + title are required before saving or exporting. Email must be valid if filled. */
  function validateResume() {
    const official = resumeData.settings.template === 'official';
    const ids = official ? ['#p-name', '#p-email'] : ['#p-name', '#p-title', '#p-email'];
    const checks = ids.map(s => [$(s), validateField($(s))]);
    const firstBad = checks.find(([, ok]) => !ok);
    if (firstBad) {
      firstBad[0].focus();
      toast(official ? 'Add your full name first.' : 'Add your name and professional title first.', 'warn');
      return false;
    }
    return true;
  }

  /* ---------- Editor: repeatable lists ---------- */
  function fieldHTML(type, item, [key, label, kind]) {
    const id = `${type}-${item.id}-${key}`;
    const val = esc(item[key] || '');
    let control;
    if (kind === 'textarea') control = `<textarea id="${id}" data-field="${key}" rows="3">${val}</textarea>`;
    else if (kind === 'select') control = `<select id="${id}" data-field="${key}">${LEVELS.map(l => `<option ${item[key] === l ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    else control = `<input id="${id}" data-field="${key}" type="${kind}" value="${val}">`;
    return `<div class="field ${kind === 'textarea' ? 'wide' : ''}"><label for="${id}">${label}</label>${control}</div>`;
  }

  function renderList(type) {
    const cfg = LISTS[type];
    $('#list-' + type).innerHTML = resumeData[type].map((item, i) => `
      <article class="item" data-list="${type}" data-id="${item.id}">
        <div class="item-head">
          <strong>${cfg.label} ${i + 1}</strong>
          <button type="button" class="icon-btn" data-remove="${type}" data-id="${item.id}" aria-label="Delete ${cfg.label} ${i + 1}"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="grid-2">${cfg.fields.map(f => fieldHTML(type, item, f)).join('')}</div>
        ${type === 'experience' ? `<div><button type="button" class="btn btn-ai" data-ai="experience" data-id="${item.id}">✨ Improve Description</button></div>` : ''}
      </article>`).join('');
  }

  function addItem(type) {
    const item = { id: uid() };
    LISTS[type].fields.forEach(([k, , kind]) => { item[k] = kind === 'select' ? 'Intermediate' : ''; });
    resumeData[type].push(item);
    renderList(type);
    updateResume();
    const first = $(`#list-${type} .item:last-child input, #list-${type} .item:last-child select`);
    if (first) first.focus();
  }
  const addEducation = () => addItem('education');
  const addExperience = () => addItem('experience');
  const addProject = () => addItem('projects');
  const addLanguage = () => addItem('languages');

  function removeItem(type, id) {
    resumeData[type] = resumeData[type].filter(i => i.id !== id);
    renderList(type);
    updateResume();
    persist();
  }

  /* ---------- Skills ---------- */
  function addSkills(raw) {
    raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).forEach(s => {
      if (!resumeData.skills.some(x => x.toLowerCase() === s.toLowerCase())) resumeData.skills.push(s);
    });
    renderSkills(); updateResume(); persist();
  }
  function renderSkills() {
    $('#skillList').innerHTML = resumeData.skills.map((s, i) =>
      `<span class="chip">${esc(s)}<button type="button" data-skill="${i}" aria-label="Remove ${esc(s)}">×</button></span>`).join('');
  }

  /* ---------- Resume preview ---------- */
  function descHTML(text) {
    const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    if (lines.every(l => /^[•\-*]/.test(l)))
      return `<ul>${lines.map(l => `<li>${esc(l.replace(/^[•\-*]\s*/, ''))}</li>`).join('')}</ul>`;
    return lines.map(l => /^[•\-*]/.test(l) ? `<ul><li>${esc(l.replace(/^[•\-*]\s*/, ''))}</li></ul>` : `<p>${esc(l)}</p>`).join('');
  }

  function isEmptyResume(d) {
    return !Object.values(d.personal).some(hasText) && !hasText(d.summary) &&
      !Object.values(d.official).some(hasText) && !d.skills.length && ['education', 'experience', 'projects', 'languages', 'relatives'].every(k => !d[k].some(i => Object.entries(i).some(([key, v]) => key !== 'id' && key !== 'level' && hasText(v))));
  }

  /** Uzbek "Ma'lumotnoma" (obyektivka): page 1 = details + work history, page 2 = relatives table. */
  function buildOfficialHTML(d) {
    const o = d.official, p = d.personal;
    const NO = "yo'q";
    const br = s => esc(s).replace(/\n/g, '<br>');
    const val = (s, fallback = '') => (hasText(s) ? br(s.trim()) : fallback);
    const cell = (label, html, full) => `<div class="o-cell${full ? ' full' : ''}"><b>${label}</b><div>${html}</div></div>`;
    const name = esc(p.name) || 'F.I.Sh.';
    const since = (o.since || '').trim();
    const work = (o.work || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => `<p class="o-work">${esc(l)}</p>`).join('');
    const relatives = d.relatives.filter(r => Object.entries(r).some(([k, v]) => k !== 'id' && hasText(v)));
    const rows = relatives.map(r => `<tr><th scope="row">${br(r.relation)}</th><td>${br(r.name)}</td><td>${br(r.birth)}</td><td>${br(r.work)}</td><td>${br(r.address)}</td></tr>`).join('');
    const page2 = relatives.length ? `
      <div class="o-page">
        <h2 class="o-rt">${name}ning yaqin qarindoshlari haqida</h2>
        <p class="o-rs">MA'LUMOT</p>
        <div class="o-tablewrap"><table class="o-table">
          <thead><tr><th>Qarindoshligi</th><th>Familiyasi, ismi va otasining ismi</th><th>Tug'ilgan yili va joyi</th><th>Ish joyi va lavozimi</th><th>Turar joyi</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>` : '';
    return `
      <div class="o-page">
        <div class="o-top">
          <div class="o-heading"><h1>MA'LUMOTNOMA</h1><h2>${name}</h2></div>
          ${p.photo ? `<img class="o-photo" src="${p.photo}" alt="Profile photo">` : '<div class="o-photo o-ph" aria-hidden="true">3x4</div>'}
        </div>
        ${since || hasText(o.position) ? `<p class="o-pos">${esc(since)}${since ? ': ' : ''}<b>${val(o.position)}</b></p>` : ''}
        <div class="o-grid">
          ${cell("Tug'ilgan yili:", val(o.birthDate))}${cell("Tug'ilgan joyi:", val(o.birthPlace))}
          ${cell('Millati:', val(o.nationality))}${cell('Partiyaviyligi:', val(o.party, NO))}
          ${cell("Ma'lumoti:", val(o.education))}${cell('Tamomlagan:', val(o.graduated))}
          ${cell("Ma'lumoti bo'yicha mutaxassisligi:", val(o.specialty), true)}
          ${cell('Ilmiy darajasi:', val(o.degree, NO))}${cell('Ilmiy unvoni:', val(o.title, NO))}
          ${cell('Qaysi chet tillarini biladi:', val(o.languages))}${cell("Harbiy (maxsus) unvoni:", val(o.military, NO))}
          ${cell('Davlat mukofotlari bilan taqdirlanganmi (qanaqa):', val(o.awards, NO), true)}
          ${cell("Xalq deputatlari respublika, viloyat, shahar va tuman Kengashi deputatimi yoki boshqa saylanadigan organlarning a'zosimi (to'liq ko'rsatilishi lozim)", val(o.deputy, NO), true)}
        </div>
        <h3 class="o-h">MEHNAT FAOLIYATI</h3>
        ${work}
      </div>${page2}`;
  }

  function buildResumeHTML(d) {
    if (d.settings.template === 'official') return buildOfficialHTML(d);
    const p = d.personal;
    const contacts = [
      ['fa-envelope', p.email], ['fa-phone', p.phone], ['fa-location-dot', p.location],
      ['fa-globe', p.website && stripProtocol(p.website)], ['fa-brands fa-linkedin', p.linkedin && stripProtocol(p.linkedin)],
      ['fa-brands fa-github', p.github && stripProtocol(p.github)]
    ].filter(([, v]) => hasText(v))
      .map(([ic, v]) => `<span><i class="${ic.includes('fa-brands') ? ic : 'fa-solid ' + ic}"></i>${esc(v)}</span>`).join('');

    const edu = d.education.filter(e => hasText(e.school) || hasText(e.degree)).map(e => `
      <div class="r-item"><div class="r-row"><strong>${esc(e.school)}</strong><span class="r-meta">${esc(dateRange(e.start, e.end))}</span></div>
      <div class="r-meta">${esc([e.degree, e.field].filter(hasText).join(', '))}</div>${descHTML(e.desc)}</div>`).join('');

    const exp = d.experience.filter(e => hasText(e.company) || hasText(e.position)).map(e => `
      <div class="r-item"><div class="r-row"><strong>${esc(e.position)}</strong><span class="r-meta">${esc(dateRange(e.start, e.end))}</span></div>
      <div class="r-meta">${esc([e.company, e.location].filter(hasText).join(' | '))}</div>${descHTML(e.desc)}</div>`).join('');

    const proj = d.projects.filter(x => hasText(x.name)).map(x => `
      <div class="r-item"><div class="r-row"><strong>${esc(x.name)}</strong><span class="r-meta">${esc(x.tech)}</span></div>
      ${descHTML(x.desc)}
      <div class="r-meta">${[x.url, x.github].filter(hasText).map(u => esc(stripProtocol(u))).join(' | ')}</div></div>`).join('');

    const langs = d.languages.filter(l => hasText(l.name)).map(l =>
      `<div class="r-lang"><span>${esc(l.name)}</span><span class="r-meta">${esc(l.level)}</span></div>`).join('');

    const skills = d.skills.map(s => `<span class="r-skill">${esc(s)}</span>`).join('');
    const sec = (title, html) => html ? `<section class="r-sec"><h2>${title}</h2>${html}</section>` : '';

    return `
      <header class="r-head">
        ${p.photo ? `<img class="r-photo" src="${p.photo}" alt="Profile photo">` : ''}
        <div class="r-id"><h1>${esc(p.name) || 'Your Name'}</h1><p class="r-title">${esc(p.title)}</p></div>
        ${contacts ? `<div class="r-contact">${contacts}</div>` : ''}
      </header>
      <div class="r-body">
        <div class="r-main">
          ${sec('Summary', hasText(d.summary) ? `<p>${esc(d.summary)}</p>` : '')}
          ${sec('Experience', exp)}
          ${sec('Projects', proj)}
          ${sec('Education', edu)}
        </div>
        <div class="r-side">
          ${sec('Skills', skills)}
          ${sec('Languages', langs)}
        </div>
      </div>`;
  }

  function applySettings() {
    const s = resumeData.settings, r = $('#resume');
    r.className = `tpl-${s.template}`;
    r.style.setProperty('--accent', ACCENTS[s.accent] || ACCENTS.blue);
    r.style.setProperty('--rfont', s.font);
    r.style.setProperty('--rsize', s.size + 'px');
    r.style.setProperty('--rspace', s.spacing);
    $$('.tpl-card').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.template === s.template)));
    // Official template has its own form cards; CV-only cards are hidden for it (and vice versa)
    const official = s.template === 'official';
    $$('[data-only]').forEach(el => { el.hidden = (el.dataset.only === 'official') !== official; });
    $$('.swatch').forEach(b => b.setAttribute('aria-checked', String(b.dataset.accent === s.accent)));
  }

  /** Re-renders the preview, score and empty state. Called after every change. */
  function updateResume() {
    const empty = isEmptyResume(resumeData);
    $('#emptyState').hidden = !empty;
    $('#resume').hidden = empty;
    $('#pdfBtn').disabled = false;
    if (!empty) $('#resume').innerHTML = buildResumeHTML(resumeData);
    applySettings();
    calculateScore();
  }

  /* ---------- Resume score ---------- */
  function scoreBreakdown(d) {
    const p = d.personal;
    if (d.settings.template === 'official') {
      const o = d.official, count = keys => keys.filter(k => hasText(o[k])).length;
      return [
        ['Name & photo', (hasText(p.name) ? 10 : 0) + (p.photo ? 5 : 0), 15],
        ['Position', hasText(o.position) ? 10 : 0, 10],
        ['Personal data', count(['birthDate', 'birthPlace', 'nationality', 'party', 'education', 'graduated', 'specialty']) * 5, 35],
        ['Other details', count(['degree', 'title', 'languages', 'military', 'awards', 'deputy']) * 2, 12],
        ['Work history', hasText(o.work) ? 18 : 0, 18],
        ['Relatives', d.relatives.some(r => hasText(r.name)) ? 10 : 0, 10]
      ];
    }
    const filled = ['name', 'title', 'email', 'phone', 'location'].filter(k => hasText(p[k])).length;
    const sumLen = d.summary.trim().length;
    return [
      ['Personal info', Math.round(filled * 3), 15],
      ['Summary', sumLen >= 80 ? 15 : sumLen >= 30 ? 10 : sumLen > 0 ? 5 : 0, 15],
      ['Education', d.education.some(e => hasText(e.school)) ? 15 : 0, 15],
      ['Experience', d.experience.some(e => hasText(e.company) || hasText(e.position)) ? (d.experience.some(e => e.desc.trim().length > 40) ? 20 : 14) : 0, 20],
      ['Skills', Math.min(15, d.skills.length * 3), 15],
      ['Projects', d.projects.some(x => hasText(x.name)) ? 10 : 0, 10],
      ['Languages', d.languages.some(l => hasText(l.name)) ? 10 : 0, 10]
    ];
  }
  function calculateScore() {
    const parts = scoreBreakdown(resumeData);
    const total = parts.reduce((n, [, got]) => n + got, 0);
    $('#scoreText').textContent = `${total} / 100`;
    $('#scoreFill').style.width = total + '%';
    $('#scoreBar').setAttribute('aria-valuenow', total);
    $('#scoreList').innerHTML = parts.map(([n, got, max]) => `<li class="${got === max ? 'full' : ''}"><span>${n}</span><span>${got}/${max}</span></li>`).join('');
    return total;
  }

  /* ---------- Storage ---------- */
  function saveResume(showToast = false) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resumeData));
      if (showToast) toast('Resume saved in this browser.');
    } catch (e) {
      toast('Could not save. Storage is full or blocked (try a smaller photo).', 'warn');
    }
  }
  const persist = debounce(() => saveResume(false), 400);

  function loadResume() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (raw && typeof raw === 'object') {
        const base = defaultData();
        resumeData = { ...base, ...raw, personal: { ...base.personal, ...raw.personal }, official: { ...base.official, ...raw.official }, settings: { ...base.settings, ...raw.settings } };
      }
    } catch (e) { resumeData = defaultData(); }
  }

  function clearResume() {
    resumeData = defaultData();
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    renderAll();
    $$('.err').forEach(e => { e.textContent = ''; });
    $$('[aria-invalid]').forEach(i => i.setAttribute('aria-invalid', 'false'));
    toast('All data cleared.');
  }

  /* ---------- Sync form <-> data ---------- */
  function fillStaticInputs() {
    $$('[data-path]').forEach(el => { el.value = getPath(resumeData, el.dataset.path) || ''; });
    const s = resumeData.settings;
    $('#c-template').value = s.template;
    $('#c-font').value = s.font;
    $('#c-size').value = s.size; $('#c-size-out').textContent = s.size;
    $('#c-space').value = s.spacing; $('#c-space-out').textContent = Number(s.spacing).toFixed(1);
  }
  function renderAll() {
    fillStaticInputs();
    Object.keys(LISTS).forEach(renderList);
    renderSkills();
    updateResume();
  }

  /* ---------- Demo data ---------- */
  function loadDemo() {
    const base = defaultData();
    resumeData = {
      ...base,
      personal: {
        name: 'Mansur Nishonboyev', title: 'Frontend Developer', email: 'mansur@example.com', phone: '+998 90 000 00 00',
        location: 'Tashkent, Uzbekistan', website: 'mansur.dev', linkedin: 'linkedin.com/in/mansur', github: 'github.com/mansur', photo: ''
      },
      summary: 'Motivated Frontend Developer with experience in building responsive and modern web applications using HTML, CSS, JavaScript and React. Passionate about creating user-friendly digital experiences and continuously improving technical skills.',
      education: [{ id: uid(), school: 'Tashkent University of Information Technologies', degree: "Bachelor's", field: 'Software Engineering', start: '2021-09', end: '2025-06', desc: 'Focus on web technologies, algorithms and databases.' }],
      experience: [
        { id: uid(), company: 'Digital Studio', position: 'Frontend Developer', location: 'Tashkent', start: '2023-02', end: '', desc: '• Developed responsive websites for multiple clients.\n• Implemented modern UI designs using HTML, CSS and JavaScript.\n• Optimized websites for mobile and desktop devices.' },
        { id: uid(), company: 'Freelance', position: 'Web Developer', location: 'Remote', start: '2022-01', end: '2023-01', desc: '• Built landing pages and small business websites.\n• Collaborated with clients to turn ideas into working products.' }
      ],
      skills: ['HTML', 'CSS', 'JavaScript', 'React', 'Git', 'GitHub', 'Responsive Design'],
      projects: [{ id: uid(), name: 'SayFer Platform', tech: 'React, Vite, Tailwind CSS', url: '', github: 'github.com/mansur/sayfer', desc: 'A digital platform that connects farmers with the tools and information they need.' }],
      languages: [{ id: uid(), name: 'Uzbek', level: 'Native' }, { id: uid(), name: 'English', level: 'Intermediate' }],
      official: {
        since: '2024-yil 1-sentyabrdan', position: "O'zbekiston Respublikasi Namuna vazirligi Axborot texnologiyalari departamenti yetakchi mutaxassisi",
        birthDate: '15.03.2000', birthPlace: 'Toshkent shahri', nationality: "o'zbek", party: "yo'q", education: 'Oliy',
        graduated: "2017-y. Namuna akademik litseyi,\n2021-y. Namuna universiteti", specialty: 'Dasturiy injiniring bakalavri',
        degree: "yo'q", title: "yo'q", languages: 'ingliz, rus tillari', military: "yo'q", awards: "yo'q", deputy: "yo'q",
        work: "2017-2021 yy. – Namuna universiteti talabasi\n2021-2024 yy. – «Namuna» MChJ dasturchisi\n2024-y. - h.v. – Namuna vazirligi yetakchi mutaxassisi"
      },
      relatives: [
        { id: uid(), relation: 'Otasi', name: 'Karimov Anvar Bahodirovich', birth: "1970-yil,\nToshkent shahri", work: 'Nafaqada', address: "Toshkent shahri,\nNamuna ko'chasi 1" },
        { id: uid(), relation: 'Onasi', name: 'Karimova Dilfuza Akramovna', birth: "1972-yil,\nToshkent shahri", work: 'Uy bekasi', address: "Toshkent shahri,\nNamuna ko'chasi 1" }
      ],
      settings: resumeData.settings
    };
    renderAll(); saveResume(false);
    toast('Demo resume loaded.');
  }

  /* ---------- AI demo (no real API; swap in your own, see README) ---------- */
  const joinList = arr => arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

  /** Turns a short summary into a polished paragraph. */
  function aiSummary() {
    const title = resumeData.personal.title.trim() || 'Professional';
    const skills = resumeData.skills.slice(0, 4);
    const years = resumeData.summary.match(/(\d+)\s*\+?\s*(years?|yil)/i);
    const exp = years ? `${years[1]}+ years of experience` : 'experience';
    const tools = skills.length ? ` using ${joinList(skills)}` : '';
    return `Motivated ${title} with ${exp} in building responsive and modern web applications${tools}. Passionate about creating user-friendly digital experiences and continuously improving technical skills.`;
  }

  /** Turns plain sentences into professional bullet points. */
  function aiBullets(text) {
    const verbs = { created: 'Developed', made: 'Built', built: 'Engineered', worked: 'Collaborated', helped: 'Supported', fixed: 'Resolved', managed: 'Led', designed: 'Designed', wrote: 'Authored', did: 'Delivered', added: 'Implemented', made_: 'Built' };
    const bullets = text.split(/[.\n•]+/).map(s => s.trim().replace(/^[-*]\s*/, '').replace(/^I\s+/i, '')).filter(Boolean).map(s => {
      const [first, ...rest] = s.split(/\s+/);
      const verb = verbs[first.toLowerCase()] || (first[0].toUpperCase() + first.slice(1));
      const body = rest.join(' ').replace(/\bwebsites?\b/i, m => `responsive ${m.toLowerCase()}`);
      return `• ${verb} ${body}.`.replace(/\s+\./, '.');
    });
    const extras = ['• Implemented modern UI designs using HTML, CSS and JavaScript.', '• Optimized work for mobile and desktop devices.', '• Collaborated with teammates and clients to deliver on time.'];
    for (const e of extras) { if (bullets.length >= 3) break; bullets.push(e); }
    return bullets.join('\n');
  }

  /** Called by every "Improve" button. Shows a short loading state to feel like a real request. */
  async function improveWithAI(kind, btn, id) {
    const label = btn.innerHTML;
    if (kind === 'summary') {
      if (!hasText(resumeData.summary) && !hasText(resumeData.personal.title)) { toast('Write a short summary or add your title first.', 'warn'); $('#summary').focus(); return; }
    } else {
      const item = resumeData.experience.find(i => i.id === id);
      if (!item || !hasText(item.desc)) { toast('Write a short description first.', 'warn'); return; }
    }
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Improving...';
    await wait(800);
    if (kind === 'summary') {
      resumeData.summary = aiSummary();
      $('#summary').value = resumeData.summary;
    } else {
      const item = resumeData.experience.find(i => i.id === id);
      item.desc = aiBullets(item.desc);
      const ta = $(`#experience-${id}-desc`);
      if (ta) { ta.value = item.desc; ta.rows = 5; }
    }
    btn.disabled = false; btn.innerHTML = label;
    updateResume(); persist();
    toast('Text improved. Review and edit it.');
  }

  /* ---------- AI Assistant (pre-written replies) ---------- */
  const SKILL_IDEAS = [
    [/front|react|web|ui/i, ['TypeScript', 'Responsive Design', 'Accessibility', 'REST APIs', 'Testing']],
    [/back|node|api|server/i, ['Node.js', 'PostgreSQL', 'Docker', 'REST APIs', 'Authentication']],
    [/design|ux/i, ['Figma', 'Prototyping', 'User Research', 'Design Systems']],
    [/data|ml|ai/i, ['Python', 'SQL', 'Pandas', 'Data Visualization']]
  ];
  function assistantReply(key) {
    const d = resumeData;
    if (key === 'summary') return d.summary.trim().length >= 80
      ? 'Your summary has a good length. Mention one measurable result, like "built 10+ responsive sites".'
      : 'Aim for 2-3 sentences: your role, your strongest skills, and what you want to do next. Use the "Improve with AI" button next to the summary to get a draft.';
    if (key === 'experience') return d.experience.length
      ? 'Start each bullet with an action verb and add a number where you can ("Reduced load time by 30%"). The "Improve Description" button can rewrite rough notes.'
      : 'Add at least one experience. Internships, freelance work and personal projects count too.';
    if (key === 'skills') {
      const hit = SKILL_IDEAS.find(([re]) => re.test(d.personal.title));
      const ideas = (hit ? hit[1] : ['Communication', 'Problem Solving', 'Git', 'Teamwork']).filter(s => !d.skills.some(x => x.toLowerCase() === s.toLowerCase()));
      return ideas.length ? `Skills worth adding for your profile: ${ideas.join(', ')}.` : 'You already cover the main skills for your title. Keep the list focused on 8-12 items.';
    }
    if (key === 'check') {
      const missing = scoreBreakdown(d).filter(([, got, max]) => got < max).map(([n, got, max]) => `• ${n} (${got}/${max})`);
      return `Your score is ${calculateScore()}/100.\n` + (missing.length ? `Sections to improve:\n${missing.join('\n')}` : 'Every section is complete. Nice work!');
    }
    if (key === 'pdf') return 'Click "Download PDF", then choose "Save as PDF" in the print dialog. Turn off "Headers and footers" for a cleaner file.';
    if (key === 'template') return 'Modern suits tech and creative roles, Professional suits finance and law, Minimal suits senior or design roles.';
    return 'I can help with your summary, experience, skills, template choice or a full resume check. Try one of the buttons below.';
  }
  function chatMatch(text) {
    const t = text.toLowerCase();
    if (/summar|about/.test(t)) return 'summary';
    if (/experi|job|work/.test(t)) return 'experience';
    if (/skill/.test(t)) return 'skills';
    if (/check|score|review/.test(t)) return 'check';
    if (/pdf|download|print/.test(t)) return 'pdf';
    if (/templ|design|layout/.test(t)) return 'template';
    return 'help';
  }
  function addMessage(text, who) {
    const box = $('#aiMessages');
    const m = document.createElement('div');
    m.className = `msg ${who}`; m.textContent = text;
    box.appendChild(m); box.scrollTop = box.scrollHeight;
    return m;
  }
  async function askAssistant(text, key) {
    addMessage(text, 'user');
    const typing = addMessage('...', 'bot');
    await wait(550);
    typing.textContent = assistantReply(key);
    $('#aiMessages').scrollTop = $('#aiMessages').scrollHeight;
  }
  function toggleAssistant(open) {
    const panel = $('#aiPanel'), fab = $('#aiFab');
    panel.hidden = !open; fab.setAttribute('aria-expanded', String(open));
    if (open) {
      if (!$('#aiMessages').children.length) addMessage('How can I improve my resume?', 'bot');
      $('#aiInput').focus();
    } else fab.focus();
  }

  /* ---------- UI: theme, modal, menu ---------- */
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const btn = $('#themeToggle');
    btn.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
  }
  /** Opens/closes the mobile navigation and keeps the hamburger icon + aria in sync. */
  function setMenu(open) {
    const btn = $('#menuToggle');
    $('#navMenu').classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    btn.innerHTML = open ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
  }
  let lastFocus = null;
  function openModal() { lastFocus = document.activeElement; $('#modal').hidden = false; $('#modalCancel').focus(); }
  function closeModal() { $('#modal').hidden = true; if (lastFocus) lastFocus.focus(); }

  /* ---------- Event wiring ---------- */
  function bindEvents() {
    const editor = $('#editor');

    // Typing in any field: static inputs use data-path, list inputs use data-field
    editor.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.path) {
        setPath(resumeData, t.dataset.path, t.value);
        if (t.hasAttribute('aria-invalid') && t.getAttribute('aria-invalid') === 'true') validateField(t);
      } else if (t.dataset.field) {
        const row = t.closest('.item');
        const item = resumeData[row.dataset.list].find(i => i.id === row.dataset.id);
        if (item) item[t.dataset.field] = t.value;
      } else return;
      updateResume(); persist();
    });
    editor.addEventListener('focusout', e => { if (e.target.hasAttribute('data-validate')) validateField(e.target); });

    // Photo upload (stored as a data URL)
    $('#p-photo').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 1.5 * 1024 * 1024) { toast('Please choose a photo under 1.5 MB.', 'warn'); e.target.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => { resumeData.personal.photo = reader.result; updateResume(); persist(); };
      reader.readAsDataURL(file);
    });
    $('#removePhoto').addEventListener('click', () => { resumeData.personal.photo = ''; $('#p-photo').value = ''; updateResume(); persist(); });

    // Click delegation: add / remove / AI / skill remove
    document.addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      if (add) { addItem(add.dataset.add); return; }
      const rm = e.target.closest('[data-remove]');
      if (rm) { removeItem(rm.dataset.remove, rm.dataset.id); return; }
      const ai = e.target.closest('[data-ai]');
      if (ai) { improveWithAI(ai.dataset.ai, ai, ai.dataset.id); return; }
      const sk = e.target.closest('[data-skill]');
      if (sk) { resumeData.skills.splice(+sk.dataset.skill, 1); renderSkills(); updateResume(); persist(); return; }
      const tpl = e.target.closest('.tpl-card');
      if (tpl) { resumeData.settings.template = tpl.dataset.template; $('#c-template').value = tpl.dataset.template; updateResume(); persist(); $('#builder').scrollIntoView({ behavior: 'smooth' }); toast(`${tpl.querySelector('strong').textContent} template selected.`); return; }
      const sw = e.target.closest('.swatch');
      if (sw) { resumeData.settings.accent = sw.dataset.accent; updateResume(); persist(); }
    });

    // Skills input
    const skillInput = $('#skillInput');
    skillInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkills(skillInput.value); skillInput.value = ''; }
    });
    skillInput.addEventListener('paste', e => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (/[\n,]/.test(text)) { e.preventDefault(); addSkills(text); }
    });
    $('#addSkillBtn').addEventListener('click', () => { addSkills(skillInput.value); skillInput.value = ''; skillInput.focus(); });

    // Customization
    $('#c-template').addEventListener('change', e => { resumeData.settings.template = e.target.value; updateResume(); persist(); });
    $('#c-font').addEventListener('change', e => { resumeData.settings.font = e.target.value; updateResume(); persist(); });
    $('#c-size').addEventListener('input', e => { resumeData.settings.size = +e.target.value; $('#c-size-out').textContent = e.target.value; updateResume(); persist(); });
    $('#c-space').addEventListener('input', e => { resumeData.settings.spacing = +e.target.value; $('#c-space-out').textContent = Number(e.target.value).toFixed(1); updateResume(); persist(); });

    // Top-level buttons
    $('#demoBtn').addEventListener('click', loadDemo);
    $('#saveBtn').addEventListener('click', () => { if (validateResume()) saveResume(true); });
    $('#clearBtn').addEventListener('click', openModal);
    $('#modalCancel').addEventListener('click', closeModal);
    $('#modalConfirm').addEventListener('click', () => { closeModal(); clearResume(); });
    $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
    $('#pdfBtn').addEventListener('click', () => {
      if (!validateResume()) return;
      const prev = document.title;
      document.title = `${resumeData.personal.name.trim()} - Resume`; // becomes the PDF file name
      window.print();
      document.title = prev;
    });

    // Theme + mobile menu
    $('#themeToggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    const menuBtn = $('#menuToggle'), menu = $('#navMenu');
    menuBtn.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
    menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
    // Tap outside the navbar closes the menu; resizing to desktop resets it
    document.addEventListener('click', e => { if (menu.classList.contains('open') && !e.target.closest('.navbar')) setMenu(false); });
    matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

    // Assistant
    $('#aiFab').addEventListener('click', () => toggleAssistant($('#aiPanel').hidden));
    $('#aiClose').addEventListener('click', () => toggleAssistant(false));
    $$('.ai-quick button').forEach(b => b.addEventListener('click', () => askAssistant(b.textContent, b.dataset.q)));
    $('#aiForm').addEventListener('submit', e => {
      e.preventDefault();
      const input = $('#aiInput'), text = input.value.trim();
      if (!text) return;
      input.value = ''; askAssistant(text, chatMatch(text));
    });

    // Escape closes the modal or assistant
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!$('#modal').hidden) closeModal();
      else if ($('#navMenu').classList.contains('open')) { setMenu(false); $('#menuToggle').focus(); }
      else if (!$('#aiPanel').hidden) toggleAssistant(false);
    });
  }

  /* ---------- Init ---------- */
  function init() {
    let theme = 'light';
    try { theme = localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    setTheme(theme);
    loadResume();
    renderAll();
    bindEvents();
    $('#year').textContent = new Date().getFullYear();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
