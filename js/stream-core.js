// منطق بناء روابط المشاهدة — مشترك بين خادم الإضافة ومتصفح التطبيق.
// بلا أي اعتماد على Node حتى يعمل البحث من المتصفح مباشرة على الاستضافة الثابتة.
const cache = new Map();
const UA = { 'User-Agent': 'sahaba-app/4.0 (+https://github.com/abodytxbuss-cyber/sahaba-app)' };
const ttl = ms => Date.now() + ms;

const normalize = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const yearOf = m => Number(m.year) || Number(String(m.releaseInfo || '').match(/\d{4}/)?.[0]) || 0;

async function getJSON(url, ms = 25000) {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.value;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw Error('archive ' + r.status);
  const value = await r.json();
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  cache.set(url, { value, expires: ttl(ms) });
  return value;
}

// بحث واحد محدود بالوقت: روابط MP4 مباشرة + أول رابط تنزيل للاحتياط
const PD_LICENSE = /publicdomain|public\s*domain|creativecommons\.org\/(publicdomain|licenses\/zero)/i;
async function archiveLookup(item, deadline) {
  const title = item.name || item.title || '';
  const year = yearOf(item);
  const empty = { direct: [], first: '' };
  if (!title || !year) return empty;
  const budget = () => Math.max(1500, deadline - Date.now());
  let identifiers = [];
  try {
    // Archive لا يقبل mediatype:(movies) بس year:[.. TO ..] يعمل ضمن نطاق السنة
    const q = `title:("${title}") AND mediatype:movies AND year:[${year - 1} TO ${year + 1}]`;
    const data = await getJSON('https://archive.org/advancedsearch.php?q=' + encodeURIComponent(q) + '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&rows=8&page=1&output=json', budget());
    identifiers = (data.response?.docs || []).map(d => d.identifier).filter(Boolean);
  } catch { return empty; }

  const target = normalize(title).split(' ').filter(w => w.length > 2);
  const direct = [];
  let first = '';
  // مقاطع الكاميرا الملوّصة: VID_20251028-135122 وأخواتها تطابق كلمات عامة
  const camera = /^(vid|dsc|pxl|img|mvi)[-_]?\d{4,}/i;
  // نتحقق من ترخيص الملكية العامة قبل أي رابط مباشر، ونقتصر على مرشحين قليلين للأفلام الحديثة
  const limit = year <= 1963 ? 4 : 2;
  for (const identifier of identifiers.slice(0, limit)) {
    if (Date.now() > deadline) break;
    try {
      const meta = await getJSON('https://archive.org/metadata/' + identifier, budget());
      const files = (meta.files || []).filter(f => /\.(mp4|m4v)$/i.test(f.name || '') && Number(f.size) > 8 * 1048576);
      if (!files.length) continue;
      const source = normalize(meta.metadata?.title || '');
      const sourceWords = source.split(' ').filter(Boolean);
      const overlap = target.filter(w => sourceWords.includes(w)).length;
      const itemYear = Number(meta.metadata?.year) || 0;
      // كلمة واحدة فقط: نطلب أيضاً أن يحمل المعرّف الاسم، وإلا نلتقط فيديوهات تحمله بالصدفة
      const titleHit = target.length > 1 ? overlap / target.length >= 0.6
        : target.length === 1 && sourceWords.includes(target[0])
          && normalize(identifier).includes(target[0]) && !camera.test(source);
      if (!titleHit || camera.test(identifier)) continue;
      if (itemYear && year && Math.abs(itemYear - year) > 1) continue;
      if (!PD_LICENSE.test(`${meta.metadata?.licenseurl || ''} ${meta.metadata?.rights || ''}`)) continue;
      const label = identifier.split(/[-_]/)[0];
      for (const file of files.slice(0, 2)) {
        const link = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(file.name)}`;
        if (!first) first = link;
        if (direct.length >= 4) break;
        direct.push({
          name: 'أرشيف عامة',
          title: `${label} · ${Math.round(Number(file.size) / 1048576)} ميغابايت`,
          url: link,
          behaviorHints: { notWebReady: false, bingeGroup: 'sahaba-archive' },
        });
      }
      if (direct.length) break;
    } catch { }
  }
  return { direct, first };
}

// مشغّل مضمّن يعمل داخل الصفحة: يعيد رابطاً قابلاً للتشغيل المباشر دون مغادرة سحابة
export const playable = source => ({
  name: 'سحابة · مشغل مضمّن',
  title: 'يفتح داخل الصفحة من الأرشيف',
  url: source.replace('/download/', '/details/'),
  externalUrl: source,
  behaviorHints: { notWebReady: true },
});

// المزوّدون يفتحون مشغّلهم داخل الصفحة عبر إطار مستقل
export const providers = (item) => {
  const imdb = String(item.id).match(/tt\d+/)?.[0];
  if (!imdb) return [];
  const kind = item.type === 'series' ? 'tv' : 'movie';
  const path = kind === 'tv' ? 'embed/tv' : 'embed/movie';
  return [
    { name: 'سحابة · عربي', title: 'رابط عربي من مزوّد خارجي', url: `https://autoembed.co/${kind}/imdb/${imdb}?lang=ar&sub_language=ara`, behaviorHints: { notWebReady: true } },
    { name: 'سحابة · تزامن عربي', title: 'مزامنة الترجمة العربية', url: `https://embed.su/${path}/${imdb}?ds_lang=ar`, behaviorHints: { notWebReady: true } },
    { name: 'سحابة · 2Embed', title: 'مصدر احتياطي', url: `https://2embed.cc/embed/${kind}/${imdb}`, behaviorHints: { notWebReady: true } },
    { name: 'سحابة · VidSrc', title: 'مصدر احتياطي', url: `https://vidsrc.to/embed/${kind}/${imdb}`, behaviorHints: { notWebReady: true } },
    { name: 'سحابة · خارجي', title: 'مصدر خارجي إضافي', url: `https://${kind === 'tv' ? 'tv' : 'movie'}watch.online/movie/${imdb}`, behaviorHints: { notWebReady: true } },
    { name: 'سحابة · بحث', title: 'ابحث عن الفيلم في مصدر آخر', url: `https://www.bing.com/videos/search?q=${encodeURIComponent((item.name || '') + ' ' + imdb + ' full movie')}`, behaviorHints: { notWebReady: true } },
  ];
};

// القائمة الكاملة: MP4 مباشر من الأرشيف (للملكية العامة) أو مشغّل مضمّن، ثم المزوّدون دائماً
export async function buildStreams(item, budgetMs = 12000) {
  const { direct, first } = await archiveLookup(item, Date.now() + budgetMs);
  const list = direct.length ? direct : (first ? [playable(first)] : []);
  list.push(...providers(item));
  return list;
}
