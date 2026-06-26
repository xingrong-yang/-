const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd(),WH=process.env.FEISHU_WEBHOOK;
const START=new Date('2026-06-22T00:00:00+08:00'),HOURS=[8,13];
if(!WH){console.error('Missing FEISHU_WEBHOOK');process.exit(1);}
function strip(t){return t.replace(/^---[\s\S]*?^---\s*/m,'').replace(/!\[.*?\]\(.*?\)/g,'').replace(/\[([^\]]*)\]\(.*?\)/g,'$1').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'$1').replace(/`{1,3}[^`]+`{1,3}/g,'').replace(/^(#{1}|#{3,})\s+/gm,'').replace(/>\s*/g,'').replace(/[-*+]\s+/g,'').replace(/\d+\.\s+/g,'').replace(/\|.*\|/g,'').replace(/\n{3,}/g,'\n\n').trim();}
function parse(md,fn){
  md=md.replace(/^---[\s\S]*?^---\s*/m,'');
  const raws=md.split(/\n(?=## )/),segs=[];let seq=0;
  for(const raw of raws){
    const s=raw.trim();if(!s)continue;
    const ln=s.split('\n')[0].trim(),isH=ln.startsWith('## ');
    const title=isH?ln.replace(/^##\s+/,'').trim():fn;
    const body=strip((isH?s.split('\n').slice(1):s.split('\n')).join('\n'));
    if(!body.trim())continue;
    segs.push({seq:++seq,title:title||fn,content:body.trim(),charCount:body.trim().length});}
  if(!segs.length){const p=strip(md);if(p.trim())segs.push({seq:1,title:fn,content:p.trim(),charCount:p.trim().length});}
  return segs;}
function walk(d,f){if(!f)f=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.isDirectory()){if(e.name.startsWith('.')||e.name=='node_modules'||e.name=='learning-push-backend'||e.name=='.pnpm-store')continue;walk(path.join(d,e.name),f);}else if(e.name.endsWith('.md'))f.push(path.join(d,e.name));}return f;}
function build(){
  const ORDER=['每日学习内容','段永平','中国的奇迹'],_pri=f=>{const i=ORDER.indexOf(f);return i<0?999:i;};
  const fs2=walk(ROOT),all=[];
  for(const fp of fs2){
    const st=fs.statSync(fp),c=fs.readFileSync(fp,'utf-8'),fn=path.basename(fp,'.md');
    const segs=parse(c,fn);
    segs.forEach(s=>{s.mtime=st.mtimeMs;s.fileName=fn;});
    all.push(...segs);}
  all.sort((a,b)=>{
    if(a.mtime!=b.mtime)return a.mtime-b.mtime;
    const pa=_pri(a.fileName),pb=_pri(b.fileName);
    if(pa!=pb)return pa-pb;
    return a.seq-b.seq;});
  return all;}
function slot(){
  const n=new Date(),h=n.getHours()+n.getTimezoneOffset()/60+8,c=new Date(n);c.setHours(h,0,0,0);
  const d=Math.floor((c.getTime()-START.getTime())/864e5);
  if(d<0)return-1;return d*2+(h>=11?1:0);}
async function send(title,content){
  const body=JSON.stringify({msg_type:'interactive',card:{header:{title:{tag:'plain_text',content:title||'\u5b66\u4e60\u63a8\u9001'},template:'blue'},elements:[{tag:'markdown',content},{tag:'hr'},{tag:'note',elements:[{tag:'plain_text',content:'\u6765\u81ea\u4e2a\u4eba\u6210\u957f\u5b66\u4e60\u63a8\u9001\u7cfb\u7edf'}]}]}});
  const r=await fetch(WH,{method:'POST',headers:{'Content-Type':'application/json'},body}),j=await r.json();return j.code===0;}
(async()=>{
  const segs=build();console.log('解析完成: '+segs.length+' 个段落');
  if(!segs.length){console.log('无内容');process.exit(0);}
  const s=slot();console.log('时槽索引: '+s);
  if(s<0){console.log('未到开始日期');process.exit(0);}
  const fs2=process.env.FORCE_SLOT;
  const indices=fs2?[parseInt(fs2)]:[s%2===0?s:s-1,(s%2===0?s:s-1)+1];
  let sent=0;
  for(const idx of indices){
    if(idx>=segs.length)break;
    const seg=segs[idx];console.log('推送: ['+seg.title+'] '+seg.charCount+'字');
    const ok=await send(seg.title,seg.content);
    if(ok)sent++;}
  console.log('推送完成: '+sent+'条');
  process.exit(sent>0?0:1);})();


