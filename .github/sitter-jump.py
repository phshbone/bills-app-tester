from pathlib import Path

root=Path('.')

p=root/'shared-care.js'
s=p.read_text()
old='''    jumpNav.addEventListener("click",event=>{\n      const button=event.target.closest("[data-care-jump]");\n      if(!button)return;\n      document.getElementById(button.dataset.careJump)?.scrollIntoView({behavior:"smooth",block:"start"});\n    });'''
new='''    jumpNav.addEventListener("click",event=>{\n      const button=event.target.closest("[data-care-jump]");\n      if(!button)return;\n      const sitterJump=button.dataset.careJump==="sitterEditor";\n      const targetId=sitterJump?"sitterControlsAnchor":button.dataset.careJump;\n      document.getElementById(targetId)?.scrollIntoView({behavior:"smooth",block:sitterJump?"center":"start"});\n    });'''
if old not in s: raise SystemExit('jump handler anchor missing')
s=s.replace(old,new,1)
old_actions='<div class="actions"><button class="secondary" id="saveSitterInstructions" type="button">Save draft</button>'
new_actions='<div class="actions" id="sitterControlsAnchor"><button class="secondary" id="saveSitterInstructions" type="button">Save draft</button>'
if old_actions not in s: raise SystemExit('sitter actions anchor missing')
s=s.replace(old_actions,new_actions,1)
p.write_text(s)

p=root/'index.html'
s=p.read_text()
if 'shared-care.js?v=20' not in s: raise SystemExit('index shared-care version missing')
s=s.replace('shared-care.js?v=20','shared-care.js?v=21')
p.write_text(s)

p=root/'sw.js'
s=p.read_text()
if '`${CACHE_PREFIX}v6`' not in s or './shared-care.js?v=20' not in s: raise SystemExit('service worker version anchors missing')
s=s.replace('`${CACHE_PREFIX}v6`','`${CACHE_PREFIX}v7`').replace('./shared-care.js?v=20','./shared-care.js?v=21')
p.write_text(s)

p=root/'tests/regression.mjs'
s=p.read_text()
s=s.replace('"shared-care.js?v=20"','"shared-care.js?v=21"').replace('CACHE_PREFIX\\}v6','CACHE_PREFIX\\}v7')
addition='''\nassert.match(sharedCare,/const sitterJump=button\\.dataset\\.careJump===\"sitterEditor\"/,"Sitter care pill has its own landing behavior");\nassert.match(sharedCare,/targetId=sitterJump\\?\"sitterControlsAnchor\":button\\.dataset\\.careJump/,"Sitter pill targets the existing control row");\nassert.match(sharedCare,/block:sitterJump\\?\"center\":\"start\"/,"Sitter controls are centered while other care pills still align sections to the top");\nassert.match(sharedCare,/id=\"sitterControlsAnchor\"/,"Sitter actions expose a dedicated jump anchor");'''
if 'Sitter care pill has its own landing behavior' not in s:
    s=s.rstrip()+addition+'\n'
p.write_text(s)
