import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const root=new URL("../",import.meta.url);
const coreSource=fs.readFileSync(new URL("shared-care-core.js",root),"utf8");
const context={globalThis:{}};vm.createContext(context);vm.runInContext(coreSource,context);
const core=context.globalThis.FrannieCareCore;

const base=core.normalize({
  sitter:{active:false},
  treatments:[{id:"a",type:"Medication",name:"A",active:true},{id:"b",type:"Medication",name:"B",active:true}],
  feedingItems:[{id:"f1",category:"Treat",brand:"One",active:true},{id:"f2",category:"Treat",brand:"Two",active:true}],
  activityLog:[{id:"old",at:"2026-08-12T10:00:00Z",actor:"A",action:"Old"}]
});
const activated=core.normalize({...base,sitter:{active:true,activatedBy:"Mollie",activatedByDeviceId:"device-a",sessionId:"session-a"}});
const merged=core.merge(base,activated,base);
assert.equal(merged.sitter.active,true,"local sitter activation survives a stale remote value");
assert.equal(merged.sitter.activatedByDeviceId,"device-a","device ownership survives normalization and merge");
assert.equal(merged.treatments.filter(x=>x.active).length,2,"multiple current medications coexist");
assert.equal(merged.feedingItems.filter(x=>x.active).length,2,"multiple same-category current foods coexist");

const remote=core.normalize({...base,activityLog:[{id:"new",at:"2026-08-12T11:00:00Z",actor:"B",action:"New"}]});
const audit=core.merge(base,activated,remote).activityLog;
assert.deepEqual(Array.from(audit,x=>x.id),["new","old"],"audit merge is append-only and newest-first");
assert.equal(core.mergeActivityLog([...audit,audit[0]],audit).length,2,"audit IDs remain exactly once");

const shared=fs.readFileSync(new URL("shared-care.js",root),"utf8");
assert.match(shared,/sitterNeedsWrite[\s\S]*saveRemote\(shared,result\.version\|\|0\)/,"unacknowledged sitter intent is pushed before becoming the sync base");
assert.match(shared,/activatedByDeviceId:deviceInfo\?\.id\|\|localDeviceId/,"activation binds ownership to the device");
assert.match(shared,/currentMedication=.*filter\(item=>item\.type==="Medication"&&item\.active===true\)/,"sitter filters every explicit current medication");
assert.match(shared,/currentFood=.*filter\(item=>item\.active===true\)/,"sitter filters every explicit current feeding item");
assert.match(shared,/sitterChecklistChecks=new Set\(\)/,"checklist state is session-only");
assert.doesNotMatch(shared,/searchParams\.set\("(?:connect|invite)",connectionCode\)/,"permanent credentials are never put in invite URLs");
assert.doesNotMatch(shared,/document\.body\.style\.overflow/,"sitter/connection modals do not mutate body overflow");

const html=fs.readFileSync(new URL("index.html",root),"utf8");
const sw=fs.readFileSync(new URL("sw.js",root),"utf8");
for(const asset of ["styles.css?v=31","app.js?v=31","shared-care-core.js?v=15","shared-care.js?v=15"]){
  assert.ok(html.includes(asset),`index references ${asset}`);assert.ok(sw.includes(asset),`service worker caches ${asset}`);
}
assert.match(sw,/frannies-good-girl-v35/,"service worker cache version is v35");

const worker=fs.readFileSync(new URL("worker/src/worker.js",root),"utf8");
assert.doesNotMatch(worker,/LEGACY_FAMILY_TOKEN\s*=\s*["']/,"legacy credential is not embedded");
assert.match(worker,/credential_hash/,"device credentials are stored by hash");
assert.match(worker,/used_at IS NULL AND expires_at > CURRENT_TIMESTAMP/,"invite claim is single-use and expiry checked");
assert.match(worker,/revoked_at/,"revoked credentials are rejected");

console.log("PASS: 18 Frannie state, sync, pairing, audit, checklist, and PWA regression assertions");
