const API = '/api';

const state = {
  items: [],
  detail: {},
  tab: 'home',
  lib: 'watched',
  journeyItems: {},
  watched: {},
  watchlist: {},
  xp: 0,
};

const watchedKey = 'sahaba_watched_v1';
const listKey = 'sahaba_watchlist_v1';
const xpKey = 'sahaba_xp_v1';

const GENRE_AR = {
  action: 'أكشن',
  adventure: 'مغامرة',
  animation: 'أنميشن',
  biography: 'سيرة ذاتية',
  comedy: 'كوميديا',
  crime: 'جريمة',
  documentary: 'وثائقي',
  drama: 'دراما',
  family: 'عائلي',
  fantasy: 'خيال',
  history: 'تاريخي',
  horror: 'رعب',
  music: 'موسيقى',
  mystery: 'غموض',
  romance: 'رومانسي',
  scifi: 'خيال علمي',
  sport: 'رياضة',
  thriller: 'إثارة',
  war: 'حرب',
  western: 'غربي',
};

function slugify(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function xpBoost() {
  const lvl = levelOf(state.xp);
  return lvl * Math.round(lvl * 2.5) + 15;
}

function worth(m) {
  let base = Number(m.rating || 0) * 1.5 + Number(m.year || 0) / 500;
  if (/2026|2025/.test(String(m.year))) base += 6;
  if (/^mov-/.test(m.id || '')) base += 3;
  return Math.round(base * 10) / 10;
}

async function api(path, opts = {}) {
  const r = await fetch(API + path, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function loadAll() {
  const all = [];
  for (let page = 1; page <= 4; page++) {
    const j = await api('/content?page=' + page + '&limit=2000');
    const rows = Array.isArray(j.data) ? j.data : [];
    all.push(...rows);
    if (rows.length < 2000) break;
  }
  state.items = all;
}

function movies() {
  return state.items.filter((x) => (x.type || 'movie') === 'movie');
}
function series() {
  return state.items.filter((x) => x.type === 'series');
}

function buildJourney() {
  const groups = {};
  const all = movies();
  const mine = all.filter((m) => /^mov-/.test(m.id || '')).sort((a, b) => worth(b) - worth(a));
  if (mine.length) groups['⭐ إصدارات سحابة'] = mine;
  const years = [...new Set(all.map((m) => m.year))].sort((a, b) => b - a);
  years.forEach((y) => {
    const list = all.filter((m) => m.year === y && !/^mov-/.test(m.id || '')).sort((a, b) => worth(b) - worth(a));
    if (list.length) groups['أفلام ' + y] = list;
  });
  const s = series().sort((a, b) => worth(b) - worth(a));
  if (s.length) groups['مسلسلات'] = s;
  const fav = all.filter((m) => Number(m.rating || 0) >= 8).slice(0, 12);
  if (fav.length) groups['النجوم الكبيرة'] = fav;
  return groups;
}

function levelOf(xp) {
  return 1 + Math.floor(xp / 500);
}
function xpForLevel(l) {
  return 500;
}
function levelCaption(l) {
  const names = ['غيمة جديدة', 'سحابة صغيرة', 'سحابة فضية', 'سحابة ذهبية', 'عاصفة نجوم', 'سماء مفتوحة'];
  return names[Math.min(l - 1, names.length - 1)];
}

function persist() {
  try {
    localStorage.setItem(watchedKey, JSON.stringify(state.watched));
    localStorage.setItem(listKey, JSON.stringify(state.watchlist));
    localStorage.setItem(xpKey, String(state.xp));
  } catch (e) {}
}
function hydrate() {
  try {
    state.watched = JSON.parse(localStorage.getItem(watchedKey) || '{}');
    state.watchlist = JSON.parse(localStorage.getItem(listKey) || '{}');
    state.xp = Number(localStorage.getItem(xpKey) || 0);
  } catch (e) {}
}

function card(m) {
  const done = !!state.watched[m.id];
  const year = m.year ? ' · ' + m.year : '';
  const duration = m.duration ? ' · ' + m.duration.replace(/ ?min/, 'د') : '';
  const genre = Array.isArray(m.genre) && m.genre[0] ? GENRE_AR[m.genre[0]] || m.genre[0] : 'فيلم';
  return (
    '<div class="pcard" data-id="' + m.id + '">' +
    '<img loading="lazy" src="' + (m.poster || fallbackPoster()) + '" onerror="this.onerror=null;this.src=\'' + fallbackPoster() + '\'" alt="' + esc(m.titleAr || m.title) + '" />' +
    (done ? '<span class="fin">✅</span>' : '') +
    ((m.rating && Number(m.rating) > 0) ? '<span class="rad">★ ' + m.rating + '</span>' : '') +
    '<div class="meta"><div class="t">' + esc(m.titleAr || m.title) + '</div>' +
    '<div class="ty"><span>' + (m.type === 'series' ? 'مسلسل' : genre) + year + duration + '</span></div></div>' +
    '</div>'
  );
}

function fallbackPoster() {
  return 'https://images.metahub.space/poster/small/tt0111161/img';
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- rendering ---------- */

function renderXP() {
  const bump = xpBoost();
  document.getElementById('xpNum').textContent = state.xp;
  const within = state.xp % 500;
  document.getElementById('xpFill').style.width = (within / 500) * 100 + '%';
}

function renderHome() {
  const m = movies().sort((a, b) => worth(b) - worth(a));
  const hero = m[0] || {};
  document.getElementById('heroTitle').textContent = hero.titleAr || hero.title || '';
  document.getElementById('heroMeta').innerHTML =
    (hero.year ? '<b>' + hero.year + '</b>' : '') +
    (hero.rating ? '  ·  ★ <b>' + hero.rating + '</b>' : '') +
    (hero.quality ? '  ·  ' + hero.quality : '');
  document.getElementById('heroDesc').textContent = hero.description || '';
  document.getElementById('heroBg').style.backgroundImage = 'url(' + (hero.poster || fallbackPoster()) + ')';
  const play = document.querySelector('#heroCard [data-play]');
  const info = document.querySelector('#heroCard [data-info]');
  play.onclick = () => openPlayer(hero.id);
  info.onclick = () => openDetail(hero.id);

  const fillShelf = (el, title, items, cap) => {
    const h = document.getElementById(el);
    const list = items.slice(0, cap || 20);
    h.innerHTML =
      '<div class="shelf-head"><h3>' + title + '</h3><span>' + items.length + ' عنوان</span></div>' +
      '<div class="rail">' + list.map(card).join('') + '</div>';
  };

  fillShelf('shelf-heroes', '🎖️ الأبطال', m.filter((x) => Number(x.rating || 0) >= 8), 24);
  fillShelf('shelf-2025', '🎬 أفلام 2025', m.filter((x) => x.year === 2025), 24);
  fillShelf('shelf-2024', '🌟 أفلام 2024', m.filter((x) => x.year === 2024), 24);
  const classic = m.filter((x) => x.year <= 2010).slice(0, 20);
  fillShelf('shelf-classic', '📼 كلاسيكيات', classic, 20);
  bindCards(document.getElementById('app'));
}

function renderJourney() {
  const groups = buildJourney();
  state.journeyItems = groups;
  const names = Object.keys(groups);
  const j = document.getElementById('journey');
  j.innerHTML = '';
  names.forEach((name, idx) => {
    const items = groups[name];
    const doneCount = items.filter((x) => state.watched[x.id]).length;
    const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
    const unlocked = idx === 0 || doneCount > 0 || state.watched[items[0] && items[0].id];
    const isCurrent = unlocked && pct < 100 && pct > 0;
    const cls = pct >= 100 ? 'done' : unlocked ? 'current' : 'locked';
    const strip = items.slice(0, 6);

    const node =
      '<div class="stage-node ' + cls + '" data-stage="' + idx + '">' +
      (pct >= 100 ? '<span class="s-star">⭐</span>' : '') +
      '<span class="num">' + (idx + 1) + '</span>' +
      (unlocked ? '' : '<span class="lock">🔒</span>') +
      '</div>';

    const cardz =
      '<div class="stage-card glass ' + (unlocked ? '' : 'locked') + '" data-stage="' + idx + '">' +
      '<h4>' + name + '<span class="st">' + doneCount + ' / ' + items.length + '</span></h4>' +
      '<div class="stage-progress"><i style="width:' + pct + '%"></i></div>' +
      '<div class="stage-strip">' +
      strip
        .map((it) => '<img src="' + (it.poster || fallbackPoster()) + '" alt="" data-open="' + it.id + '"' + (state.watched[it.id] ? ' style="filter:grayscale(0.4);opacity:.75"' : '') + '/>')
        .join('') +
      (items.length > 6 ? '<span class="more">+' + (items.length - 6) + '</span>' : '') +
      '</div></div>';

    j.innerHTML += '<div class="stage">' + node + cardz + '</div>';
  });

  j.querySelectorAll('[data-stage]').forEach((n) => {
    n.addEventListener('click', () => {
      const idx = Number(n.dataset.stage);
      openStage(names[idx]);
    });
  });
  j.querySelectorAll('[data-open]').forEach((img) => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail(img.dataset.open);
    });
  });
}

function openStage(name) {
  const groups = buildJourney();
  const items = groups[name] || [];
  const grid = items
    .map((m) => card(m))
    .join('');
  if (!grid) { showToast('🌙 لا عناوين في هذه المرحلة'); return; }
  showToast('📚 ' + name + ' — ' + items.length + ' عنوان');
  document.querySelector('.tab-view.active').classList.remove('active');
  document.getElementById('view-library').classList.add('active');
  document.getElementById('libStats').innerHTML = '<span>📚 ' + name + ': ' + items.length + ' عنوان</span>';
  const gridEl = document.getElementById('libGrid');
  gridEl.classList.add('grid');
  gridEl.innerHTML = grid;
  bindCards(gridEl);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let detailOpen = null;
async function openDetail(id) {
  const overlay = document.getElementById('detailModal');
  const close = document.getElementById('detailClose');
  detailOpen = id;

  const item = state.items.find((x) => x.id === id);
  const meta = item || {};
  const poster = meta.poster || fallbackPoster();
  document.getElementById('detailBg').style.backgroundImage = 'url(' + poster + ')';
  document.getElementById('detailBg').style.display = '';
  document.getElementById('detailPoster').src = poster;
  document.getElementById('detailPoster').style.display = '';
  document.getElementById('detailTitle').textContent = meta.titleAr || meta.title || '';
  document.getElementById('detailEn').textContent = meta.title || '';
  document.getElementById('detailMeta').innerHTML =
    (meta.year ? '<span>📅 ' + meta.year + '</span>' : '') +
    (meta.quality ? ' <span>· ' + meta.quality + '</span>' : '') +
    (meta.rating ? ' <span>· ★ <b>' + meta.rating + '</b></span>' : '') +
    (meta.duration ? ' <span>· ' + meta.duration + '</span>' : '') +
    (meta.language ? ' <span>· ' + meta.language + '</span>' : '');
  document.getElementById('detailGenres').innerHTML = (Array.isArray(meta.genre) ? meta.genre : [])
    .map((g) => '<i>' + (GENRE_AR[g] || g) + '</i>')
    .join('');
  document.getElementById('detailDesc').textContent = meta.description || 'لا يوجد وصف بعد.';

  const cast = (Array.isArray(meta.cast) && meta.cast.length ? meta.cast : []).slice(0, 8);
  document.getElementById('detailCast').innerHTML = cast.length
    ? '🎭 ' + cast.join(' · ')
    : '';

  document.getElementById('detailPlay').onclick = () => { hideDetail(); openPlayer(id); };
  document.getElementById('detailLater').onclick = () => {
    if (state.watchlist[id]) { delete state.watchlist[id]; showToast('✨ أزيلت من لاحقاً'); }
    else { state.watchlist[id] = 1; showToast('🔖 أضيفت إلى لاحقاً'); }
    persist();
  };
  close.onclick = hideDetail;
  overlay.classList.add('open');
  overlay.onclick = (e) => { if (e.target === overlay) hideDetail(); };
}

function hideDetail() {
  document.getElementById('detailModal').classList.remove('open');
}

/* ---------- player ---------- */

function extractImdb(m) {
  const s = (m.sourceUrl || m.id || '');
  const hit = s.match(/tt\d+/);
  return hit ? hit[0] : null;
}

function buildStreams(m) {
  const imdb = extractImdb(m);
  const list = [];
  if (!imdb) return list;
  list.push({
    name: 'سحابة AutoEmbed',
    url: 'https://autoembed.co/movie/imdb/' + imdb + '?lang=ar&sub_language=ara',
  });
  list.push({ name: 'سحابة EmbedSu', url: 'https://embed.su/embed/movie/' + imdb + '?ds_lang=ar' });
  list.push({ name: 'سحابة 2Embed', url: 'https://2embed.cc/embed/movie/' + imdb });
  list.push({ name: 'سحابة VidSrc', url: 'https://vidsrc.to/embed/movie/' + imdb });
  return list;
}

function openPlayer(id) {
  const m = state.items.find((x) => x.id === id);
  if (!m) return;
  const streams = buildStreams(m);
  document.getElementById('playerTitle').textContent = m.titleAr || m.title || '';
  const wrap = document.getElementById('playerServers');
  wrap.innerHTML = '';
  const frame = document.getElementById('playerFrame');
  const markDone = () => {
    if (!state.watched[m.id]) {
      state.watched[m.id] = 1;
      state.xp += xpBoost();
      persist();
      showToast('🎉 أحسنت! +' + xpBoost() + ' نقاط — لمعت نجمتك', true);
      renderXP();
      checkStageComplete(m.id);
    }
  };
  streams.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'server-btn' + (i === 0 ? ' active' : '');
    b.textContent = s.name;
    b.onclick = () => {
      wrap.querySelectorAll('.server-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      frame.src = s.url;
      markDone();
    };
    wrap.appendChild(b);
  });
  frame.src = streams[0] ? streams[0].url : 'about:blank';
  markDone();
  document.getElementById('playerClose').onclick = closePlayer;
  document.getElementById('playerOverlay').classList.add('open');
  document.querySelector('.player-overlay').onclick = (e) => { if (e.target === e.currentTarget) closePlayer(); };
}

function closePlayer() {
  document.getElementById('playerOverlay').classList.remove('open');
  document.getElementById('playerFrame').src = 'about:blank';
}

/* ---------- library ---------- */

function renderLibrary() {
  const watchedIds = Object.keys(state.watched);
  const listIds = Object.keys(state.watchlist);
  document.getElementById('libStats').innerHTML =
    '<span>✅ شاهدتها: <b>' + watchedIds.length + '</b></span>' +
    '<span>🔖 لاحقاً: <b>' + listIds.length + '</b></span>' +
    '<span>🎖️ مستوى: <b>' + levelOf(state.xp) + '</b> — ' + levelCaption(levelOf(state.xp)) + '</span>';
  const grid = document.getElementById('libGrid');
  let items = [];
  if (state.lib === 'watched') {
    items = watchedIds.map((id) => state.items.find((x) => x.id === id)).filter(Boolean);
  } else {
    items = listIds.map((id) => state.items.find((x) => x.id === id)).filter(Boolean);
  }
  grid.innerHTML = items.length ? items.map(card).join('') : '<div class="empty col" style="grid-column:1/-1"><i>' + (state.lib === 'watched' ? '🍿' : '🔖') + '</i>لا شيء هنا بعد</div>';
  bindCards(grid);
}

function renderSearch(q) {
  const grid = document.getElementById('searchGrid');
  const t = (q || '').trim().toLowerCase();
  if (!t) { grid.innerHTML = '<div class="empty col" style="grid-column:1/-1"><i>🔍</i>اكتب اسماً لتجد كنزك</div>'; return; }
  const out = state.items
    .filter((x) => (x.titleAr || x.title || '').toLowerCase().includes(t))
    .slice(0, 30);
  grid.innerHTML = out.length ? out.map(card).join('') : '<div class="empty col" style="grid-column:1/-1"><i>🌫️</i>لا نتائج… جرّب اسماً آخر</div>';
  bindCards(grid);
}

/* ---------- binding ---------- */

function bindCards(root) {
  root.querySelectorAll('.pcard').forEach((c) => {
    c.addEventListener('click', () => openDetail(c.dataset.id));
  });
}

let toastTimer = null;
function showToast(txt, spark = false) {
  const t = document.getElementById('toast');
  t.innerHTML = (spark ? '<span class="spark">⭐</span>' : '') + txt;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

const CONFETTI_COLORS = ['#f5c518', '#7c5cff', '#38e1ff', '#ff5fa4', '#34e3a2', '#ffdf6b'];
function celebrate(title, sub) {
  const layer = document.getElementById('confetti');
  layer.innerHTML = '';
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.top = '-8vh';
    c.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    c.style.animationDuration = 2.2 + Math.random() * 2.2 + 's';
    c.style.animationDelay = Math.random() * 0.7 + 's';
    c.style.opacity = 0.65 + Math.random() * 0.35;
    layer.appendChild(c);
  }
  const badge = document.getElementById('stageBadge');
  document.getElementById('badgeTitle').textContent = title;
  document.getElementById('badgeSub').textContent = sub || '';
  badge.classList.remove('show');
  void badge.offsetWidth;
  badge.classList.add('show');
  setTimeout(() => { layer.innerHTML = ''; badge.classList.remove('show'); }, 4200);
}

function checkStageComplete(itemId) {
  const groups = buildJourney();
  for (const name of Object.keys(groups)) {
    const items = groups[name];
    const mine = items.find((x) => x.id === itemId);
    if (!mine) continue;
    const all = items.every((x) => state.watched[x.id]);
    if (all) {
      celebrate('أتممت المرحلة: ' + name, items.length + ' عنوان — نجمة ذهبية ⭐');
      state.xp += 120;
      persist();
      renderXP();
    }
    break;
  }
}

function bindNav() {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      const tab = b.dataset.tab;
      document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
      const target = document.getElementById('view-' + tab);
      target.classList.add('active');
      if (tab === 'journey') renderJourney();
      if (tab === 'library') renderLibrary();
      if (tab === 'search') renderSearch(document.getElementById('searchInput').value);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  document.getElementById('logo').addEventListener('click', () => {
    document.querySelector('.nav-btn[data-tab=home]').click();
  });
  document.getElementById('xpBtn').addEventListener('click', () => {
    const lvl = levelOf(state.xp);
    showToast('🎖️ المستوى ' + lvl + ' — ' + levelCaption(lvl) + '<br><small>' + state.xp + ' نقطة إجمالاً</small>');
  });
  document.querySelectorAll('.lib-tab').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.lib-tab').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.lib = b.dataset.lib;
      renderLibrary();
    });
  });
  const si = document.getElementById('searchInput');
  si.addEventListener('input', () => renderSearch(si.value));
  document.getElementById('searchBtn').addEventListener('click', () => renderSearch(si.value));
  si.addEventListener('keydown', (e) => { if (e.key === 'Enter') renderSearch(si.value); });
}

/* ---------- boot ---------- */

async function boot() {
  hydrate();
  renderXP();
  bindNav();
  showToast('☁️ جارٍ تحميل السحابة…');
  try {
    await loadAll();
    renderHome();
    showToast('✨ أهلاً بك في سحابة، رحلتك بدأت!');
  } catch (e) {
    showToast('⚠️ تعذّر الاتصال، تأكد أن السيرفر يعمل', false);
    document.getElementById('heroTitle').textContent = 'لا اتصال';
  }
}

document.addEventListener('DOMContentLoaded', boot);