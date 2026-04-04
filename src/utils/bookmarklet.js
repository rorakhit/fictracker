// Generates a personalized bookmarklet URL with the user's auth token embedded.
//
// Why embed the token in the URL? Cross-origin storage access is blocked on
// iPad Safari (and most browsers). A bookmarklet runs in the context of the
// current page (archiveofourown.org), so it can't read fictracker.vercel.app's
// localStorage or cookies. Embedding the token in the bookmarklet itself
// sidesteps this entirely — it's self-contained.
//
// Security trade-off: the token is visible in the bookmark URL, but it's only
// stored locally on the user's device (in their bookmarks). It's equivalent to
// a saved password in terms of exposure. The token is a Supabase access token
// that expires, so even if leaked it has limited lifetime.
//
// Firefox compatibility: Firefox blocks fetch() from javascript: bookmarklets
// due to stricter CSP enforcement. We work around this by injecting a <script>
// tag into the page, so the code runs in the page's own context where fetch()
// is allowed.

const SUPABASE_URL = 'https://nivqfnrkpuoyjtugavtj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pdnFmbnJrcHVveWp0dWdhdnRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODU0NDAsImV4cCI6MjA4OTQ2MTQ0MH0.gEjhPIGqXqAj_ZU69upkk_rW3-392b0TWNLv-CVC1mU';

// The actual bookmarklet logic, shared by both generators.
// We inject it as a <script> tag to avoid Firefox's CSP blocking fetch()
// in javascript: URLs. The script tag runs in the page context where
// fetch is unrestricted.
function buildPayloadCode() {
  return `var m=location.href.match(/archiveofourown\\.org\\/works\\/(\\d+)/);if(!m){alert('Open an AO3 work page first!');return}var q=function(s){var e=document.querySelector(s);return e?e.textContent.trim():null},qa=function(s){return Array.from(document.querySelectorAll(s)).map(function(e){return e.textContent.trim()})};var w={ao3_id:parseInt(m[1]),title:q('.title.heading')||'Untitled',authors:qa('[rel=author]'),rating:q('dd.rating.tags a.tag'),warnings:qa('dd.warning.tags a.tag'),categories:qa('dd.category.tags a.tag'),fandoms:qa('dd.fandom.tags a.tag'),relationships:qa('dd.relationship.tags a.tag'),characters:qa('dd.character.tags a.tag'),freeform_tags:qa('dd.freeform.tags a.tag'),language:q('dd.language')||'English',summary:(q('.summary .userstuff')||'').substring(0,2000)};var wc=q('dd.words');if(wc)w.word_count=parseInt(wc.replace(/,/g,''));var ch=q('dd.chapters');if(ch){var cm=ch.match(/(\\d+)\\s*\\/\\s*(\\d+|\\?)/);if(cm){w.chapter_count=parseInt(cm[1]);w.chapter_total=cm[2]==='?'?null:parseInt(cm[2]);w.is_complete=w.chapter_total!==null&&w.chapter_count>=w.chapter_total}}var k=q('dd.kudos');if(k)w.kudos=parseInt(k.replace(/,/g,''));var h=q('dd.hits');if(h)w.hits=parseInt(h.replace(/,/g,''));var du=q('dd.status');if(du)w.date_updated=du;var dp=q('dd.published');if(dp)w.date_published=dp;`;
}

function buildToastCode() {
  return `function toast(msg,err){var t=document.getElementById('ft-toast');if(t)t.remove();t=document.createElement('div');t.id='ft-toast';t.textContent=msg;t.style.cssText='position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:10px;background:'+(err?'#1a1012':'#0f1318')+';border:1px solid '+(err?'rgba(239,68,68,0.3)':'rgba(20,184,166,0.3)')+';color:'+(err?'#ef4444':'#14b8a6')+';font:600 14px -apple-system,sans-serif;z-index:999999;box-shadow:0 8px 32px rgba(0,0,0,0.4)';document.body.appendChild(t);setTimeout(function(){t.style.opacity='0';setTimeout(function(){t.remove()},300)},3000)}`;
}

function buildResultHandler() {
  return `.then(function(r){if(!r.ok)return r.text().then(function(t){toast(t,true)});return r.json().then(function(d){toast(d.imported>0?'Now reading "'+w.title+'" \\u{1F4D6}':'"'+w.title+'" already in library')})}).catch(function(e){toast('Error: '+e.message,true)})`;
}

export function generateBookmarklet(accessToken) {
  const inner = `(function(){var S='${SUPABASE_URL}',T='${accessToken}';${buildToastCode()}${buildPayloadCode()}toast('Adding to FicTracker...');fetch(S+'/functions/v1/import-works',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+T},body:JSON.stringify({works:[w],source:'bookmarklet',defaultStatus:'reading'})})${buildResultHandler()}})()`;

  // Wrap in script tag injection for Firefox compatibility
  return `javascript:void(function(){var s=document.createElement('script');s.textContent=${JSON.stringify(inner)};document.body.appendChild(s);s.remove()})()`;
}

// ---- Chapter Sync Bookmarklet ----
// A dedicated bookmarklet for syncing reading progress. The user taps it
// while reading a chapter on AO3, and it:
// 1. Scrapes the chapter dropdown to get chapter ID mapping
// 2. Auto-detects which chapter they're currently viewing
// 3. POSTs to the sync-chapter Edge Function
//
// This gives mobile/bookmarklet users the same chapter tracking experience
// as the Chrome extension — and actually better, since it auto-detects
// the current chapter from the page context.

function buildChapterScrapeCode() {
  // Scrapes AO3's <select id="selected_id"> for chapter IDs,
  // then detects which chapter is currently being viewed.
  return `var m=location.href.match(/archiveofourown\\.org\\/works\\/(\\d+)/);if(!m){alert('Open an AO3 work page first!');return}var ao3Id=parseInt(m[1]);var sel=document.querySelector('select#selected_id');var cids=[];var curCh=0;if(sel){cids=Array.from(sel.options).map(function(o){return{num:parseInt((o.textContent.match(/^(\\d+)\\./) || [0,0])[1]),ao3_id:o.value}}).filter(function(c){return c.num>0&&c.ao3_id});var so=sel.options[sel.selectedIndex];if(so)curCh=parseInt((so.textContent.match(/^(\\d+)\\./) || [0,0])[1])||0}if(!curCh&&cids.length){var cu=location.href.match(/\\/chapters\\/(\\d+)/);if(cu){var fm=cids.find(function(c){return c.ao3_id===cu[1]});if(fm)curCh=fm.num}}if(!curCh)curCh=1;var chapTotal='?';var ce=document.querySelector('dd.chapters');if(ce){var cm2=ce.textContent.trim().match(/(\\d+)\\s*\\/\\s*(\\d+|\\?)/);if(cm2)chapTotal=cm2[2]==='?'?'?':cm2[2]}`;
}

function buildSyncResultHandler() {
  return `.then(function(r){if(!r.ok)return r.json().then(function(d){if(d.error==='not_in_library'){toast('Not in library \\u2014 use Quick Add first!',true)}else{toast(d.message||d.error||'Sync failed',true)}});return r.json().then(function(d){toast('Synced to Ch. '+curCh+(chapTotal!=='?'?'/'+chapTotal:'')+' \\u{1F4D6}')})}).catch(function(e){toast('Error: '+e.message,true)})`;
}

export function generateChapterSyncBookmarklet(accessToken) {
  const inner = `(function(){var S='${SUPABASE_URL}';var T='${accessToken}';${buildToastCode()}${buildChapterScrapeCode()}toast('Syncing chapter...');fetch(S+'/functions/v1/sync-chapter',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+T},body:JSON.stringify({ao3_id:ao3Id,chapter_ids:cids,current_chapter:curCh})})${buildSyncResultHandler()}})()`;

  return `javascript:void(function(){var s=document.createElement('script');s.textContent=${JSON.stringify(inner)};document.body.appendChild(s);s.remove()})()`;
}

export function generatePersistentChapterSyncBookmarklet(refreshToken) {
  const inner = `(function(){var S='${SUPABASE_URL}',K='${SUPABASE_KEY}',R='${refreshToken}';${buildToastCode()}${buildChapterScrapeCode()}toast('Syncing chapter...');fetch(S+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'apikey':K,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:R})}).then(function(r){return r.json()}).then(function(auth){if(auth.error){toast('Session expired \\u2014 regenerate bookmarklet in Settings',true);return}return fetch(S+'/functions/v1/sync-chapter',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+auth.access_token},body:JSON.stringify({ao3_id:ao3Id,chapter_ids:cids,current_chapter:curCh})})${buildSyncResultHandler()}})})()`;

  return `javascript:void(function(){var s=document.createElement('script');s.textContent=${JSON.stringify(inner)};document.body.appendChild(s);s.remove()})()`;
}

// ---- Reading History Import Bookmarklet ----
// AO3 reading history (/users/{username}/readings) is PRIVATE — only
// the logged-in user can see it. So this MUST be a client-side bookmarklet
// (not a server-side Edge Function). The user runs it while logged into AO3
// and viewing their readings page.
//
// It scrapes li.work.blurb elements (same structure as bookmarks),
// auto-paginates with a 10s delay between pages, and sends each page
// of works to our import-works Edge Function.

function buildHistoryScraperCode() {
  // This is a self-contained scraper that runs on the AO3 readings page.
  // It parses work blurbs, extracts metadata, paginates, and imports.
  return `
var S='${SUPABASE_URL}';
var K='${SUPABASE_KEY}';

function parseBlurbs(doc){
  var items=doc.querySelectorAll('li.blurb.group');
  var works=[];
  items.forEach(function(li){
    var link=li.querySelector('h4.heading a[href*="/works/"]');
    if(!link)return;
    var m=link.getAttribute('href').match(/\\/works\\/(\\d+)/);
    if(!m)return;
    var q=function(s){var e=li.querySelector(s);return e?e.textContent.trim():null};
    var qa=function(s){return Array.from(li.querySelectorAll(s)).map(function(e){return e.textContent.trim()})};
    var w={ao3_id:parseInt(m[1]),title:link.textContent.trim(),authors:qa('[rel=author]'),fandoms:qa('h5.fandoms a.tag'),relationships:[],characters:[],freeform_tags:[]};
    var tags=li.querySelector('ul.tags');
    if(tags){
      tags.querySelectorAll('li.relationships a.tag').forEach(function(a){w.relationships.push(a.textContent.trim())});
      tags.querySelectorAll('li.characters a.tag').forEach(function(a){w.characters.push(a.textContent.trim())});
      tags.querySelectorAll('li.freeforms a.tag').forEach(function(a){w.freeform_tags.push(a.textContent.trim())});
    }
    var wc=q('dd.words');if(wc)w.word_count=parseInt(wc.replace(/,/g,''));
    var ch=q('dd.chapters');if(ch){var cm=ch.match(/(\\d+)\\s*\\/\\s*(\\d+|\\?)/);if(cm){w.chapter_count=parseInt(cm[1]);w.chapter_total=cm[2]==='?'?null:parseInt(cm[2]);w.is_complete=w.chapter_total!==null&&w.chapter_count>=w.chapter_total}}
    var k=q('dd.kudos');if(k)w.kudos=parseInt(k.replace(/,/g,''));
    var h=q('dd.hits');if(h)w.hits=parseInt(h.replace(/,/g,''));
    var rt=li.querySelector('span.rating');if(rt)w.rating=rt.getAttribute('title')||null;
    var viewed=li.querySelector('h4.viewed');
    if(viewed){var dm=viewed.textContent.match(/Last visited:\\s*(.+)/);if(dm){w._lastVisited=new Date(dm[1].trim())}}
    works.push(w);
  });
  return works;
}

function getTotalPages(doc){
  var pg=doc.querySelector('ol.pagination');
  if(!pg)return 1;
  var links=pg.querySelectorAll('a');
  var max=1;
  links.forEach(function(a){var n=parseInt(a.textContent);if(n>max)max=n});
  return max;
}

async function importBatch(works,token,defaultStatus){
  var r=await fetch(S+'/functions/v1/import-works',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({works:works,source:'history',defaultStatus:defaultStatus})});
  return r.json();
}

// Split works by age + completion:
//   • Last visited >1yr ago AND complete → "completed"
//   • Incomplete AND not updated in 2+ years → "author_abandoned"
//   • Everything else (recent, or old-but-unfinished within 2yr) → "reading"
async function importPage(works,token){
  var oneYearAgo=new Date();oneYearAgo.setFullYear(oneYearAgo.getFullYear()-1);
  var twoYearsAgo=new Date();twoYearsAgo.setFullYear(twoYearsAgo.getFullYear()-2);
  var completed=[];var reading=[];var abandoned=[];
  works.forEach(function(w){
    var old=w._lastVisited&&w._lastVisited<oneYearAgo;
    if(old&&w.is_complete){completed.push(w)}
    else if(!w.is_complete&&w._lastVisited&&w._lastVisited<twoYearsAgo){abandoned.push(w)}
    else{reading.push(w)}
  });
  var total=0;
  if(completed.length>0){var d=await importBatch(completed,token,'completed');total+=d.imported||0}
  if(abandoned.length>0){var d3=await importBatch(abandoned,token,'author_abandoned');total+=d3.imported||0}
  if(reading.length>0){var d2=await importBatch(reading,token,'reading');total+=d2.imported||0}
  return{imported:total};
}

async function run(token){
  var ov=document.createElement('div');
  ov.id='ft-history-overlay';
  ov.style.cssText='position:fixed;top:0;left:0;right:0;padding:16px;background:#0f1318;border-bottom:2px solid rgba(20,184,166,0.4);color:#14b8a6;font:600 14px -apple-system,sans-serif;z-index:999999;text-align:center';
  document.body.appendChild(ov);
  function msg(t){ov.textContent=t}

  if(!location.href.match(/archiveofourown\\.org\\/users\\/[^\\/]+\\/readings/)){
    msg('Navigate to your AO3 History page first!');
    setTimeout(function(){ov.remove()},4000);
    return;
  }

  var totalPages=getTotalPages(document);
  msg('Found '+totalPages+' page(s) of history. Importing page 1...');

  var works=parseBlurbs(document);
  var totalImported=0;
  if(works.length>0){
    var d=await importPage(works,token);
    totalImported+=d.imported||0;
  }

  for(var p=2;p<=totalPages;p++){
    msg('Importing page '+p+' of '+totalPages+'... ('+totalImported+' imported so far) — 10s delay for AO3 rate limits');
    await new Promise(function(r){setTimeout(r,10000)});
    try{
      var resp=await fetch(location.href.split('?')[0]+'?page='+p);
      if(resp.status===429){msg('Rate limited by AO3 on page '+p+'. Wait a minute and try again from this page.');return}
      var html=await resp.text();
      var parser=new DOMParser();
      var doc2=parser.parseFromString(html,'text/html');
      var pw=parseBlurbs(doc2);
      if(pw.length>0){var d2=await importPage(pw,token);totalImported+=d2.imported||0}
    }catch(e){msg('Error on page '+p+': '+e.message);return}
  }

  msg('Done! Imported '+totalImported+' fics from your AO3 history.');
  setTimeout(function(){ov.remove()},5000);
}
`;
}

export function generatePersistentHistoryBookmarklet(refreshToken) {
  const scraperCode = buildHistoryScraperCode();
  const inner = `(function(){${scraperCode}fetch('${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'apikey':K,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:'${refreshToken}'})}).then(function(r){return r.json()}).then(function(auth){if(auth.error){alert('Session expired — regenerate bookmarklet in FicTracker Settings');return}run(auth.access_token)}).catch(function(e){alert('Error: '+e.message)})})()`;

  return `javascript:void(function(){var s=document.createElement('script');s.textContent=${JSON.stringify(inner)};document.body.appendChild(s);s.remove()})()`;
}

// Generate a long-lived refresh token URL that auto-refreshes before adding
export async function generatePersistentBookmarklet(refreshToken) {
  const inner = `(function(){var S='${SUPABASE_URL}',K='${SUPABASE_KEY}',R='${refreshToken}';${buildToastCode()}${buildPayloadCode()}toast('Adding to FicTracker...');fetch(S+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'apikey':K,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:R})}).then(function(r){return r.json()}).then(function(auth){if(auth.error){toast('Session expired — regenerate bookmarklet in Settings',true);return}return fetch(S+'/functions/v1/import-works',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+auth.access_token},body:JSON.stringify({works:[w],source:'bookmarklet',defaultStatus:'reading'})})${buildResultHandler()}})})()`;

  return `javascript:void(function(){var s=document.createElement('script');s.textContent=${JSON.stringify(inner)};document.body.appendChild(s);s.remove()})()`;
}
