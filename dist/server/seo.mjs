// تحسين الظهور في محركات البحث: يُضاف إلى كل صفحة عامة قبل إرسالها
// عنوانٌ ووصفٌ خاصّان بها، ورابطٌ أساسي، وبطاقة مشاركة، وبيانات المحل لجوجل،
// ونسخة نصية من المحتوى يقرؤها محرك البحث قبل تشغيل الجافاسكربت.

export const DEFAULT_ORIGIN = 'https://goldenlines.store';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clip = (value, max) => { const s = String(value ?? '').replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s; };
const absolute = (origin, path) => !path ? '' : /^https?:\/\//.test(path) ? path : origin + (path.startsWith('/') ? path : '/' + path);
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const hour = h => String(h).padStart(2, '0') + ':00';

// بيانات المعرض الفعلية (نفسها المستخدمة في خريطة الموقع وزر واتساب). تُستخدم ما لم تُحدَّد في الإعدادات.
export const SHOWROOM = {phone:'966582620880', address:'حي الحمراء، شارع فلسطين، جدة 23323', street:'شارع فلسطين، حي الحمراء', postalCode:'23323'};
const phoneOf = s => s.phone || SHOWROOM.phone;
const addressOf = s => /حي|شارع/.test(s.address || '') ? s.address : SHOWROOM.address;

const PAGE_PATHS = {home:'/', dresses:'/dresses.html', collections:'/collections.html', designers:'/designers.html', about:'/about.html', booking:'/booking.html', contact:'/contact.html', detail:'/dress-lian.html'};

export function currentDress(data, url) {
  const requested = url.searchParams.get('dress');
  return (requested && data.dresses.find(d => d.id === requested)) || data.dresses.find(d => d.id === 'lian') || data.dresses[0] || null;
}

function dressPath(dress) {
  return '/dress-lian.html' + (dress.id === 'lian' ? '' : '?dress=' + encodeURIComponent(dress.id));
}

// يُرجع العنوان والوصف والرابط الأساسي والصورة لكل صفحة.
export function pageMeta(page, data, url, origin = DEFAULT_ORIGIN) {
  const s = data.settings, name = s.name;
  const place = 'جدة';
  const pageImage = '/images/hero-bride.jpg';
  const metas = {
    home: {title: s.seoTitle || `${name} | فساتين زفاف في ${place}`, description: s.seoDescription || `${name} دار أزياء زفاف في ${place}: تصاميم راقية وتفصيل حسب المقاس وتجربة خاصة لكل عروس.`, image: pageImage},
    dresses: {title: `فساتين زفاف في ${place} — ${name}`, description: `تصفّحي فساتين الزفاف في ${name} بجدة: ${data.dresses.slice(0, 5).map(d => 'فستان ' + d.name).join('، ')}، مع عارض متعدد الزوايا وحجز موعد للتجربة.`, image: data.dresses[0]?.image || pageImage},
    collections: {title: `مجموعات فساتين الزفاف — ${name}`, description: `مجموعات فساتين الزفاف في ${name} بجدة: ${data.collections.map(c => c.name).join('، ')}.`, image: data.collections[0]?.image || pageImage},
    designers: {title: `مصممو فساتين الزفاف — ${name}`, description: `تعرّفي على مصممي فساتين الزفاف في ${name} بجدة: ${data.designers.map(d => d.name).join('، ')}.`, image: data.designers[0]?.image || pageImage},
    about: {title: `عن ${name} — دار أزياء زفاف في ${place}`, description: `${name} دار أزياء زفاف في ${place} تقدّم تصاميم راقية وتفصيلاً حسب المقاس وتجربة خاصة لكل عروس.`, image: '/images/showroom.jpg'},
    booking: {title: `احجزي موعدك عبر واتساب — ${name}`, description: `تواصلي مع معرض ${name} في جدة عبر واتساب لحجز موعد ${(s.services || []).join(' أو ') || 'تجربة فستان الزفاف'}. ساعات العمل: ${s.hours}.`, image: '/images/entrance.jpg'},
    contact: {title: `تواصل معنا — ${name} في ${place}`, description: `عنوان ${name}: ${addressOf(s)}. ساعات العمل: ${s.hours}. تواصلي معنا عبر واتساب لأي استفسار.`, image: '/images/showroom.jpg'},
  };
  let meta = metas[page], path = PAGE_PATHS[page];
  if (page === 'detail') {
    const dress = currentDress(data, url);
    if (dress) {
      meta = {title: `فستان ${dress.name} — فساتين زفاف ${name}`, description: `${dress.desc} رمز التصميم ${dress.code}.`, image: dress.image};
      path = dressPath(dress);
    }
  }
  if (!meta) return null;
  return {title: clip(meta.title, 70), description: clip(meta.description, 160), canonical: origin + path, image: absolute(origin, meta.image)};
}

// بيانات المحل بصيغة schema.org، تقرؤها جوجل لعرض الاسم والعنوان وساعات العمل.
export function structuredData(data, origin = DEFAULT_ORIGIN) {
  const s = data.settings;
  const openDays = DAYS.filter((_, i) => !(s.closedDays || []).includes(i));
  const store = {
    '@context': 'https://schema.org', '@type': 'ClothingStore', '@id': origin + '/#store',
    name: s.name, alternateName: [s.englishName, s.tagline].filter(Boolean).join(' '),
    description: s.seoDescription, url: origin + '/', logo: absolute(origin, s.logo), image: absolute(origin, '/images/showroom.jpg'),
    address: {'@type': 'PostalAddress', streetAddress: /حي|شارع/.test(s.address || '') ? s.address : SHOWROOM.street, addressLocality: 'جدة', postalCode: SHOWROOM.postalCode, addressCountry: 'SA'},
  };
  if (Number.isInteger(s.openTime) && Number.isInteger(s.closeTime) && openDays.length) store.openingHoursSpecification = [{'@type': 'OpeningHoursSpecification', dayOfWeek: openDays, opens: hour(s.openTime), closes: hour(s.closeTime)}];
  store.telephone = '+' + phoneOf(s);
  if (s.email) store.email = s.email;
  const sameAs = ['instagram', 'tiktok', 'youtube', 'snapchat'].map(k => s[k]).filter(Boolean);
  if (sameAs.length) store.sameAs = sameAs;
  const site = {'@context': 'https://schema.org', '@type': 'WebSite', '@id': origin + '/#website', name: s.name, alternateName: store.alternateName, url: origin + '/', inLanguage: 'ar'};
  return [site, store];
}

function headTags(meta, data, origin) {
  const s = data.settings;
  const json = JSON.stringify(structuredData(data, origin)).replace(/</g, '\\u003c');
  return [
    `<link rel="canonical" href="${esc(meta.canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(s.name)}">`,
    `<meta property="og:locale" content="ar_SA">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:url" content="${esc(meta.canonical)}">`,
    meta.image ? `<meta property="og:image" content="${esc(meta.image)}">` : '',
    `<meta name="twitter:card" content="summary_large_image">`,
    `<script type="application/ld+json">${json}</script>`,
  ].filter(Boolean).join('');
}

const link = (href, label) => `<a href="${esc(href)}">${esc(label)}</a>`;
const list = items => items.length ? `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '';

// نسخة نصية من المحتوى داخل #app؛ تستبدلها الواجهة فور تحميلها.
export function prerender(page, data, url) {
  const s = data.settings;
  const dressItems = data.dresses.map(d => `${link(dressPath(d), 'فستان ' + d.name)} — ${esc(d.desc)}`);
  const contact = `<p>العنوان: ${esc(addressOf(s))}. ساعات العمل: ${esc(s.hours)}. واتساب: ${link('https://wa.me/' + phoneOf(s), '+' + phoneOf(s))}.${s.email ? ' البريد: ' + link('mailto:' + s.email, s.email) + '.' : ''}</p>`;
  const nav = `<nav aria-label="روابط الموقع">${[['/', 'الرئيسية'], ['/dresses.html', 'فساتين الزفاف'], ['/collections.html', 'المجموعات'], ['/designers.html', 'المصممون'], ['/about.html', 'عن ' + s.name], ['/booking.html', 'حجز موعد'], ['/contact.html', 'تواصل معنا']].map(([h, l]) => link(h, l)).join(' · ')}</nav>`;
  let body;
  switch (page) {
    case 'home': body = `<h1>${esc(s.name)} — فساتين زفاف في جدة</h1><p>${esc(s.seoDescription)}</p><h2>فساتين مختارة</h2>${list(dressItems)}<h2>المجموعات</h2>${list(data.collections.map(c => `${esc(c.name)}: ${esc(c.description)}`))}${contact}`; break;
    case 'dresses': body = `<h1>فساتين الزفاف</h1>${list(dressItems)}`; break;
    case 'collections': body = `<h1>مجموعات فساتين الزفاف</h1>${list(data.collections.map(c => `${esc(c.name)}: ${esc(c.description)}`))}`; break;
    case 'designers': body = `<h1>المصممون</h1>${list(data.designers.map(d => `${esc(d.name)} (${esc(d.special)}): ${esc(d.bio)}`))}`; break;
    case 'about': body = `<h1>عن ${esc(s.name)}</h1><p>${esc(s.name)} دار أزياء زفاف في جدة تقدّم تصاميم راقية وتفصيلاً حسب المقاس وتجربة خاصة لكل عروس.</p>${contact}`; break;
    case 'booking': body = `<h1>احجزي موعدك عبر واتساب</h1><p>الخدمات: ${esc((s.services || []).join('، '))}.</p>${contact}`; break;
    case 'contact': body = `<h1>تواصل معنا</h1>${contact}`; break;
    case 'detail': {
      const d = currentDress(data, url);
      if (!d) return '';
      const designer = data.designers.find(x => String(x.id) === String(d.designer));
      const group = data.collections.find(x => x.id === d.group);
      body = `<h1>فستان ${esc(d.name)}</h1><p>${esc(d.desc)}</p><ul><li>رمز التصميم: ${esc(d.code)}</li>${group ? `<li>المجموعة: ${esc(group.name)}</li>` : ''}${designer ? `<li>المصمم: ${esc(designer.name)}</li>` : ''}${d.sizes?.length ? `<li>المقاسات: ${esc(d.sizes.join('، '))}</li>` : ''}</ul><img src="${esc(d.image)}" alt="فستان ${esc(d.name)} من ${esc(s.name)}" width="600" height="800">`;
      break;
    }
    default: return '';
  }
  return `<main id="main" class="container section">${body}${nav}</main>`;
}

const pageOf = html => (html.match(/<body[^>]*\bdata-page="([a-z]+)"/) || [])[1] || null;

// يحوّل ملف HTML العام إلى نسخة جاهزة لمحركات البحث. يُرجع الملف كما هو إن لم يكن صفحة معروفة.
export function renderPage(html, data, url, origin = DEFAULT_ORIGIN) {
  const page = pageOf(html);
  const meta = page && pageMeta(page, data, url, origin);
  if (!meta) return html;
  const s = data.settings;
  const noscript = `فعّلي JavaScript لعرض الكتالوج كاملاً. العنوان: ${esc(addressOf(s))}. واتساب: +${esc(phoneOf(s))}.${s.email ? ' البريد: ' + esc(s.email) + '.' : ''}`;
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(meta.description)}">`)
    .replace('</head>', headTags(meta, data, origin) + '</head>')
    .replace('<div id="app"></div>', `<div id="app">${prerender(page, data, url)}</div>`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/, `<noscript>${noscript}</noscript>`);
}

export function robotsTxt(origin = DEFAULT_ORIGIN) {
  return `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
}

export function sitemapXml(data, origin = DEFAULT_ORIGIN) {
  const paths = ['/', '/dresses.html', '/collections.html', '/designers.html', '/about.html', '/booking.html', '/contact.html', ...data.dresses.map(dressPath)];
  const urls = [...new Set(paths)].map(p => `<url><loc>${esc(origin + p)}</loc></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}
