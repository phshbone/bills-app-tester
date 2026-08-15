(function(root){
  "use strict";

  const PENDING_KEY="frannieSitterPendingV2";
  const PRE_RELEASE_RESET_CUTOFF=Date.parse("2026-08-15T14:40:00.000Z");
  const TEXT_FIELDS=["pottyRoutine","crateSleep","emergencyVet","instructions","activatedAt","activatedBy","activatedByDeviceId","sessionId","changedAt","changedBy","changeId","endedAt","endedBy"];

  function text(value){return typeof value==="string"?value:""}
  function sameActor(left,right){return text(left).trim().toLocaleLowerCase()===text(right).trim().toLocaleLowerCase()}
  function makeId(){return root.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}
  function normalize(value){
    const source=value&&typeof value==="object"?value:{};
    const sitter={};
    TEXT_FIELDS.forEach(field=>{sitter[field]=text(source[field])});
    sitter.active=Boolean(source.active);
    return sitter;
  }
  function meaningfulDraft(sitter){
    return Boolean(sitter.pottyRoutine||sitter.crateSleep||sitter.emergencyVet||sitter.instructions);
  }
  function newer(left,right){
    const a=Date.parse(left||"")||0,b=Date.parse(right||"")||0;
    return a>b;
  }

  function ownerMatches(sitterValue,userName){
    const sitter=normalize(sitterValue);
    if(!sitter.active)return false;
    const owner=text(sitter.activatedBy).trim();
    return !owner||sameActor(owner,userName);
  }

  function resolveMutation(remoteValue,pendingValue){
    const remote=normalize(remoteValue);
    const pending=pendingValue&&pendingValue.sitter?{changeId:text(pendingValue.changeId),sitter:normalize(pendingValue.sitter)}:null;
    if(!pending||!pending.changeId)return {sitter:remote,mustWrite:false,acknowledged:false,clearPending:false};
    if(remote.changeId&&remote.changeId===pending.changeId)return {sitter:remote,mustWrite:false,acknowledged:true,clearPending:true};
    if(remote.changeId&&newer(remote.changedAt,pending.sitter.changedAt))return {sitter:remote,mustWrite:false,acknowledged:false,clearPending:true};
    return {sitter:pending.sitter,mustWrite:true,acknowledged:false,clearPending:false};
  }

  function create(options){
    const checklistChecks=new Set();
    let entryDismissedThisForeground=false;

    function getSitter(){return normalize(options.getSitter())}
    function getUser(){return text(options.getUser()).trim()}
    function isOwner(sitter=getSitter()){return ownerMatches(sitter,getUser())}
    function loadPending(){
      try{
        const raw=JSON.parse(localStorage.getItem(PENDING_KEY)||"null");
        if(!raw||typeof raw!=="object"||!raw.changeId||!raw.sitter)return null;
        return {changeId:text(raw.changeId),sitter:normalize(raw.sitter)};
      }catch{return null}
    }
    function storePending(sitter){
      localStorage.setItem(PENDING_KEY,JSON.stringify({changeId:sitter.changeId,sitter:normalize(sitter)}));
    }
    function clearPending(){localStorage.removeItem(PENDING_KEY)}

    function stamp(next){
      const sitter=normalize(next);
      sitter.changedAt=new Date().toISOString();
      sitter.changedBy=getUser()||"Unknown user";
      sitter.changeId=makeId();
      return sitter;
    }

    function setAndPersist(next,activity,{open=false}={}){
      const sitter=stamp(next);
      storePending(sitter);
      options.setSitter(sitter);
      options.setActivity?.(activity);
      const saved=options.persist();
      if(saved){
        renderAll();
        options.syncSoon?.();
        if(open)showEntryAlert(true);
      }
      return saved;
    }

    function isPreReleaseSession(value){
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

    function restorePendingIntoLocal(){
      const pending=loadPending();
      if(!pending)return false;
      const local=getSitter();
      // If this device already has a newer local mutation, discard an obsolete pending envelope.
      if(local.changeId&&local.changeId!==pending.changeId&&newer(local.changedAt,pending.sitter.changedAt)){
        clearPending();
        return false;
      }
      options.setSitter(pending.sitter);
      options.saveLocalOnly?.();
      return true;
    }

    function resolveRemote(remoteValue){
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

    function acknowledge(remoteValue){
      const remote=normalize(remoteValue);
      const pending=loadPending();
      if(pending&&remote.changeId&&remote.changeId===pending.changeId){clearPending();return true}
      return false;
    }

    function saveInstructions(){
      const current=getSitter();
      if(current.active&&!isOwner(current)){
        alert(`Only ${current.activatedBy||"the person who activated Sitter Mode"} can edit the active instructions. You can still view them.`);
        fillEditor();
        return;
      }
      const draft=options.readEditor();
      const next={...current,...draft};
      setAndPersist(next,current.active?"Updated active sitter instructions":"Saved sitter instruction draft");
      showSaved(current.active?"✓ Active sitter instructions updated.":"✓ Sitter instruction draft saved.");
    }

    function activate(){
      const current=getSitter();
      if(current.active){
        if(isOwner(current))openView("care");
        else alert(`Sitter Mode is already active and owned by ${current.activatedBy||"another family member"}.`);
        return;
      }
      const actor=getUser();
      if(!actor){alert("Add your name before activating Sitter Mode.");return}
      const draft=normalize({...current,...options.readEditor()});
      if(!meaningfulDraft(draft)){alert("Add sitter instructions before activating Sitter Mode.");return}
      const now=new Date().toISOString();
      const next={
        ...draft,
        active:true,
        activatedAt:now,
        activatedBy:actor,
        activatedByDeviceId:"",
        sessionId:makeId(),
        endedAt:"",
        endedBy:""
      };
      entryDismissedThisForeground=false;
      setAndPersist(next,"Activated Sitter Mode",{open:true});
    }

    function end(){
      const current=getSitter();
      if(!current.active)return;
      if(!isOwner(current)){
        alert(`Only ${current.activatedBy||"the person who activated Sitter Mode"} can end this sitter session.`);
        return;
      }
      if(!confirm("End Sitter Mode? The instructions will remain saved as a draft."))return;
      const actor=getUser()||current.activatedBy||"Unknown user";
      const next={...current,active:false,endedAt:new Date().toISOString(),endedBy:actor};
      entryDismissedThisForeground=false;
      if(setAndPersist(next,"Ended Sitter Mode")){
        closeView();
        closeEntryAlert();
      }
    }

    function sections(){return options.sections()}
    function html({checklist=false,print=false}={}){
      return sections().map(section=>{
        const hasItems=section.items.length>0;
        const items=hasItems?section.items:["Not added yet"];
        const list=items.map((item,index)=>{
          let control="";
          if(checklist&&hasItems){
            if(print)control="□ ";
            else{
              const key=`${section.title}::${index}::${String(item||"")}`;
              control=`<input type="checkbox" data-sitter-check="${options.escape(key)}" aria-label="Mark complete"${checklistChecks.has(key)?" checked":""}> `;
            }
          }
          return `<li>${control}${options.escape(item)}</li>`;
        }).join("");
        return `<section class="sitter-view-section"><h3>${options.escape(section.title)}</h3><ul>${list}</ul></section>`;
      }).join("");
    }

    function buildOverlays(){
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

    async function share(){
      const lines=["Frannie’s Sitter",...sections().flatMap(section=>["",section.title,...section.items.map(item=>"- "+item)])];
      const content=lines.join("\n");
      if(navigator.share){try{await navigator.share({title:"Frannie’s Sitter",text:content});return}catch(error){if(error.name==="AbortError")return}}
      try{await navigator.clipboard.writeText(content);alert("Frannie’s sitter information was copied.")}catch{alert("Sharing is not available on this device. Use Print / PDF instead.")}
    }
    function print(){
      const checklist=document.getElementById("sitterChecklistToggle")?.checked||false;
      const report=document.getElementById("printReport");
      if(!report)return;
      report.innerHTML=`<section class="print-card"><h1>Frannie’s Sitter</h1><p class="print-profile">Current caretaker reference</p>${html({checklist,print:true})}</section>`;
      document.documentElement.dataset.printMode="letter";
      const cleanup=()=>{delete document.documentElement.dataset.printMode;window.removeEventListener("afterprint",cleanup)};
      window.addEventListener("afterprint",cleanup);void report.offsetHeight;window.print();
    }

    function onForeground(){showEntryAlert(false)}
    function onHidden(){
      entryDismissedThisForeground=false;
      document.getElementById("sitterModal")?.classList.remove("open");
      document.getElementById("sitterEntryAlert")?.classList.remove("open");
    }
    function afterSplashDismiss(){entryDismissedThisForeground=false;setTimeout(onForeground,120)}

    buildOverlays();
    restorePendingIntoLocal();

    return {
      normalize,
      isOwner,
      saveInstructions,
      activate,
      end,
      openView,
      closeView,
      renderAll,
      fillEditor,
      restorePendingIntoLocal,
      resolveRemote,
      acknowledge,
      afterSplashDismiss,
      onForeground,
      onHidden,
      hasPending:()=>Boolean(loadPending()),
      pending:()=>loadPending()
    };
  }

  root.FrannieSitterMode={create,normalize,sameActor,logic:{ownerMatches,resolveMutation}};
})(globalThis);
