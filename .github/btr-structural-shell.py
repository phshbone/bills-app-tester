from pathlib import Path

root=Path('.')

# Build one structural app shell: hero -> one scrolling body -> bottom nav.
p=root/'index.html'
s=p.read_text()
s=s.replace('<main>','<div class="app-body" id="appBody">\n<main>',1)
old='</main>\n<footer>Personal-use prototype. Not affiliated with or endorsed by Cesar Millan.</footer>\n</div>\n\n<nav class="bottom-nav" style="grid-template-columns:repeat(5,1fr)">'
new='</main>\n<footer>Personal-use prototype. Not affiliated with or endorsed by Cesar Millan.</footer>\n</div>\n\n<nav class="bottom-nav" style="grid-template-columns:repeat(5,1fr)">'
if old not in s: raise SystemExit('index anchor not found')
s=s.replace(old,new,1)
anchor='</button></nav>\n\n<div class="modal" id="videoModal"'
if anchor not in s: raise SystemExit('nav anchor not found')
s=s.replace(anchor,'</button></nav>\n</div>\n\n<div class="modal" id="videoModal"',1)
s=s.replace('styles.css?v=36','styles.css?v=37').replace('app.js?v=33','app.js?v=34').replace('shared-care.js?v=19','shared-care.js?v=20')
p.write_text(s)

p=root/'app.js'; s=p.read_text()
old='  const scroller=document.querySelector(".app");\n  if(scroller){scroller.scrollTop=0;requestAnimationFrame(()=>{scroller.scrollTop=0})}\n'
new='  const scroller=document.querySelector(".app-body");\n  if(scroller)scroller.scrollTop=0;\n'
if old not in s: raise SystemExit('app scroller anchor not found')
p.write_text(s.replace(old,new,1))

p=root/'shared-care.js'; s=p.read_text()
old='const scroller=document.querySelector(".app");'
if old not in s: raise SystemExit('shared care scroller anchor not found')
p.write_text(s.replace(old,'const scroller=document.querySelector(".app-body");',1))

p=root/'styles.css'; s=p.read_text()
start=s.index('/* Stable iPhone bottom navigation anchored to the already fixed viewport body. */')
end=s.index('.splash,.modal{',start)
replacement='''/* Structural iPhone app shell: only the center body scrolls. */
html,body{
  width:100%;
  height:100%;
  min-height:100%;
  overflow:hidden !important;
}
html{background:#1b1719}
body{
  position:static !important;
  min-height:100%;
}
.app{
  position:relative !important;
  z-index:1;
  width:100%;
  max-width:980px;
  height:100dvh;
  min-height:100dvh;
  margin:0 auto;
  padding:calc(16px + env(safe-area-inset-top)) 14px 0 !important;
  display:flex;
  flex-direction:column;
  overflow:hidden !important;
}
.hero{flex:0 0 auto}
.app-body{
  flex:1 1 auto;
  min-height:0;
  overflow-y:auto;
  overflow-x:hidden;
  -webkit-overflow-scrolling:touch;
  overscroll-behavior-y:contain;
  scroll-behavior:auto;
  padding-bottom:16px;
}
.bottom-nav{
  position:relative !important;
  z-index:30 !important;
  flex:0 0 auto;
  left:auto !important;
  right:auto !important;
  bottom:auto !important;
  top:auto !important;
  transform:none !important;
  width:calc(100% + 28px) !important;
  max-width:none !important;
  min-height:82px !important;
  margin:0 -14px !important;
  border-radius:18px 18px 0 0 !important;
  padding:8px 8px calc(8px + env(safe-area-inset-bottom)) !important;
  box-shadow:0 -3px 16px rgba(0,0,0,.22);
  contain:layout paint;
}
'''
s=s[:start]+replacement+s[end:]
s=s.replace('.app{padding-bottom:118px}','.app{padding-bottom:0}')
p.write_text(s)

p=root/'sw.js'; s=p.read_text()
s=s.replace('`${CACHE_PREFIX}v2`','`${CACHE_PREFIX}v3`').replace("'./styles.css?v=36'","'./styles.css?v=37'").replace("'./app.js?v=33'","'./app.js?v=34'").replace("'./shared-care.js?v=19'","'./shared-care.js?v=20'")
p.write_text(s)

p=root/'tests/regression.mjs'; s=p.read_text()
s=s.replace('for(const asset of ["styles.css?v=36","app.js?v=33","shared-care-core.js?v=18","sitter-mode.js?v=1","shared-care.js?v=19"]){','for(const asset of ["styles.css?v=37","app.js?v=34","shared-care-core.js?v=18","sitter-mode.js?v=1","shared-care.js?v=20"]){')
s=s.replace('assert.match(sw,/CACHE_NAME = `\\$\\{CACHE_PREFIX\\}v2`/,"sitter rewrite advances the isolated cache generation");','assert.match(sw,/CACHE_NAME = `\\$\\{CACHE_PREFIX\\}v3`/,"structural shell repair advances the isolated cache generation");')
old='''assert.match(css,/html\\{background:#1b1719\\}/,"the iPhone area below the toolbar uses the toolbar color");
assert.match(css,/body\\{[\\s\\S]*?position:fixed;[\\s\\S]*?inset:0;/,"the known baseline body remains the viewport owner");
assert.match(css,/\\.app\\{[\\s\\S]*?position:fixed !important;[\\s\\S]*?overflow-y:auto;/,"the known baseline content region remains the app scroller");
assert.match(css,/\\.bottom-nav\\{[\\s\\S]*?position:absolute !important;/,"navigation remains anchored to the fixed viewport body");
assert.doesNotMatch(css,/\\.bottom-nav\\{[^}]*position:fixed/,"navigation never uses iOS position fixed");
assert.match(css,/Sitter Mode rewrite v1/,"rewritten sitter screen has isolated styles");
assert.doesNotMatch(css,/\\.sitter-page-actions\\{position:sticky/,"sitter controls do not add another sticky/fixed compositor layer");
assert.doesNotMatch(html,/class="app-shell"/,"the later structural app-shell rewrite is not present");
'''
new='''assert.match(css,/html\\{background:#1b1719\\}/,"the iPhone area below the toolbar uses the toolbar color");
assert.match(html,/class="app-body" id="appBody"/,"the app has one dedicated middle scrolling region");
assert.match(css,/\\.app\\{[\\s\\S]*?height:100dvh;[\\s\\S]*?display:flex;[\\s\\S]*?flex-direction:column;[\\s\\S]*?overflow:hidden !important;/,"the app shell owns the full viewport as a structural flex column");
assert.match(css,/\\.app-body\\{[\\s\\S]*?flex:1 1 auto;[\\s\\S]*?min-height:0;[\\s\\S]*?overflow-y:auto;/,"only the center app body scrolls");
assert.match(css,/\\.bottom-nav\\{[\\s\\S]*?position:relative !important;[\\s\\S]*?flex:0 0 auto;/,"bottom navigation is structural rather than floating over content");
assert.doesNotMatch(css,/\\.bottom-nav\\{[^}]*position:fixed/,"navigation never uses iOS position fixed");
assert.match(css,/body\\{\\s*position:static !important;/,"body no longer owns a fixed iOS compositor layer");
assert.match(app,/document\\.querySelector\\("\\.app-body"\\)/,"screen navigation resets the single body scroller");
assert.doesNotMatch(app,/requestAnimationFrame\\(\\(\\)=>\\{scroller\\.scrollTop=0\\}\\)/,"navigation no longer performs a second competing scroll reset");
assert.match(shared,/document\\.querySelector\\("\\.app-body"\\)/,"shared-care jump navigation uses the same single body scroller");
assert.match(css,/Sitter Mode rewrite v1/,"rewritten sitter screen has isolated styles");
assert.doesNotMatch(css,/\\.sitter-page-actions\\{position:sticky/,"sitter controls do not add another sticky/fixed compositor layer");
'''
if old not in s: raise SystemExit('regression anchor not found')
s=s.replace(old,new,1)
s=s.replace('PASS: 67 Frannie baseline, sitter rewrite, ownership, durable sync, audit, cache, navigation, assets, training, care, and Worker regression assertions','PASS: Frannie sitter rewrite + structural app-shell navigation regression assertions')
p.write_text(s)
