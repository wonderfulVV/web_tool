#!/usr/bin/env node
/**
 * 真实 HTTP 验证：抓取每个页面，把页面里引用的本地资源逐个请求一遍，统计非 200。
 *
 * 用法：
 *   node tools/verify-http.mjs [baseUrl]
 * 默认 baseUrl = http://127.0.0.1:8899
 *
 * 用途：部署前在本地静态服务器上验证，或部署后直接对着线上域名跑一遍。
 */

const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/$/, '');

const PAGES = [
  '/',
  '/404.html',
  '/about/index.html',
  '/pages/submit_site.html',
  '/pages/tool_guide.html',
  '/pages/resource_recommendation.html',
  '/robots.txt',
  '/sitemap.xml',
  '/ads.txt',
];

const REF_RE =
  /(?:src|href|data-src|data-original)\s*=\s*["']([^"']+)["']|url\(\s*['"]?([^'")]+?)['"]?\s*\)/gi;
const ASSET_EXT_RE =
  /\.(css|m?js|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|otf)$/i;

const results = { ok: 0, fail: [] };
const checked = new Set();

async function head(url, attempt = 0) {
  try {
    // 部分静态服务器对 HEAD 支持不全，统一用 GET
    const res = await fetch(url, { redirect: 'manual' });
    return res.status;
  } catch (e) {
    // 本地简易服务器并发能力弱，连接类错误重试两次再判定失败
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
      return head(url, attempt + 1);
    }
    return `ERR ${e.message}`;
  }
}

async function check(url, from) {
  if (checked.has(url)) return;
  checked.add(url);
  const status = await head(url);
  if (status === 200) results.ok++;
  else results.fail.push({ url, status, from });
}

console.log(`验证目标: ${BASE}`);
console.log('='.repeat(60));

for (const page of PAGES) {
  const pageUrl = BASE + page;
  const status = await head(pageUrl);
  const mark = status === 200 ? '✓' : '✗';
  console.log(`${mark} [${status}] ${page}`);
  if (status !== 200) {
    results.fail.push({ url: pageUrl, status, from: '页面本身' });
    continue;
  }
  results.ok++;

  if (!/\.(html?)$/i.test(page) && page !== '/') continue;

  const html = await (await fetch(pageUrl)).text();
  const pageDir = new URL(pageUrl);
  let m;
  const refs = [];
  while ((m = REF_RE.exec(html)) !== null) {
    let raw = (m[1] ?? m[2] ?? '').trim();
    if (!raw) continue;
    if (/^(https?:)?\/\//i.test(raw)) continue;
    if (/^(data:|mailto:|tel:|javascript:|#)/i.test(raw)) continue;
    if (/[{}+()$'`\\]/.test(raw)) continue;
    raw = raw.split('?')[0].split('#')[0];
    if (!ASSET_EXT_RE.test(raw)) continue;
    refs.push(new URL(raw, pageDir).toString());
  }
  const unique = [...new Set(refs)];
  console.log(`    引用本地资源 ${unique.length} 个，逐个请求...`);
  // 并发控制，避免打爆本地简易服务器
  const CONCURRENCY = 4;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    await Promise.all(unique.slice(i, i + CONCURRENCY).map((u) => check(u, page)));
  }
}

console.log('');
console.log('='.repeat(60));
console.log(`成功: ${results.ok} 个请求`);
console.log(`失败: ${results.fail.length} 个`);
for (const f of results.fail) {
  console.log(`  ✗ [${f.status}] ${f.url}`);
  console.log(`      来源: ${f.from}`);
}

if (results.fail.length) {
  console.log('\n结论: 存在无法访问的资源。');
  process.exit(1);
}
console.log('\n结论: 全部页面与资源均返回 200。');
