// Quick Add bookmarklet — local-first, no server, no auth.
//
// Runs on archiveofourown.org in the user's browser context.
// Parses public work metadata from the AO3 DOM, then opens
// fictracker.app/?import=<json> in a new tab. The web app reads
// that query param on load and writes straight to localStorage.
//
// We inject as a <script> tag rather than running inline so Firefox's
// stricter CSP doesn't block the fetch/window.open calls.

export function generateLocalFirstQuickAddBookmarklet(appUrl) {
  const inner = `(function(){
var m=location.href.match(/archiveofourown\\.org\\/works\\/(\\d+)/);
if(!m){alert('Open an AO3 work page first!');return;}
var q=function(s){var e=document.querySelector(s);return e?e.textContent.trim():null;};
var qa=function(s){return Array.from(document.querySelectorAll(s)).map(function(e){return e.textContent.trim();});};
var w={
  id:m[1],ao3_id:parseInt(m[1]),
  title:q('h2.title')||'Untitled',
  authors:qa('[rel=author]'),
  fandoms:qa('dd.fandom a.tag'),
  relationships:qa('dd.relationship a.tag'),
  characters:qa('dd.character a.tag'),
  freeform_tags:qa('dd.freeform a.tag'),
  rating:q('dd.rating a.tag'),
  language:q('dd.language')||'English',
  summary:(q('.summary blockquote')||'').substring(0,500),
  added_at:new Date().toISOString()
};
var wc=q('dd.words');if(wc)w.word_count=parseInt(wc.replace(/,/g,''))||null;
var ch=q('dd.chapters');if(ch){var cm=ch.match(/(\\d+)\\s*\\/\\s*(\\d+|\\?)/);if(cm){w.chapter_count=parseInt(cm[1]);w.chapter_total=cm[2]==='?'?null:parseInt(cm[2]);w.is_complete=w.chapter_total!==null&&w.chapter_count>=w.chapter_total;}}
var k=q('dd.kudos');if(k)w.kudos=parseInt(k.replace(/,/g,''))||null;
var h=q('dd.hits');if(h)w.hits=parseInt(h.replace(/,/g,''))||null;
var t=document.createElement('div');
t.textContent='Opening FicTracker…';
t.style.cssText='position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:10px;background:#0f1318;border:1px solid rgba(20,184,166,0.3);color:#14b8a6;font:600 14px -apple-system,sans-serif;z-index:999999;box-shadow:0 8px 32px rgba(0,0,0,0.4)';
document.body.appendChild(t);
setTimeout(function(){t.remove();},3000);
window.open('${appUrl}/?import='+encodeURIComponent(JSON.stringify(w)),'_blank');
})()`;

  return `javascript:void(function(){var s=document.createElement('script');s.textContent=${JSON.stringify(inner)};document.body.appendChild(s);s.remove()})()`;
}
