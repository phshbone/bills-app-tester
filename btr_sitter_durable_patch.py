from pathlib import Path


def one(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

p = Path("shared-care.js")
s = p.read_text()
s = one(s,
    '  const SYNC_KEY="frannieCareSyncV1";\n  const USER_KEY="frannieCareUserNameV1";',
    '  const SYNC_KEY="frannieCareSyncV1";\n  const SITTER_INTENT_KEY="frannieCareSitterIntentV1";\n  const USER_KEY="frannieCareUserNameV1";',
    "sitter intent storage key")
s = one(s,
    '  let sitterActiveIntent=null;\n  let focusSelectionIntent=null;',
    '  let sitterActiveIntent=loadSitterIntent();\n  let focusSelectionIntent=null;',
    "load persisted sitter intent")
s = one(s,
    '  function sitterChecklistKey(sectionTitle,index,item){\n    return `${sectionTitle}::${index}::${String(item||"")}`;\n  }\n',
    '  function sitterChecklistKey(sectionTitle,index,item){\n    return `${sectionTitle}::${index}::${String(item||"")}`;\n  }\n\n  function loadSitterIntent(){\n    try{\n      const saved=JSON.parse(localStorage.getItem(SITTER_INTENT_KEY)||"null");\n      return saved&&typeof saved.active==="boolean"?saved.active:null;\n    }catch{return null}\n  }\n  function setSitterIntent(active){\n    sitterActiveIntent=Boolean(active);\n    localStorage.setItem(SITTER_INTENT_KEY,JSON.stringify({active:sitterActiveIntent,at:new Date().toISOString()}));\n  }\n  function clearSitterIntent(){\n    sitterActiveIntent=null;\n    localStorage.removeItem(SITTER_INTENT_KEY);\n  }\n',
    "durable sitter intent helpers")
old_can = '''  function canEndSitter(){
    if(!state.sitter?.active)return false;
    const ownerDevice=(state.sitter?.activatedByDeviceId||"").trim();
    const thisDeviceIds=[deviceInfo?.id,localDeviceId].map(value=>String(value||"").trim()).filter(Boolean);
    if(ownerDevice)return thisDeviceIds.includes(ownerDevice);
    // Legacy active sessions did not have a device owner. Retain the old name
    // check only for those sessions so an upgrade cannot permanently lock one.
    const owner=(state.sitter?.activatedBy||"").trim();
    return !owner||sameActor(owner,userName);
  }
'''
new_can = '''  function canEndSitter(){
    if(!state.sitter?.active)return false;
    const ownerDevice=(state.sitter?.activatedByDeviceId||"").trim();
    const owner=(state.sitter?.activatedBy||"").trim();
    const thisDeviceIds=[deviceInfo?.id,localDeviceId].map(value=>String(value||"").trim()).filter(Boolean);
    const sameNamedOwner=Boolean(owner&&userName&&sameActor(owner,userName));
    // Prefer exact device ownership, but do not permanently strand a sitter
    // session after a reinstall, recovery pairing, or local device-id change.
    // The same named family member may reclaim and end their active session.
    if(ownerDevice)return thisDeviceIds.includes(ownerDevice)||sameNamedOwner;
    return !owner||sameNamedOwner;
  }
'''
s = one(s, old_can, new_can, "same-owner sitter reclaim")
s = one(s,
    '      state.sitter=shared.sitter;\n      Store.save(state);',
    '      state.sitter=shared.sitter;\n      if(sitterActiveIntent!==null){\n        state.sitter={...(state.sitter||{}),active:sitterActiveIntent};\n      }\n      Store.save(state);',
    "pending intent wins during render")
s = one(s,
    '      if(sitterActiveIntent!==null&&sitterAcknowledged){\n        sitterActiveIntent=null;\n      }else if(sitterActiveIntent!==null){',
    '      if(sitterActiveIntent!==null&&sitterAcknowledged){\n        clearSitterIntent();\n      }else if(sitterActiveIntent!==null){',
    "clear intent only after acknowledgement")
s = one(s, '    sitterActiveIntent=true;', '    setSitterIntent(true);', "durable activate intent")
s = one(s, '    sitterActiveIntent=false;', '    setSitterIntent(false);', "durable end intent")
p.write_text(s)

p = Path("index.html")
s = p.read_text()
s = one(s, 'shared-care.js?v=18', 'shared-care.js?v=20', "index cache bust")
p.write_text(s)

p = Path("sw.js")
s = p.read_text()
s = one(s, "const CACHE_NAME = 'frannies-good-girl-v38';", "const CACHE_NAME = 'frannies-good-girl-v40';", "service worker cache generation")
s = one(s, 'shared-care.js?v=18', 'shared-care.js?v=20', "service worker shared-care cache bust")
p.write_text(s)

p = Path("tests/regression.mjs")
s = p.read_text()
anchor = 'assert.match(shared,/sitterNeedsWrite[\\s\\S]*saveRemote\\(shared,result\\.version\\|\\|0\\)/,"unacknowledged sitter intent is pushed before becoming the sync base");\n'
extra = '''assert.match(shared,/SITTER_INTENT_KEY="frannieCareSitterIntentV1"/,"pending sitter intent has durable local storage");
assert.match(shared,/let sitterActiveIntent=loadSitterIntent\\(\\)/,"pending sitter intent is restored after a PWA restart");
assert.match(shared,/setSitterIntent\\(false\\)/,"ending sitter mode records a durable false intent");
assert.match(shared,/clearSitterIntent\\(\\)[\\s\\S]*sitterAcknowledged/,"pending sitter intent is cleared only after matching server acknowledgement");
assert.match(shared,/thisDeviceIds\\.includes\\(ownerDevice\\)\\|\\|sameNamedOwner/,"the same named owner can reclaim a sitter session after device-id rotation");
'''
if anchor not in s:
    raise SystemExit("test insertion anchor missing")
s = s.replace(anchor, anchor + extra, 1)
s = one(s, 'shared-care.js?v=18', 'shared-care.js?v=20', "test shared-care version")
s = one(s, 'frannies-good-girl-v38', 'frannies-good-girl-v40', "test service worker version")
s = s.replace('PASS: 42 Frannie', 'PASS: 47 Frannie', 1)
p.write_text(s)
