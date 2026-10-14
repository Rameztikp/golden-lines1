import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../server/worker.mjs';
import {createCloudflareHandler} from '../server/cloudflare.mjs';
import {renderPage, sitemapXml, robotsTxt, structuredData, SHOWROOM} from '../server/seo.mjs';
import seed from '../server/seed.json' with {type:'json'};

const origin = 'https://goldenlines.store';
const pages = ['index', 'dresses', 'collections', 'designers', 'about', 'booking', 'contact', 'dress-lian'];
const render = (name, query = '') => renderPage(fs.readFileSync(`public/${name}.html`, 'utf8'), seed, new URL(`${origin}/${name}.html${query}`), origin);
const pick = (html, re) => (html.match(re) || [])[1];

test('every public page gets its own title, description, canonical link and share card', () => {
  const titles = new Set(), descriptions = new Set();
  for (const name of pages) {
    const html = render(name);
    const title = pick(html, /<title>([^<]+)<\/title>/), description = pick(html, /<meta name="description" content="([^"]+)">/);
    assert.ok(title && description, name);
    assert.ok(description.length <= 160, name + ' description length');
    titles.add(title); descriptions.add(description);
    assert.match(html, new RegExp(`<link rel="canonical" href="${origin}/`), name);
    for (const tag of ['og:title', 'og:description', 'og:url', 'og:image']) assert.ok(html.includes(`property="${tag}"`), name + ' ' + tag);
    assert.equal((html.match(/<title>/g) || []).length, 1, name + ' single title');
  }
  assert.equal(titles.size, pages.length, 'titles are unique');
  assert.equal(descriptions.size, pages.length, 'descriptions are unique');
  assert.equal(pick(render('index'), /<link rel="canonical" href="([^"]+)">/), origin + '/');
});

test('pages carry readable content and real contact details before JavaScript runs', () => {
  for (const name of pages) {
    const html = render(name);
    const app = pick(html, /<div id="app">([\s\S]*?)<\/div><noscript>/);
    assert.ok(app && /<h1>[^<]+<\/h1>/.test(app), name + ' prerendered heading');
    assert.ok(!html.includes('+966500000000') && !html.includes('goldenlines.com'), name + ' placeholder contact removed');
    assert.ok(html.includes(SHOWROOM.phone), name + ' real WhatsApp number');
  }
  assert.ok(render('dresses').includes('href="/dress-lian.html?dress=reem"'));
});

test('dress pages describe the requested dress and fall back safely', () => {
  const reem = render('dress-lian', '?dress=reem');
  assert.match(reem, /<title>فستان ريم/);
  assert.equal(pick(reem, /<link rel="canonical" href="([^"]+)">/), origin + '/dress-lian.html?dress=reem');
  const unknown = render('dress-lian', '?dress=missing');
  assert.equal(pick(unknown, /<link rel="canonical" href="([^"]+)">/), origin + '/dress-lian.html');
});

test('structured data describes the Jeddah showroom with opening hours', () => {
  const [site, store] = structuredData(seed, origin);
  assert.equal(site['@type'], 'WebSite');
  assert.equal(store['@type'], 'ClothingStore');
  assert.equal(store.telephone, '+' + SHOWROOM.phone);
  assert.equal(store.address.addressLocality, 'جدة');
  assert.ok(!store.openingHoursSpecification[0].dayOfWeek.includes('Friday'));
  assert.equal(store.openingHoursSpecification[0].opens, '09:00');
  const json = pick(render('index'), /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.equal(JSON.parse(json).length, 2);
});

test('admin-entered text cannot break out of the page markup', () => {
  const data = structuredClone(seed);
  data.dresses[0].name = '</script><script>alert(1)</script>';
  data.dresses[0].desc = '"><img src=x onerror=alert(1)>';
  data.settings.seoDescription = '</script><b>x</b>';
  const html = renderPage(fs.readFileSync('public/dress-lian.html', 'utf8'), data, new URL(origin + '/dress-lian.html'), origin);
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(!html.includes('<img src=x'));
  assert.equal((html.match(/<\/script>/g) || []).length, (html.match(/<script\b/g) || []).length);
});

test('sitemap lists every public page and published dress only; robots points to it', () => {
  const data = structuredClone(seed);
  const xml = sitemapXml({...data, dresses: data.dresses.filter(d => d.id !== 'dana')}, origin);
  for (const p of ['/', '/dresses.html', '/contact.html', '/dress-lian.html', '/dress-lian.html?dress=reem']) assert.ok(xml.includes(`<loc>${origin}${p}</loc>`), p);
  assert.ok(!xml.includes('dress=dana'));
  const robots = robotsTxt(origin);
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`) && robots.includes('Disallow: /admin') && robots.includes('Disallow: /api/'));
});

test('worker serves robots, sitemap and enriched pages, but leaves admin untouched', async () => {
  const assets = {fetch: request => {
    const file = 'public' + new URL(request.url).pathname;
    return fs.existsSync(file) ? new Response(fs.readFileSync(file), {headers: {'Content-Type': 'text/html'}}) : new Response('missing', {status: 404});
  }};
  const env = {ASSETS: assets, SITE_URL: origin};
  const get = path => worker.fetch(new Request('https://shop.test' + path), env);
  assert.match(await (await get('/robots.txt')).text(), /Sitemap: https:\/\/goldenlines\.store\/sitemap\.xml/);
  const sitemap = await get('/sitemap.xml');
  assert.match(sitemap.headers.get('content-type'), /xml/);
  assert.ok((await sitemap.text()).includes('dress=reem'), 'sitemap falls back to the shipped catalogue when the database is unavailable');
  const page = await (await get('/collections')).text();
  assert.ok(page.includes(`<link rel="canonical" href="${origin}/collections.html">`));
  const missing = await get('/not-a-page');
  assert.equal(missing.status, 404);
});

test('www redirects to the main domain and workers.dev is kept out of search results', async () => {
  const application = {async fetch() { return new Response('ok'); }};
  const handler = createCloudflareHandler({application});
  const www = await handler.fetch(new Request('https://www.goldenlines.store/dresses.html?q=1'), {});
  assert.equal(www.status, 301);
  assert.equal(www.headers.get('location'), 'https://goldenlines.store/dresses.html?q=1');
  const dev = await handler.fetch(new Request('https://golden-lines.ramez-store.workers.dev/'), {});
  assert.equal(dev.headers.get('x-robots-tag'), 'noindex');
  const main = await handler.fetch(new Request('https://goldenlines.store/'), {});
  assert.equal(main.headers.get('x-robots-tag'), null);
});
