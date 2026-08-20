#!/usr/bin/env node
/**
 * 静态资源体检工具
 *
 * 用法：
 *   node tools/check-assets.mjs            # 只报告
 *   node tools/check-assets.mjs --delete   # 报告并删除未被引用的资源
 *
 * 检查内容：
 *   1. HTML/CSS/JS 引用了但文件不存在的本地资源（坏链，会导致 404）
 *   2. 存在于 assets/ 下但没有任何地方引用的资源（死文件，白占体积）
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DO_DELETE = process.argv.includes('--delete');

/** 扫描时跳过的目录 */
const SKIP_DIRS = new Set(['.git', '.idea', 'node_modules', 'tools']);

/** 认可的资源/页面后缀，用于把压缩 JS 里的属性访问（如 d.src）排除掉 */
const ASSET_EXT_RE =
  /\.(html?|css|m?js|json|xml|txt|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|otf|mp[34]|webm|pdf|zip|gz|sketch)$/i;

/** 这些资源即使没被引用也必须保留（入口文件 / 平台约定文件） */
const KEEP_ANYWAY = [
  /^assets\/fontawesome-5\.15\.4\/webfonts\//, // 由 all.min.css 里的 url() 引用
  /^assets\/fontawesome-5\.15\.4\/LICENSE\.txt$/,
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const allFiles = walk(ROOT);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

const sourceFiles = allFiles.filter((f) => /\.(html|css|js|mjs|json|xml|txt)$/i.test(f) && !rel(f).startsWith('tools/'));
const assetFiles = allFiles.filter((f) => rel(f).startsWith('assets/'));

// ---- 1. 从源码里提取所有本地资源引用 ----
// 匹配 src="..." href="..." data-src="..." url(...) 里的相对/绝对本地路径
const REF_RE = /(?:src|href|data-src|data-original)\s*=\s*["']([^"']+)["']|url\(\s*['"]?([^'")]+?)['"]?\s*\)/gi;

/** 引用路径 -> 引用它的源文件集合 */
const refs = new Map();

for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  let m;
  while ((m = REF_RE.exec(text)) !== null) {
    let raw = (m[1] ?? m[2] ?? '').trim();
    if (!raw) continue;
    // 跳过外链、协议相对、data URI、锚点、模板占位符
    if (/^(https?:)?\/\//i.test(raw)) continue;
    if (/^(data:|mailto:|tel:|javascript:|#)/i.test(raw)) continue;
    if (/[{}]/.test(raw)) continue;
    // 跳过压缩 JS 里的字符串拼接片段（含变量、括号、加号等非法路径字符）
    if (/[+()$'`\\]/.test(raw)) continue;
    // 去掉 query 与 hash
    raw = raw.split('?')[0].split('#')[0];
    if (!raw) continue;
    // 只认已知资源/页面后缀，或以 / 结尾的目录，否则视为噪音（如压缩 JS 里的 d.src）
    if (!ASSET_EXT_RE.test(raw) && !raw.endsWith('/')) continue;

    const resolved = raw.startsWith('/')
      ? path.join(ROOT, raw)
      : path.resolve(dir, raw);

    const key = rel(resolved);
    if (!refs.has(key)) refs.set(key, new Set());
    refs.get(key).add(rel(file));
  }
}

// ---- 2. 坏链：引用了但文件不存在 ----
const existing = new Set(allFiles.map(rel));
const broken = [];
for (const [target, sources] of refs) {
  if (target.startsWith('..')) continue; // 指到仓库外，忽略
  if (existing.has(target)) continue;
  // 目录形式的引用（如 /about/）视为 index.html
  if (existing.has(`${target}/index.html`) || existing.has(target.replace(/\/$/, '') + '/index.html')) continue;
  if (target === '' || target === '.') continue;
  broken.push({ target, sources: [...sources] });
}

// ---- 3. 死文件：assets 下没被引用的 ----
const referenced = new Set(refs.keys());
const unused = assetFiles
  .map(rel)
  .filter((f) => !referenced.has(f))
  .filter((f) => !KEEP_ANYWAY.some((re) => re.test(f)));

// ---- 输出 ----
const kb = (p) => Math.round(fs.statSync(path.join(ROOT, p)).size / 1024);

console.log('资源体检报告');
console.log('='.repeat(60));
console.log(`扫描源文件: ${sourceFiles.length} 个，资源文件: ${assetFiles.length} 个`);
console.log('');

console.log(`[坏链] 引用了但文件不存在: ${broken.length} 处`);
for (const b of broken) {
  console.log(`  ✗ ${b.target}`);
  console.log(`      被引用于: ${b.sources.join(', ')}`);
}
console.log('');

const unusedKB = unused.reduce((s, f) => s + kb(f), 0);
console.log(`[死文件] assets 下未被任何地方引用: ${unused.length} 个，共 ${unusedKB} KB`);
for (const f of unused) console.log(`  - ${f} (${kb(f)} KB)`);

if (DO_DELETE && unused.length) {
  for (const f of unused) fs.unlinkSync(path.join(ROOT, f));
  console.log('');
  console.log(`已删除 ${unused.length} 个未引用资源，释放 ${unusedKB} KB`);
}

console.log('');
if (broken.length) {
  console.log('结论: 存在坏链，请修复后再部署。');
  process.exit(1);
}
console.log('结论: 无坏链，资源引用完整。');
