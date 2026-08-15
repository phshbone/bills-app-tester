from pathlib import Path

root=Path('.')

# Header-only presentation pass. No app/sitter/shared-care behavior changes.
p=root/'index.html'
s=p.read_text()
s=s.replace('styles.css?v=38','styles.css?v=39')
old='''<header class="hero">\n<div class="eyebrow">A private step-by-step training guide</div>\n<h1>Frannie’s<br>a Good Girl</h1>\n<p>Clear practice sessions for Frannie and Frannie’s human, Mollie. Written lessons work on their own; official Cesar Millan videos are optional visual companions.</p>\n<div class="status" id="heroStatus">Day 1: good girl status pending</div>\n</header>'''
new='''<header class="hero" id="appHero">\n<div class="hero-collapsible hero-eyebrow-wrap"><div class="eyebrow">A private step-by-step training guide</div></div>\n<h1>Frannie’s<br>a Good Girl</h1>\n<div class="hero-collapsible hero-copy-wrap"><p>Clear practice sessions for Frannie and Frannie’s human, Mollie. Written lessons work on their own; official Cesar Millan videos are optional visual companions.</p></div>\n<div class="status" id="heroStatus">Day 1: good girl status pending</div>\n</header>'''
if old not in s: raise SystemExit('hero markup anchor missing')
s=s.replace(old,new,1)
script='''<script>\n(function(){\n  const body=document.getElementById("appBody");\n  const hero=document.getElementById("appHero");\n  if(!body||!hero)return;\n  let compact=false;\n  function setCompact(next){\n    if(next===compact)return;\n    compact=next;\n    hero.classList.toggle("hero-compact",compact);\n  }\n  body.addEventListener("scroll",function(){\n    const y=body.scrollTop;\n    if(!compact&&y>42)setCompact(true);\n    else if(compact&&y<6)setCompact(false);\n  },{passive:true});\n})();\n</script>\n'''
if script not in s:
    idx=s.rfind('</body>')
    if idx<0: raise SystemExit('body close missing')
    s=s[:idx]+script+s[idx:]
p.write_text(s)

p=root/'styles.css'
s=p.read_text()
block='''\n/* Header accordion — presentation only; shell geometry remains structural. */\n.hero{overflow:hidden;transition:padding .22s ease,border-radius .22s ease}\n.hero h1{transition:font-size .22s ease,line-height .22s ease,margin .22s ease}\n.hero .status{transition:margin .22s ease,padding .22s ease,font-size .22s ease}\n.hero-collapsible{overflow:hidden;opacity:1;max-height:120px;transition:max-height .22s ease,opacity .16s ease,margin .22s ease}\n.hero-eyebrow-wrap{max-height:24px}\n.hero-copy-wrap{max-height:120px}\n.hero.hero-compact{padding:12px 16px;border-radius:20px}\n.hero.hero-compact .hero-collapsible{max-height:0;opacity:0;margin:0}\n.hero.hero-compact h1{font-size:clamp(1.55rem,6vw,2rem);line-height:.96;margin:0}\n.hero.hero-compact .status{margin-top:7px;padding:5px 8px;font-size:.7rem}\n@media(prefers-reduced-motion:reduce){\n  .hero,.hero h1,.hero .status,.hero-collapsible{transition:none}\n}\n'''
if 'Header accordion — presentation only' not in s:
    s=s.rstrip()+block
p.write_text(s)

p=root/'sw.js'
s=p.read_text().replace('`${CACHE_PREFIX}v5`','`${CACHE_PREFIX}v6`').replace('./styles.css?v=38','./styles.css?v=39')
p.write_text(s)

p=root/'tests/regression.mjs'
s=p.read_text()
s=s.replace('"styles.css?v=38"','"styles.css?v=39"')
s=s.replace('CACHE_PREFIX\\}v5','CACHE_PREFIX\\}v6')
needle='assert.match(css,/Sitter Mode restored popup presentation/,"restored sitter overlays have isolated styling");'
addition='''\nassert.match(html,/id="appHero"/,"accordion header has a dedicated hero target");\nassert.match(html,/body\\.addEventListener\\("scroll"[\\s\\S]*?y>42[\\s\\S]*?y<6/,"accordion uses one passive body-scroll listener with hysteresis");\nassert.match(css,/\\.hero\\.hero-compact\\{padding:12px 16px;border-radius:20px\\}/,"compact header reduces only hero presentation geometry");\nassert.match(css,/\\.hero\\.hero-compact \\.hero-collapsible\\{max-height:0;opacity:0;margin:0\\}/,"compact header collapses eyebrow and descriptive copy");\nassert.doesNotMatch(css,/Header accordion[\\s\\S]*position:(?:fixed|sticky|absolute)/,"accordion header adds no positioning compositor layer");'''
if addition.strip() not in s:
    if needle not in s: raise SystemExit('regression anchor missing')
    s=s.replace(needle,needle+addition,1)
p.write_text(s)
