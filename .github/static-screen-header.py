from pathlib import Path

root=Path('.')

# app.js: make header compact on every screen except Home. No scroll listeners/observers.
p=root/'app.js'
s=p.read_text()
anchor='  $(id).classList.add("active");\n'
insert='  document.querySelector(".hero")?.classList.toggle("header-compact",id!=="home");\n'
if insert not in s:
    if anchor not in s: raise SystemExit('showScreen anchor missing')
    s=s.replace(anchor,anchor+insert,1)
p.write_text(s)

# styles.css: only hide the descriptive paragraph on compact screens.
p=root/'styles.css'
s=p.read_text()
block='''/* Static per-screen hero: Home full, all other screens compact */\n.hero.header-compact p{display:none}'''
if 'Static per-screen hero' not in s:
    s=s.rstrip()+'\n\n'+block+'\n'
p.write_text(s)

# Asset versions.
p=root/'index.html'; s=p.read_text().replace('styles.css?v=38','styles.css?v=39').replace('app.js?v=34','app.js?v=35'); p.write_text(s)
p=root/'sw.js'; s=p.read_text().replace('`${CACHE_PREFIX}v5`','`${CACHE_PREFIX}v6`').replace('./styles.css?v=38','./styles.css?v=39').replace('./app.js?v=34','./app.js?v=35'); p.write_text(s)

# Regression assertions.
p=root/'tests/regression.mjs'; s=p.read_text()
s=s.replace('"styles.css?v=38"','"styles.css?v=39"').replace('"app.js?v=34"','"app.js?v=35"').replace('CACHE_PREFIX\\}v5','CACHE_PREFIX\\}v6')
addition='''\nassert.match(app,/classList\\.toggle\\(\"header-compact\",id!==\"home\"\\)/,"header mode follows screen selection only");\nassert.match(css,/\\.hero\\.header-compact p\\{display:none\\}/,"non-Home screens hide only hero description");\nassert.doesNotMatch(app,/hero.*scroll|scroll.*hero/i,"header behavior does not depend on scrolling");\n'''
if 'header mode follows screen selection only' not in s:
    s = s.rstrip()+addition+'\n'
p.write_text(s)
