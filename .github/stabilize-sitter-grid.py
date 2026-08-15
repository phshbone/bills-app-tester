from pathlib import Path

root=Path('.')

# CSS-only geometry stabilization for the four sitter editor fields.
p=root/'styles.css'
s=p.read_text()
block='''
/* Sitter editor field stabilization — geometry only */
#sitterEditor > .row-2{align-items:start}
#sitterEditor > .row-2 > div{display:grid;grid-template-rows:3.1em 1fr;min-width:0}
#sitterEditor > .row-2 > div > label{display:flex;align-items:flex-start;margin:0;padding:0 0 5px;line-height:1.35}
#sitterEditor > .row-2 > div > textarea{height:112px;min-height:112px;resize:vertical}
@media(max-width:480px){
  #sitterEditor > .row-2{grid-template-columns:1fr 1fr;gap:9px}
  #sitterEditor > .row-2 > div{grid-template-rows:3.1em 1fr}
}
'''
if 'Sitter editor field stabilization' not in s:
    s=s.rstrip()+block
p.write_text(s.rstrip()+"\n")

# Cache/version references only; no behavioral JS changes.
p=root/'index.html'; s=p.read_text().replace('styles.css?v=38','styles.css?v=39'); p.write_text(s)
p=root/'sw.js'; s=p.read_text().replace('`${CACHE_PREFIX}v5`','`${CACHE_PREFIX}v6`').replace('./styles.css?v=38','./styles.css?v=39'); p.write_text(s)

# Update regression expectations for cache + verify the stabilizer exists.
p=root/'tests/regression.mjs'; s=p.read_text()
s=s.replace('"styles.css?v=38"','"styles.css?v=39"')
s=s.replace('CACHE_PREFIX\\}v5','CACHE_PREFIX\\}v6')
needle='assert.match(css,/Sitter Mode restored popup presentation/,"restored sitter overlays have isolated styling");'
addition='''
assert.match(css,/#sitterEditor > \\.row-2 > div\\{display:grid;grid-template-rows:3\\.1em 1fr;min-width:0\\}/,"sitter editor labels reserve equal vertical space");
assert.match(css,/#sitterEditor > \\.row-2 > div > textarea\\{height:112px;min-height:112px;resize:vertical\\}/,"sitter editor textareas keep equal starting height");'''
if addition.strip() not in s:
    if needle not in s: raise SystemExit('regression anchor missing')
    s=s.replace(needle,needle+addition,1)
p.write_text(s)
