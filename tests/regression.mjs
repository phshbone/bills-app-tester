import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const root=new URL("../",import.meta.url);
const coreSource=fs.readFileSync(new URL("shared-care-core.js",root),"utf8");
const coreContext={globalThis:{}};vm.createContext(coreContext);vm.runInContext(coreSource,coreContext);
const core=coreContext.globalThis.FrannieCareCore;

const base=core.normalize({
  sitter:{active:false},
  treatments:[{id:"a",type:"Medication",name:"A",active:true},{id:"b",type:"Medication",name:"B",active:true}],
  feedingItems:[{id:"f1",category:"Treat",brand:"One",active:true},{id:"f2",category:"Treat",brand:"Two",active:true}],
  activityLog:[{id:"old",at:"2026-08-12T10:00:00Z",actor:"A",action:"Old"}]
});
const activated=core.normalize({...base,sitter:{active:true,activatedBy:"Mollie",sessionId:"session-a",changedAt:"2026-08-15T13:00:00Z",changedBy:"Mollie",changeId:"change-a"}});
const merged=core.merge(base,activated,base);
assert.equal(merged.sitter.active,true,"local sitter activation survives a stale remote value");
assert.equal(merged.sitter.activatedBy,"Mollie","sitter ownership is attributed to the person");
assert.equal(merged.sitter.changeId,"change-a","sitter mutation identity survives normalization and merge");
assert.equal(merged.treatments.filter(x=>x.active).length,2,"multiple current medications coexist");
assert.equal(merged.feedingItems.filter(x=>x.active).length,2,"multiple same-category current foods coexist");

const remote=core.normalize({...base,activityLog:[{id:"new",at:"2026-08-12T11:00:00Z",actor:"B",action:"New"}]});
const audit=core.merge(base,activated,remote).activityLog;
assert.deepEqual(Array.from(audit,x=>x.id),["new","old"],"audit merge is append-only and newest-first");
assert.equal(core.mergeActivityLog([...audit,audit[0]],audit).length,2,"audit IDs remain exactly once");

const sitterSource=fs.readFileSync(new URL("sitter-mode.js",root),"utf8");
const sitterContext={globalThis:{}};vm.createContext(sitterContext);vm.runInContext(sitterSource,sitterContext);
const sitterLogic=sitterContext.globalThis.FrannieSitterMode.logic;
assert.equal(sitterLogic.ownerMatches({active:true,activatedBy:"Mollie"},"mollie"),true,"the activating person owns the active sitter session regardless of name case");
assert.equal(sitterLogic.ownerMatches({active:true,activatedBy:"Mollie"},"Brett"),false,"a different family member cannot end the owner's sitter session");
assert.equal(sitterLogic.ownerMatches({active:false,activatedBy:"Mollie"},"Mollie"),false,"an inactive sitter draft has no active-session owner");

const pendingActivate={changeId:"activate-1",sitter:{active:true,activatedBy:"Mollie",sessionId:"session-1",changedAt:"2026-08-15T13:10:00Z",changeId:"activate-1"}};
const staleInactive={active:false,activatedBy:"Mollie",sessionId:"session-1",changedAt:"2026-08-15T13:09:00Z",changeId:"older-0"};
let decision=sitterLogic.resolveMutation(staleInactive,pendingActivate);
assert.equal(decision.mustWrite,true,"pending activation remains authoritative over an older inactive cloud state");
assert.equal(decision.sitter.active,true,"stale cloud data cannot silently deactivate a pending activation");

const pendingEnd={changeId:"end-1",sitter:{active:false,activatedBy:"Mollie",sessionId:"session-1",changedAt:"2026-08-15T13:20:00Z",changeId:"end-1",endedBy:"Mollie"}};
const staleActive={active:true,activatedBy:"Mollie",sessionId:"session-1",changedAt:"2026-08-15T13:19:00Z",changeId:"older-1"};
decision=sitterLogic.resolveMutation(staleActive,pendingEnd);
assert.equal(decision.mustWrite,true,"pending end remains authoritative over an older active cloud state");
assert.equal(decision.sitter.active,false,"stale cloud data cannot reactivate a session the owner ended");

decision=sitterLogic.resolveMutation({...pendingEnd.sitter},pendingEnd);
assert.equal(decision.acknowledged,true,"matching mutation id is an exact server acknowledgement");
assert.equal(decision.clearPending,true,"acknowledged sitter command may clear its durable pending envelope");

decision=sitterLogic.resolveMutation({active:true,activatedBy:"Mollie",sessionId:"session-2",changedAt:"2026-08-15T13:30:00Z",changeId:"newer-2"},pendingEnd);
assert.equal(decision.mustWrite,false,"a genuinely newer remote sitter mutation supersedes an obsolete pending envelope");
assert.equal(decision.clearPending,true,"obsolete pending state is discarded instead of resurrecting an older session");

const shared=fs.readFileSync(new URL("shared-care.js",root),"utf8");
assert.match(shared,/sitterMode\.resolveRemote\(serverState\.sitter\)/,"shared-care sync delegates sitter reconciliation to the new module");
assert.doesNotMatch(shared,/sitterActiveIntent|sitterDismissedThisForeground|canEndSitter/,"old sitter patch machinery is removed");
assert.doesNotMatch(shared,/sitterModal|sitterEntryAlert|continueToSitterInstructions/,"shared-care stays presentation-agnostic; sitter overlays live in the sitter module");
assert.match(shared,/currentMedication=.*filter\(item=>item\.type==="Medication"&&item\.active===true\)/,"sitter includes every explicit current medication");
assert.match(shared,/currentFood=.*filter\(item=>item\.active===true\)/,"sitter includes every explicit current feeding item");
assert.doesNotMatch(shared,/searchParams\.set\("(?:connect|invite)",connectionCode\)/,"permanent credentials are never put in invite URLs");
assert.doesNotMatch(shared,/document\.body\.style\.overflow/,"shared care never mutates body overflow");
assert.match(shared,/Manage connection & activity[\s\S]*care-cloud-actions/,"connection controls remain inside the collapsible details panel");
assert.match(shared,/closeConnectionSetup\(\);setTimeout\(\(\)=>alert/,"connection errors release their modal before showing an alert");
assert.match(shared,/Create \/ replace recovery link/,"connected devices retain reusable recovery-link control");
assert.match(shared,/request\("\/v1\/recovery-links"/,"recovery links remain created by the authenticated Worker endpoint");

assert.match(sitterSource,/PENDING_KEY="frannieSitterPendingV2"/,"sitter commands persist independently across PWA suspension/restart");
assert.match(sitterSource,/Activated Sitter Mode/,"activation is explicitly attributed in the activity log");
assert.match(sitterSource,/Ended Sitter Mode/,"deactivation is explicitly attributed in the activity log");
assert.match(sitterSource,/Updated active sitter instructions/,"the active-session owner can update the live sitter sheet");
assert.match(sitterSource,/className="modal sitter-modal"[\s\S]*className="modal sitter-entry-alert"/,"caretaker alert and caretaker list are restored as separate overlays");
assert.match(sitterSource,/Puppy Sitting Mode[\s\S]*View sitter instructions/,"the red caretaker alert restores the original sitter entry flow");
assert.doesNotMatch(sitterSource,/sitterViewScreen|showScreen\("sitterViewScreen"\)/,"caretaker view no longer becomes an app screen");
assert.doesNotMatch(sitterSource,/document\.body\.style\.overflow/,"sitter overlays never mutate body scrolling");
assert.match(sitterSource,/Only \$\{current\.activatedBy[\s\S]*can edit the active instructions/,"non-owner cannot edit an active sitter session");
assert.match(sitterSource,/Only \$\{current\.activatedBy[\s\S]*can end this sitter session/,"non-owner cannot end an active sitter session");

const html=fs.readFileSync(new URL("index.html",root),"utf8");
const sw=fs.readFileSync(new URL("sw.js",root),"utf8");
const app=fs.readFileSync(new URL("app.js",root),"utf8");
const css=fs.readFileSync(new URL("styles.css",root),"utf8");
assert.match(app,/x\.type==="Medication"\)return x\.active===true\?\["Ongoing"[\s\S]*\["Ended"/,"medication status follows the explicit Current switch");
assert.match(app,/class="entry-actions"/,"treatment edit and remove buttons retain a dedicated action row");
assert.match(app,/currentMedications=items\.filter[\s\S]*visible=\[\.\.\.currentMedications,\.\.\.otherTreatments\.slice\(0,1\)\]/,"all current medications remain visible above collapsed treatment history");
for(const asset of ["styles.css?v=39","app.js?v=34","shared-care-core.js?v=18","sitter-mode.js?v=3","shared-care.js?v=20"]){
  assert.ok(html.includes(asset),`index references ${asset}`);assert.ok(sw.includes(asset),`service worker caches ${asset}`);
}
assert.match(sw,/frannie-pr7-stable-/,"service worker cache remains isolated to this app");
assert.match(sw,/CACHE_NAME = `\$\{CACHE_PREFIX\}v6`/,"restored sitter UI advances the isolated cache generation");
assert.match(sw,/keys\.filter\(k=>k\.startsWith\(CACHE_PREFIX\)&&k!==CACHE_NAME\)/,"cache cleanup cannot delete another app's caches");
assert.match(sw,/sitter-mode\.js/,"service worker treats the sitter module as an app-shell/core asset");
assert.match(css,/html\{background:#1b1719\}/,"the iPhone area below the toolbar uses the toolbar color");
assert.match(html,/class="app-body" id="appBody"/,"the app has one dedicated middle scrolling region");
assert.match(css,/\.app\{[\s\S]*?height:100dvh;[\s\S]*?display:flex;[\s\S]*?flex-direction:column;[\s\S]*?overflow:hidden !important;/,"the app shell owns the full viewport as a structural flex column");
assert.match(css,/\.app-body\{[\s\S]*?flex:1 1 auto;[\s\S]*?min-height:0;[\s\S]*?overflow-y:auto;/,"only the center app body scrolls");
assert.match(css,/\.bottom-nav\{[\s\S]*?position:relative !important;[\s\S]*?flex:0 0 auto;/,"bottom navigation is structural rather than floating over content");
assert.doesNotMatch(css,/\.bottom-nav\{[^}]*position:fixed/,"navigation never uses iOS position fixed");
assert.match(css,/body\{\s*position:static !important;/,"body no longer owns a fixed iOS compositor layer");
assert.match(app,/document\.querySelector\("\.app-body"\)/,"screen navigation resets the single body scroller");
assert.doesNotMatch(app,/requestAnimationFrame\(\(\)=>\{scroller\.scrollTop=0\}\)/,"navigation no longer performs a second competing scroll reset");
assert.match(shared,/document\.querySelector\("\.app-body"\)/,"shared-care jump navigation uses the same single body scroller");
assert.match(css,/Sitter Mode restored popup presentation/,"restored sitter overlays have isolated styling");
assert.match(html,/id="appHero"/,"accordion header has a dedicated hero target");
assert.match(html,/body\.addEventListener\("scroll"[\s\S]*?y>42[\s\S]*?y<6/,"accordion uses one passive body-scroll listener with hysteresis");
assert.match(css,/\.hero\.hero-compact\{padding:12px 16px;border-radius:20px\}/,"compact header reduces only hero presentation geometry");
assert.match(css,/\.hero\.hero-compact \.hero-collapsible\{max-height:0;opacity:0;margin:0\}/,"compact header collapses eyebrow and descriptive copy");
assert.doesNotMatch(css,/Header accordion[\s\S]*position:(?:fixed|sticky|absolute)/,"accordion header adds no positioning compositor layer");
assert.match(css,/sitter-entry-card[\s\S]*#9e2f44/,"caretaker alert restores the red-accent presentation");
assert.match(app,/setTimeout\(dismissSplash,3000\)/,"the baseline splash timing is untouched");

const worker=fs.readFileSync(new URL("worker/src/worker.js",root),"utf8");
assert.doesNotMatch(worker,/LEGACY_FAMILY_TOKEN\s*=\s*["']/,"legacy credential is not embedded");
assert.match(worker,/credential_hash/,"device credentials are stored by hash");
assert.match(worker,/used_at IS NULL AND expires_at > CURRENT_TIMESTAMP/,"invite claim is single-use and expiry checked");
assert.match(worker,/revoked_at/,"revoked credentials are rejected");
assert.match(worker,/frannie_recovery_links/,"recovery links are hashed, server-held, and revocable");

const manifest=JSON.parse(fs.readFileSync(new URL("manifest.json",root),"utf8"));
assert.equal(manifest.display,"standalone","official manifest installs as a standalone PWA");
assert.equal(manifest.icons.length,2,"official manifest includes both app icon sizes");
for(const asset of ["assets/frannie-background.webp","assets/frannie-photo.webp","assets/icon-192.png","assets/icon-512.png"]){
  assert.ok(fs.statSync(new URL(asset,root)).size>50000,`${asset} is present and non-empty`);
  assert.ok(sw.includes(`./${asset}`),`service worker caches ${asset}`);
}
const training=fs.readFileSync(new URL("frannies-training-update.js",root),"utf8");
assert.match(training,/Training Video Library/,"official training resource library is restored");
assert.doesNotMatch(training,/document\.body\.style\.overflow/,"training video library preserves iPhone modal compositing repair");
assert.ok(html.includes("frannies-training-update.js?v=2"),"index loads restored training interface v2");
assert.ok(sw.includes("frannies-training-update.js?v=2"),"service worker caches restored training interface v2");

assert.match(sitterSource,/PRE_RELEASE_RESET_CUTOFF=Date\.parse\("2026-08-15T14:40:00\.000Z"\)/,"Pass 1 has a fixed pre-release sitter reset cutoff");
assert.match(sitterSource,/function isPreReleaseSession\(value\)/,"legacy test sessions are identified explicitly");
assert.match(sitterSource,/if\(isPreReleaseSession\(remote\)\)[\s\S]*mustWrite:true/,"an old cloud-active session is force-ended through the shared sync write path");
assert.match(sitterSource,/activatedAt<PRE_RELEASE_RESET_CUTOFF/,"post-cutoff sitter sessions are never auto-ended");
console.log("PASS: Frannie restored sitter overlays + persistent ownership + structural app-shell regression assertions");
