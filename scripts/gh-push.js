const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const REPO_ROOT = process.cwd(); const WEBHOOK = process.env.FEISHU_WEBHOOK;
const START_DATE = new Date('2026-06-22T00:00:00+08:00'); const SLOTS = [8, 13];
if (!WEBHOOK) { console.error('Missing FEISHU_WEBHOOK env'); process.exit(1); }
function stripMd(t) {
  return t.replace(/^---[\s\S]*?^---\s*/m,'').replace(/!\[.*?\]\(.*?\)/g,'').replace(/\[([^\]]*)\]\(.*?\)/g,'$1').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'$1').replace(/`{1,3}[^`]+`{1,3}/g,'').replace(/#{1,6}\s+/g,'').replace(/>\s*/g,'').replace(/[-*+]\s+/g,'').replace(/\d+\.\s+/g,'').replace(/\|.*\|/g,'').replace(/\n{3,}/g,'\n\n').trim();
}
function parse(md, fn) {
  const plain = stripMd(md); const lines = plain.split('\n'); const paras = []; let cur = ''; let curTitle = fn; const segs = [];
  for (const line of lines) { const t = line.trim(); if (!t) continue; const isTitle = t.length < 30 && !t.endsWith('\u3002') && !t.endsWith('\uff1f') && !t.endsWith('\uff01');
    if (isTitle) { if (!cur.trim()) { curTitle = t; continue; } if (cur.trim().length >= 300) { segs.push({ title: curTitle, content: cur.trim() }); cur = ''; } curTitle = t; continue; }
    const wb = cur ? cur + '\n\n' + t : t; if (wb.length <= 800) { cur = wb; } else { if (cur.trim().length >= 300) segs.push({ title: curTitle, content: cur.trim() }); cur = t; } }
  if (cur.trim().length >= 200) segs.push({ title: curTitle, content: cur.trim() });
  return segs.map((s, i) => ({ seq: i + 1, title: s.title || fn, content: s.content, charCount: s.content.length }));
}
function walkDir(dir, files) {
  if (!files) files = []; const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) { if (e.isDirectory()) { if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'learning-push-backend' || e.name === '.pnpm-store') continue; walkDir(path.join(dir, e.name), files); } else if (e.name.endsWith('.md')) { files.push(path.join(dir, e.name)); } }
  return files;
}
function buildSegments() {
  const files = walkDir(REPO_ROOT); const allSegs = [];
  for (const fp of files) { const stat = fs.statSync(fp); const content = fs.readFileSync(fp, 'utf-8'); const segs = parse(content, path.basename(fp, '.md')); segs.forEach(s => { s.fileMtime = stat.mtimeMs; }); allSegs.push(...segs); }
  allSegs.sort((a, b) => { if (a.fileMtime !== b.fileMtime) return a.fileMtime - b.fileMtime; return a.seq - b.seq; });
  return allSegs;
}
function getTodaySlot() {
  const now = new Date(); const h = now.getHours() + now.getTimezoneOffset() / 60 + 8; const cst = new Date(now); cst.setHours(h, 0, 0, 0);
  const start = new Date(START_DATE);
  const dayDiff = Math.floor((cst.getTime() - start.getTime()) / 86400000);
  if (dayDiff < 0) return -1;
  const isAfternoon = h >= 11; return dayDiff * 2 + (isAfternoon ? 1 : 0);
}
async function sendFeishu(title, content) {
  const body = JSON.stringify({ msg_type: 'interactive', card: { header: { title: { tag: 'plain_text', content: title || '学习推送' }, template: 'blue' }, elements: [{ tag: 'markdown', content: content }, { tag: 'hr' }, { tag: 'note', elements: [{ tag: 'plain_text', content: '来自个人成长学习推送系统' }] }] } });
  const r = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); const j = await r.json(); return j.code === 0;
}
(async () => {
  const segs = buildSegments(); console.log('解析完成: ' + segs.length + ' 个段落');
  if (segs.length === 0) { console.log('无内容'); process.exit(0); }
  const slot = getTodaySlot(); console.log('时槽索引: ' + slot);
  if (slot < 0) { console.log('未到开始日期'); process.exit(0); }
  const forceSlot = process.env.FORCE_SLOT; const finalSlot = forceSlot ? parseInt(forceSlot) : slot;
  if (finalSlot >= segs.length) { console.log('所有内容已推送完毕'); process.exit(0); }
  const seg = segs[finalSlot]; console.log('推送: [' + seg.title + '] ' + seg.charCount + '字');
  const ok = await sendFeishu(seg.title, seg.content);
  console.log(ok ? '推送成功' : '推送失败');
  process.exit(ok ? 0 : 1);
})();
