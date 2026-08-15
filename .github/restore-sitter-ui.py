from pathlib import Path

root=Path('.')

# sitter-mode.js: restore the older two-overlay presentation while keeping the
# rewritten ownership + durable mutation engine.
p=root/'sitter-mode.js'; s=p.read_text()
s=s.replace('    let returnScreen="care";\n    let foregroundOpened=false;\n','    let entryDismissedThisForeground=false;\n',1)
s=s.replace('        if(open)openView("care");','        if(open)showEntryAlert(true);',1)

old='''    function resetPreReleaseSession(){
      const current=getSitter();
      if(!current.active)return false;
      const activatedAt=Date.parse(current.activatedAt||"")||0;
      if(activatedAt>=PRE_RELEASE_RESET_CUTOFF)return false;
      const actor=getUser()||"System";
      const next={...current,active:false,endedAt:new Date().toISOString(),endedBy:actor};
      return setAndPersist(next,"Reset pre-release sitter test session");
    }
'''
new='''    function isPreReleaseSession(value){
      const sitter=normalize(value);
      if(!sitter.active)return false;
      const activatedAt=Date.parse(sitter.activatedAt||"")||0;
      return activatedAt<PRE_RELEASE_RESET_CUTOFF;
    }

    function buildMigrationEnd(value){
      const current=normalize(value);
      const existing=loadPending();
      if(existing&&!existing.sitter.active&&existing.sitter.sessionId===current.sessionId)return existing.sitter;
      const actor=getUser()||current.activatedBy||"System";
      const next=stamp({...current,active:false,endedAt:new Date().toISOString(),endedBy:actor});
      storePending(next);
      options.setSitter(next);
      options.saveLocalOnly?.();
      return next;
    }
'''
if old not in s: raise SystemExit('old reset block not found')
s=s.replace(old,new,1)

old='''    function resolveRemote(remoteValue){
      const pending=loadPending();
      const decision=resolveMutation(remoteValue,pending);
      if(decision.clearPending)clearPending();
      return {sitter:decision.sitter,mustWrite:decision.mustWrite,acknowledged:decision.acknowledged};
    }
'''
new='''    function resolveRemote(remoteValue){
      const remote=normalize(remoteValue);
      let pending=loadPending();
      // Migration rule: an old test-era active session must be ended in the
      // shared record itself. Keep returning an authoritative inactive
      // mutation until the Worker acknowledges that exact changeId.
      if(isPreReleaseSession(remote)){
        const reset=buildMigrationEnd(remote);
        pending=loadPending();
        return {sitter:reset,mustWrite:true,acknowledged:false};
      }
      const decision=resolveMutation(remote,pending);
      if(decision.clearPending)clearPending();
      return {sitter:decision.sitter,mustWrite:decision.mustWrite,acknowledged:decision.acknowledged};
    }
'''
if old not in s: raise SystemExit('resolveRemote block not found')
s=s.replace(old,new,1)

s=s.replace('      foregroundOpened=true;\n      setAndPersist(next,"Activated Sitter Mode",{open:true});','      entryDismissedThisForeground=false;\n      setAndPersist(next,"Activated Sitter Mode",{open:true});',1)
s=s.replace('      foregroundOpened=true;\n      if(setAndPersist(next,"Ended Sitter Mode")){\n        if(document.getElementById("sitterViewScreen")?.classList.contains("active"))closeView();\n      }','      entryDismissedThisForeground=false;\n      if(setAndPersist(next,"Ended Sitter Mode")){\n        closeView();\n        closeEntryAlert();\n      }',1)

start=s.index('    function buildScreen(){')
end=s.index('    async function share(){', start)
replacement=r'''    function buildOverlays(){
      if(!document.getElementById("sitterModal")){
        const modal=document.createElement("div");
        modal.className="modal sitter-modal";modal.id="sitterModal";
        modal.innerHTML=`<div class="modal-box sitter-modal-box"><div class="modal-head"><strong>Frannie’s Sitter</strong><button id="closeSitterView" type="button">Close ✕</button></div><div class="sitter-modal-body"><label class="sitter-checklist"><input id="sitterChecklistToggle" type="checkbox"> Add a temporary caretaker checklist</label><div id="sitterViewContent"></div><div class="actions"><button class="primary" id="shareSitterView" type="button">Share</button><button class="secondary" id="printSitterView" type="button">Print / PDF</button></div></div></div>`;
        document.body.appendChild(modal);
        document.getElementById("closeSitterView")?.addEventListener("click",closeView);
        document.getElementById("sitterChecklistToggle")?.addEventListener("change",renderView);
        document.getElementById("sitterViewContent")?.addEventListener("change",event=>{
          const checkbox=event.target.closest("input[data-sitter-check]");
          if(!checkbox)return;
          const key=checkbox.dataset.sitterCheck||"";
          if(!key)return;
          if(checkbox.checked)checklistChecks.add(key);else checklistChecks.delete(key);
        });
        document.getElementById("shareSitterView")?.addEventListener("click",share);
        document.getElementById("printSitterView")?.addEventListener("click",print);
        modal.addEventListener("click",event=>{if(event.target===modal)closeView()});
      }
      if(!document.getElementById("sitterEntryAlert")){
        const alertModal=document.createElement("div");
        alertModal.className="modal sitter-entry-alert";alertModal.id="sitterEntryAlert";
        alertModal.setAttribute("role","dialog");alertModal.setAttribute("aria-modal","true");alertModal.setAttribute("aria-labelledby","sitterEntryAlertTitle");
        alertModal.innerHTML=`<div class="sitter-entry-card"><div class="sitter-entry-paws" aria-hidden="true">🐾 &nbsp; 🐾</div><div class="sitter-entry-kicker">CARETAKER ALERT</div><h2 id="sitterEntryAlertTitle">Puppy Sitting Mode</h2><p id="sitterEntryAlertMeta">Active sitter directions are waiting for you.</p><p class="sitter-entry-copy">Please review Frannie’s current food, medication, routine, cautions, and sitter-specific instructions before continuing.</p><button id="continueToSitterInstructions" class="primary" type="button">View sitter instructions</button><button id="dismissSitterEntry" class="secondary sitter-entry-dismiss" type="button">Close</button></div>`;
        document.body.appendChild(alertModal);
        document.getElementById("continueToSitterInstructions")?.addEventListener("click",()=>{closeEntryAlert();openView()});
        document.getElementById("dismissSitterEntry")?.addEventListener("click",closeEntryAlert);
      }
    }

    function openView(){
      buildOverlays();
      renderView();
      document.getElementById("sitterEntryAlert")?.classList.remove("open");
      entryDismissedThisForeground=true;
      document.getElementById("sitterModal")?.classList.add("open");
    }
    function closeView(){
      document.getElementById("sitterModal")?.classList.remove("open");
      document.activeElement?.blur?.();
    }
    function closeEntryAlert(){
      document.getElementById("sitterEntryAlert")?.classList.remove("open");
      entryDismissedThisForeground=true;
      document.activeElement?.blur?.();
    }
    function showEntryAlert(force=false){
      const sitter=getSitter();
      if(!sitter.active||!options.splashDismissed())return;
      if(entryDismissedThisForeground&&!force)return;
      buildOverlays();
      const meta=document.getElementById("sitterEntryAlertMeta");
      if(meta)meta.textContent=sitter.activatedBy?`Directions activated by ${sitter.activatedBy}.`:"Active sitter directions are waiting for you.";
      document.getElementById("sitterEntryAlert")?.classList.add("open");
    }

    function renderView(){
      const content=document.getElementById("sitterViewContent");
      if(!content)return;
      const checklist=document.getElementById("sitterChecklistToggle")?.checked||false;
      content.innerHTML=html({checklist});
    }

    function renderBanner(){
      const sitter=getSitter();
      const banner=document.getElementById("sitterActiveBanner");
      if(banner){
        banner.classList.toggle("hidden",!sitter.active);
        const meta=document.getElementById("sitterActiveMeta");
        if(meta){
          let detail=sitter.activatedBy?`Activated by ${sitter.activatedBy}`:"Tap to view current directions";
          if(sitter.activatedAt){try{detail+=` · ${new Date(sitter.activatedAt).toLocaleString()}`}catch{}}
          meta.textContent=detail;
        }
      }
      const endButton=document.getElementById("endSitterInstructions");
      if(endButton){
        const owner=isOwner(sitter);
        endButton.classList.toggle("hidden",!sitter.active);
        endButton.disabled=sitter.active&&!owner;
        endButton.textContent=sitter.active&&!owner?`Only ${sitter.activatedBy||"activator"} can end`:"End Sitter Mode";
      }
      const activateButton=document.getElementById("activateSitterInstructions");
      if(activateButton)activateButton.classList.toggle("hidden",sitter.active);
      const saveButton=document.getElementById("saveSitterInstructions");
      if(saveButton)saveButton.textContent=sitter.active?"Update active instructions":"Save draft";
    }

    function fillEditor(){options.fillEditor(getSitter())}
    function renderAll(){fillEditor();renderBanner();renderView()}
    function showSaved(message){
      const saved=document.getElementById("sitterSaved");
      if(!saved)return;
      saved.textContent=message;
      saved.classList.remove("hidden");
      clearTimeout(showSaved.timer);
      showSaved.timer=setTimeout(()=>saved.classList.add("hidden"),2600);
    }

'''
s=s[:start]+replacement+s[end:]

old='''    function onForeground(){
      const sitter=getSitter();
      if(!sitter.active||foregroundOpened||!options.splashDismissed())return;
      openView(document.querySelector(".screen.active")?.id||"home");
    }
    function onHidden(){foregroundOpened=false}
    function afterSplashDismiss(){foregroundOpened=false;setTimeout(onForeground,120)}

    buildScreen();
    restorePendingIntoLocal();
    resetPreReleaseSession();
'''
new='''    function onForeground(){showEntryAlert(false)}
    function onHidden(){
      entryDismissedThisForeground=false;
      document.getElementById("sitterModal")?.classList.remove("open");
      document.getElementById("sitterEntryAlert")?.classList.remove("open");
    }
    function afterSplashDismiss(){entryDismissedThisForeground=false;setTimeout(onForeground,120)}

    buildOverlays();
    restorePendingIntoLocal();
'''
if old not in s: raise SystemExit('foreground block not found')
s=s.replace(old,new,1)
p.write_text(s)

# styles.css: swap unused full-screen sitter styles for restored old popup styling.
p=root/'styles.css'; s=p.read_text()
start=s.index('/* Sitter Mode rewrite v1')
replacement='''/* Sitter Mode restored popup presentation — state remains in sitter-mode.js */
.sitter-modal{z-index:12000;background:rgba(34,23,26,.64);-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
.sitter-modal-box{max-height:min(88dvh,760px);display:flex;flex-direction:column}
.sitter-modal-body{padding:14px;overflow-y:auto;background:#fff7f3;-webkit-overflow-scrolling:touch}
.sitter-entry-alert{z-index:13000;background:rgba(35,13,18,.82);-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
.sitter-entry-card{width:min(92vw,430px);padding:24px 20px 20px;border-radius:22px;background:#fff8f5;border:4px solid #9e2f44;box-shadow:0 24px 80px rgba(54,8,20,.52),0 0 0 6px rgba(158,47,68,.15);text-align:center;color:#3d292e}
.sitter-entry-paws{font-size:1.45rem;margin-bottom:5px}
.sitter-entry-kicker{font-size:.72rem;letter-spacing:.16em;font-weight:950;color:#9e2f44;margin-bottom:6px}
.sitter-entry-card h2{margin:0 0 8px;font-size:1.65rem;color:#76263a}
.sitter-entry-card p{margin:7px 0;line-height:1.4}
.sitter-entry-card #sitterEntryAlertMeta{font-weight:900;color:#6d3846}
.sitter-entry-copy{font-size:.88rem;color:#5d4a50}
.sitter-entry-card button{width:100%;margin-top:10px}
.sitter-entry-card #continueToSitterInstructions{background:#9e2f44!important;border-color:#9e2f44!important;color:#fff!important;font-size:.98rem}
.sitter-entry-dismiss{background:#fff8f5!important;color:#704753!important}
@media(max-width:420px){.sitter-entry-card{padding:21px 16px 17px}.sitter-entry-card h2{font-size:1.45rem}}
'''
s=s[:start]+replacement+'\n'
p.write_text(s)

# Cache-bust only the two changed UI assets.
p=root/'index.html'; s=p.read_text().replace('styles.css?v=37','styles.css?v=38').replace('sitter-mode.js?v=2','sitter-mode.js?v=3'); p.write_text(s)
p=root/'sw.js'; s=p.read_text().replace('`${CACHE_PREFIX}v4`','`${CACHE_PREFIX}v5`').replace('./styles.css?v=37','./styles.css?v=38').replace('./sitter-mode.js?v=2','./sitter-mode.js?v=3'); p.write_text(s)

# Update regression expectations to the restored presentation and forced shared reset.
p=root/'tests/regression.mjs'; s=p.read_text()
s=s.replace('assert.doesNotMatch(shared,/sitterModal|sitterEntryAlert|continueToSitterInstructions/,"old fixed sitter modal and entry overlay are removed");','assert.doesNotMatch(shared,/sitterModal|sitterEntryAlert|continueToSitterInstructions/,"shared-care stays presentation-agnostic; sitter overlays live in the sitter module");')
s=s.replace('assert.match(sitterSource,/screen\\.id="sitterViewScreen"[\\s\\S]*screen\\.className="screen sitter-page-screen"/,"caretaker view is a normal app screen rather than a modal overlay");\nassert.doesNotMatch(sitterSource,/className="modal|classList\\.add\\("open"\\)|document\\.body\\.style\\.overflow/,"rewritten sitter UI has no fixed modal/backdrop state");','assert.match(sitterSource,/className="modal sitter-modal"[\\s\\S]*className="modal sitter-entry-alert"/,"caretaker alert and caretaker list are restored as separate overlays");\nassert.match(sitterSource,/Puppy Sitting Mode[\\s\\S]*View sitter instructions/,"the red caretaker alert restores the original sitter entry flow");\nassert.doesNotMatch(sitterSource,/sitterViewScreen|showScreen\\("sitterViewScreen"\\)/,"caretaker view no longer becomes an app screen");\nassert.doesNotMatch(sitterSource,/document\\.body\\.style\\.overflow/,"sitter overlays never mutate body scrolling");')
s=s.replace('for(const asset of ["styles.css?v=37","app.js?v=34","shared-care-core.js?v=18","sitter-mode.js?v=2","shared-care.js?v=20"]){','for(const asset of ["styles.css?v=38","app.js?v=34","shared-care-core.js?v=18","sitter-mode.js?v=3","shared-care.js?v=20"]){')
s=s.replace('assert.match(sw,/CACHE_NAME = `\\$\\{CACHE_PREFIX\\}v4`/,"structural shell repair advances the isolated cache generation");','assert.match(sw,/CACHE_NAME = `\\$\\{CACHE_PREFIX\\}v5`/,"restored sitter UI advances the isolated cache generation");')
s=s.replace('assert.match(css,/Sitter Mode rewrite v1/,"rewritten sitter screen has isolated styles");\nassert.doesNotMatch(css,/\\.sitter-page-actions\\{position:sticky/,"sitter controls do not add another sticky/fixed compositor layer");','assert.match(css,/Sitter Mode restored popup presentation/,"restored sitter overlays have isolated styling");\nassert.match(css,/sitter-entry-card[\\s\\S]*#9e2f44/,"caretaker alert restores the red-accent presentation");')
s=s.replace('assert.match(sitterSource,/function resetPreReleaseSession\\(\\)/,"Pass 1 defines a pre-release session reset path");\nassert.match(sitterSource,/if\\(activatedAt>=PRE_RELEASE_RESET_CUTOFF\\)return false;/,"post-cutoff sitter sessions are never auto-ended");\nassert.match(sitterSource,/Reset pre-release sitter test session/,"the reset is explicitly logged");','assert.match(sitterSource,/function isPreReleaseSession\\(value\\)/,"legacy test sessions are identified explicitly");\nassert.match(sitterSource,/if\\(isPreReleaseSession\\(remote\\)\\)[\\s\\S]*mustWrite:true/,"an old cloud-active session is force-ended through the shared sync write path");\nassert.match(sitterSource,/activatedAt<PRE_RELEASE_RESET_CUTOFF/,"post-cutoff sitter sessions are never auto-ended");')
s=s.replace('console.log("PASS: Frannie sitter rewrite + structural app-shell navigation regression assertions");','console.log("PASS: Frannie restored sitter overlays + persistent ownership + structural app-shell regression assertions");')
p.write_text(s)
