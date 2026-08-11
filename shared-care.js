(function(){
  "use strict";

  const ENDPOINT="https://frannie-care.phshbone.workers.dev";
  const CONNECTION_KEY="frannieCareConnectionV1";
  const SYNC_KEY="frannieCareSyncV1";
  const USER_KEY="frannieCareUserNameV1";
  const MAX_ACTIVITY=100;
  const core=globalThis.FrannieCareCore;
  let connectionCode=localStorage.getItem(CONNECTION_KEY)||"";
  let syncMeta=loadSyncMeta();
  let userName=(localStorage.getItem(USER_KEY)||"").trim();
  let syncTimer=null;
  let syncing=false;
  let syncAgain=false;
  let suppressSync=false;
  let lastCareSnapshot=null;


  const TRACKED_ARRAYS={
    treatments:{label:"treatment / vaccination",name:item=>item?.name||item?.type||"item"},
    feedingItems:{label:"food / treat",name:item=>item?.brand||item?.category||"item"},
    allergies:{label:"allergy / caution",name:item=>item?.text||"item"},
    weights:{label:"weight",name:item=>item?.value||"entry"},
    heights:{label:"height",name:item=>item?.value||"entry"},
    careNotes:{label:"care note",name:item=>item?.title||"note"},
    logs:{label:"training log entry",name:item=>item?.lesson||"session"}
  };

  function careSnapshot(data=currentShared()){
    const snap=core.normalize(data);
    snap.activityLog=[];
    return snap;
  }

  function describeArrayChange(before,after,config){
    const prev=Array.isArray(before)?before:[],next=Array.isArray(after)?after:[];
    const prevById=new Map(prev.filter(x=>x?.id).map(x=>[x.id,x]));
    const nextById=new Map(next.filter(x=>x?.id).map(x=>[x.id,x]));
    const added=next.filter(x=>x?.id&&!prevById.has(x.id));
    const removed=prev.filter(x=>x?.id&&!nextById.has(x.id));
    const changed=next.filter(x=>x?.id&&prevById.has(x.id)&&!core.same(x,prevById.get(x.id)));
    const total=added.length+removed.length+changed.length;
    if(!total)return null;
    if(total>1)return `Updated ${config.label}s (${total} changes)`;
    if(added.length)return `Added ${config.label}: ${config.name(added[0])}`;
    if(removed.length)return `Removed ${config.label}: ${config.name(removed[0])}`;
    return `Updated ${config.label}: ${config.name(changed[0])}`;
  }

  function describePrimitiveChanges(before,after,label){
    const prev=Array.isArray(before)?before:[],next=Array.isArray(after)?after:[];
    const added=next.filter(item=>!prev.includes(item));
    const removed=prev.filter(item=>!next.includes(item));
    if(!added.length&&!removed.length)return null;
    const parts=[];
    if(added.length)parts.push(`Added ${label}: ${added.join(", ")}`);
    if(removed.length)parts.push(`Removed ${label}: ${removed.join(", ")}`);
    return parts.join("; ");
  }

  function describeCareChange(before,after){
    const changes=[];
    if(!core.same(before?.profile,after?.profile)){
      if(before?.profile&&!after?.profile)changes.push("Cleared Frannie’s profile");
      else if(!before?.profile&&after?.profile)changes.push("Added Frannie’s profile");
      else {
        const fields=[];
        const labels={name:"name",age:"age",size:"size",goal:"training goal"};
        Object.keys(labels).forEach(key=>{if(!core.same(before?.profile?.[key],after?.profile?.[key]))fields.push(labels[key])});
        changes.push(fields.length?`Updated Frannie’s profile: ${fields.join(", ")}`:"Updated Frannie’s profile");
      }
    }
    const focusChange=describePrimitiveChanges(before?.selected,after?.selected,"focus area");
    if(focusChange)changes.push(focusChange);
    const completedBefore=Array.isArray(before?.completed)?before.completed:[];
    const completedAfter=Array.isArray(after?.completed)?after.completed:[];
    const completedAdded=completedAfter.filter(item=>!completedBefore.includes(item));
    const completedRemoved=completedBefore.filter(item=>!completedAfter.includes(item));
    if(completedAdded.length)changes.push(`Marked ${completedAdded.length} training lesson${completedAdded.length===1?"":"s"} complete`);
    if(completedRemoved.length)changes.push(`Unmarked ${completedRemoved.length} training lesson${completedRemoved.length===1?"":"s"}`);
    const sitterBefore=before?.sitter||{},sitterAfter=after?.sitter||{};
    if(Boolean(sitterBefore.active)!==Boolean(sitterAfter.active))changes.push(sitterAfter.active?"Activated sitter instructions":"Ended sitter instructions");
    const sitterTextBefore={pottyRoutine:sitterBefore.pottyRoutine||"",crateSleep:sitterBefore.crateSleep||"",emergencyVet:sitterBefore.emergencyVet||"",instructions:sitterBefore.instructions||""};
    const sitterTextAfter={pottyRoutine:sitterAfter.pottyRoutine||"",crateSleep:sitterAfter.crateSleep||"",emergencyVet:sitterAfter.emergencyVet||"",instructions:sitterAfter.instructions||""};
    if(!core.same(sitterTextBefore,sitterTextAfter))changes.push(sitterAfter.active?"Updated active sitter instructions":"Saved sitter instruction draft");
    Object.entries(TRACKED_ARRAYS).forEach(([field,config])=>{
      const description=describeArrayChange(before?.[field],after?.[field],config);
      if(description)changes.push(description);
    });
    const historyFields=[["treatmentHistory","treatment history"],["careHistory","care history"],["feedingHistory","feeding history"]];
    historyFields.forEach(([field,label])=>{if(!core.same(before?.[field],after?.[field]))changes.push(`Updated ${label}`)});
    if(!changes.length)return null;
    return changes.length===1?changes[0]:changes.slice(0,4).join("; ")+(changes.length>4?` (+${changes.length-4} more)`:"");
  }

  function addActivity(action){
    if(!action)return;
    const entry={
      id:(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)),
      at:new Date().toISOString(),
      actor:userName||"Unknown device",
      action:String(action).slice(0,300)
    };
    state.activityLog=[entry,...(Array.isArray(state.activityLog)?state.activityLog:[])].slice(0,MAX_ACTIVITY);
    Store.save(state);
    renderActivityLog();
  }

  function saveUserName(){
    const input=document.getElementById("cloudCareUserName");
    const name=(input?.value||"").trim();
    if(!name){alert("Enter the name to use for changes from this device.");return}
    userName=name.slice(0,60);
    localStorage.setItem(USER_KEY,userName);
    renderIdentityControls();
    const saved=document.getElementById("cloudCareUserSaved");
    saved?.classList.remove("hidden");
    setTimeout(()=>saved?.classList.add("hidden"),2200);
  }

  function renderIdentityControls(){
    const input=document.getElementById("cloudCareUserName");
    const label=document.getElementById("cloudCareCurrentUser");
    const editor=document.getElementById("cloudCareIdentityEditor");
    const compact=document.getElementById("cloudCareIdentityCompact");
    const compactName=document.getElementById("cloudCareIdentityName");
    if(input&&document.activeElement!==input)input.value=userName;
    if(label)label.textContent=userName?`Changes from this device will be marked as ${userName}.`:"Add your name so family changes show who made them.";
    if(compactName)compactName.textContent=userName||"Not set";
    if(editor)editor.classList.toggle("hidden",Boolean(userName));
    if(compact)compact.classList.toggle("hidden",!userName);
  }

  function editUserName(){
    document.getElementById("cloudCareIdentityEditor")?.classList.remove("hidden");
    document.getElementById("cloudCareIdentityCompact")?.classList.add("hidden");
    const input=document.getElementById("cloudCareUserName");
    if(input){input.value=userName;input.focus();input.select()}
  }

  function renderActivityLog(){
    const list=document.getElementById("cloudCareActivityList");
    const empty=document.getElementById("cloudCareActivityEmpty");
    if(!list)return;
    const entries=Array.isArray(state.activityLog)?state.activityLog.slice(0,30):[];
    list.innerHTML=entries.map(entry=>{
      let when="";
      try{when=new Date(entry.at).toLocaleString()}catch{}
      return `<li><strong>${esc(entry.actor||"Unknown device")}</strong><span>${esc(entry.action||"Updated shared care")}</span><small>${esc(when||entry.at||"")}</small></li>`;
    }).join("");
    if(empty)empty.classList.toggle("hidden",entries.length>0);
  }

  function loadSyncMeta(){
    try{
      const value=JSON.parse(localStorage.getItem(SYNC_KEY)||"null");
      return value&&typeof value==="object"?value:{version:0,base:null,updatedAt:null};
    }catch{return{version:0,base:null,updatedAt:null}}
  }
  function saveSyncMeta(){localStorage.setItem(SYNC_KEY,JSON.stringify(syncMeta))}
  function authHeaders(){return{"Authorization":"Bearer "+connectionCode,"Content-Type":"application/json"}}
  function status(message,tone="neutral"){
    const element=document.getElementById("cloudCareStatus");
    if(!element)return;
    element.textContent=message;
    element.dataset.tone=tone;
  }
  function currentShared(){return core.extract(state)}
  function hasSharedData(data){return Boolean(data.profile||core.ARRAY_FIELDS.some(field=>data[field]?.length)||Object.values(data.sitter||{}).some(Boolean))}

  function applyShared(data){
    const shared=core.normalize(data);
    suppressSync=true;
    try{
      state.profile=shared.profile?{...shared.profile}:null;
      core.ARRAY_FIELDS.forEach(field=>{state[field]=shared[field]});
      state.sitter=shared.sitter;
      Store.save(state);
      initializeUI();
      fillSitterEditor();
      renderSitterView();
      renderSitterBanner();
      renderActivityLog();
      lastCareSnapshot=careSnapshot(shared);
    }finally{suppressSync=false}
  }

  async function request(path,options={}){
    const response=await fetch(ENDPOINT+path,{...options,headers:{...authHeaders(),...(options.headers||{})}});
    let body={};
    try{body=await response.json()}catch{}
    if(!response.ok){const error=new Error(body.error||"The shared care service could not be reached.");error.status=response.status;error.body=body;throw error}
    return body;
  }

  async function fetchRemote(){return request("/v1/care",{method:"GET"})}
  async function saveRemote(data,baseVersion){return request("/v1/care",{method:"PUT",body:JSON.stringify({data,baseVersion})})}

  async function pushLocal(local){
    try{return await saveRemote(local,syncMeta.version||0)}
    catch(error){
      if(error.status!==409||!error.body?.conflict)throw error;
      const remote=core.normalize(error.body.data);
      const merged=core.merge(syncMeta.base,local,remote);
      syncMeta={version:error.body.version||0,base:remote,updatedAt:error.body.updatedAt||null};
      saveSyncMeta();
      return saveRemote(merged,syncMeta.version);
    }
  }

  async function synchronize({forcePull=false}={}){
    if(!connectionCode)return;
    if(syncing){syncAgain=true;return}
    syncing=true;
    syncAgain=false;
    status("Syncing Frannie’s shared record…","working");
    try{
      const local=currentShared();
      const localChanged=syncMeta.base&&!core.same(local,core.normalize(syncMeta.base));
      let result;
      if(localChanged&&!forcePull){
        result=await pushLocal(local);
      }else{
        result=await fetchRemote();
        if(!result.data){
          result=await saveRemote(local,0);
        }else if(!syncMeta.base&&hasSharedData(local)){
          const remote=core.normalize(result.data);
          const firstConnectMerged=hasSharedData(remote)?core.merge({},local,remote):local;
          result=await saveRemote(firstConnectMerged,result.version||0);
        }
      }
      // When this sync was initiated by a local edit, keep that edit authoritative
      // even if the Worker response is based on an older/normalized copy. This
      // prevents optimistic UI changes (focus buttons, profile edits, etc.) from
      // flashing on and then being immediately replaced by stale remote state.
      const responseShared=core.normalize(result.data||local);
      let shared=localChanged&&!forcePull
        ? core.merge(syncMeta.base,local,responseShared)
        : responseShared;
      // Primitive selection arrays are user intent, not server-generated data.
      // If this device changed one during the current save, preserve the exact
      // local array so selecting a second focus cannot erase the first.
      if(localChanged&&!forcePull){
        const base=core.normalize(syncMeta.base);
        core.PRIMITIVE_ARRAY_FIELDS.forEach(field=>{
          if(!core.same(local[field],base[field]))shared[field]=Array.isArray(local[field])?[...local[field]]:[];
        });
      }
      const newestLocal=currentShared();
      const changedDuringSync=!core.same(newestLocal,local);
      syncMeta={version:result.version||0,base:shared,updatedAt:result.updatedAt||null};
      saveSyncMeta();
      if(changedDuringSync){
        const preserved=core.merge(local,newestLocal,shared);
        applyShared(preserved);
        syncAgain=true;
        status("Saving a newer care change…","working");
      }else{
        applyShared(shared);
        status("Frannie’s shared record is up to date"+(result.updatedAt?" · "+new Date(result.updatedAt).toLocaleString():""),"success");
      }
    }catch(error){
      console.warn("Frannie shared-care sync failed",error);
      status(error.status===401?"Connection code not accepted":"Offline — changes are safe on this device and will retry","error");
    }finally{
      syncing=false;
      if(syncAgain){syncAgain=false;queueMicrotask(()=>synchronize())}
    }
  }

  function scheduleSync(){
    if(suppressSync||!connectionCode)return;
    if(syncing){syncAgain=true;return}
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>synchronize(),700);
  }

  function onLocalPersist(){
    const now=careSnapshot();
    if(lastCareSnapshot===null)lastCareSnapshot=now;
    else if(!core.same(now,lastCareSnapshot)){
      const description=describeCareChange(lastCareSnapshot,now);
      lastCareSnapshot=now;
      addActivity(description);
    }
    if(syncing)syncAgain=true;
    scheduleSync();
    renderSitterView();
    renderSitterBanner();
  }

  async function connect(){
    const input=document.getElementById("cloudCareCode");
    const code=input?.value.trim()||"";
    if(!code){alert("Enter the family connection code.");return}
    if(!userName){
      const identity=(document.getElementById("cloudCareUserName")?.value||"").trim();
      if(!identity){alert("Add your name for this device before connecting, so shared-care changes show who made them.");return}
      userName=identity.slice(0,60);localStorage.setItem(USER_KEY,userName);
    }
    connectionCode=code;
    localStorage.setItem(CONNECTION_KEY,code);
    syncMeta={version:0,base:null,updatedAt:null};
    saveSyncMeta();
    renderConnectionControls();
    await synchronize({forcePull:true});
  }

  function disconnect(){
    if(!confirm("Disconnect this device from Frannie’s shared record? The cached information will stay on this device."))return;
    connectionCode="";
    syncMeta={version:0,base:null,updatedAt:null};
    localStorage.removeItem(CONNECTION_KEY);
    localStorage.removeItem(SYNC_KEY);
    renderConnectionControls();
    status("Not connected — care stays on this device only","neutral");
  }

  function renderConnectionControls(){
    const input=document.getElementById("cloudCareCode");
    const connectButton=document.getElementById("cloudCareConnect");
    const syncButton=document.getElementById("cloudCareSync");
    const disconnectButton=document.getElementById("cloudCareDisconnect");
    if(input){input.value="";input.placeholder=connectionCode?"Connected code saved on this device":"Enter family connection code";input.classList.toggle("hidden",Boolean(connectionCode))}
    if(connectButton)connectButton.classList.toggle("hidden",Boolean(connectionCode));
    if(syncButton)syncButton.classList.toggle("hidden",!connectionCode);
    if(disconnectButton)disconnectButton.classList.toggle("hidden",!connectionCode);
  }

  function readSitterEditor(){
    return {
      pottyRoutine:document.getElementById("sitterPotty")?.value.trim()||"",
      crateSleep:document.getElementById("sitterCrate")?.value.trim()||"",
      emergencyVet:document.getElementById("sitterEmergency")?.value.trim()||"",
      instructions:document.getElementById("sitterInstructions")?.value.trim()||""
    };
  }

  function saveSitterInstructions(){
    const current=state.sitter||{};
    state.sitter={...readSitterEditor(),active:Boolean(current.active),activatedAt:current.activatedAt||"",activatedBy:current.activatedBy||""};
    if(persist()){
      renderSitterView();renderSitterBanner();
      const saved=document.getElementById("sitterSaved");saved?.classList.remove("hidden");setTimeout(()=>saved?.classList.add("hidden"),2600);
    }
  }

  function activateSitterInstructions(){
    const draft=readSitterEditor();
    if(!Object.values(draft).some(Boolean)){alert("Add sitter instructions before activating them.");return}
    state.sitter={...draft,active:true,activatedAt:new Date().toISOString(),activatedBy:userName||"Unknown device"};
    if(persist()){fillSitterEditor();renderSitterView();renderSitterBanner();openSitter()}
  }

  function endSitterInstructions(){
    if(!state.sitter?.active)return;
    if(!confirm("End the active sitter instructions? The saved directions will remain available as a draft."))return;
    state.sitter={...state.sitter,active:false};
    if(persist()){renderSitterBanner();renderSitterView()}
  }

  function renderSitterBanner(){
    const banner=document.getElementById("sitterActiveBanner");
    if(!banner)return;
    const active=Boolean(state.sitter?.active);
    banner.classList.toggle("hidden",!active);
    if(active){
      const meta=document.getElementById("sitterActiveMeta");
      let detail="Tap to view current directions";
      if(state.sitter?.activatedBy)detail=`Activated by ${state.sitter.activatedBy}`;
      if(state.sitter?.activatedAt){
        try{detail+=` · ${new Date(state.sitter.activatedAt).toLocaleString()}`}catch{}
      }
      if(meta)meta.textContent=detail;
    }
    const end=document.getElementById("endSitterInstructions");
    if(end)end.classList.toggle("hidden",!active);
    const activate=document.getElementById("activateSitterInstructions");
    if(activate)activate.textContent=active?"Re-activate updated directions":"Activate sitter directions";
  }

  function fillSitterEditor(){
    const sitter=state.sitter||{};
    const values={sitterPotty:sitter.pottyRoutine||"",sitterCrate:sitter.crateSleep||"",sitterEmergency:sitter.emergencyVet||"",sitterInstructions:sitter.instructions||""};
    Object.entries(values).forEach(([id,value])=>{const element=document.getElementById(id);if(element&&document.activeElement!==element)element.value=value});
  }

  function sitterSections(){
    const medications=(state.treatments||[]).filter(item=>item.type==="Medication");
    return [
      {title:"Food & feeding",items:(state.feedingItems||[]).map(item=>[item.category,item.brand,item.amount,item.schedule,item.note].filter(Boolean).join(" · "))},
      {title:"Medications & instructions",items:medications.map(item=>[item.name,item.note,item.date?"Started "+prettyDate(item.date):"",item.due?"Through / due "+prettyDate(item.due):""].filter(Boolean).join(" · "))},
      {title:"Potty / outside routine",items:[state.sitter?.pottyRoutine].filter(Boolean)},
      {title:"Crate / sleep instructions",items:[state.sitter?.crateSleep].filter(Boolean)},
      {title:"Allergies & cautions",items:(state.allergies||[]).map(item=>item.text).filter(Boolean)},
      {title:"Emergency & vet information",items:[state.sitter?.emergencyVet].filter(Boolean)},
      {title:"Sitter-specific instructions",items:[state.sitter?.instructions].filter(Boolean)}
    ];
  }

  function sitterHtml({checklist=false,print=false}={}){
    return sitterSections().map(section=>{
      const hasItems=section.items.length>0;
      const items=hasItems?section.items:["Not added yet"];
      const list=items.map(item=>`<li>${checklist&&hasItems?(print?"□ ":'<input type="checkbox" aria-label="Mark complete"> '):""}${esc(item)}</li>`).join("");
      return `<section class="sitter-view-section"><h3>${esc(section.title)}</h3><ul>${list}</ul></section>`;
    }).join("");
  }

  function renderSitterView(){
    const content=document.getElementById("sitterViewContent");
    if(!content)return;
    const checklist=document.getElementById("sitterChecklistToggle")?.checked||false;
    content.innerHTML=sitterHtml({checklist});
  }

  function openSitter(){renderSitterView();document.getElementById("sitterModal")?.classList.add("open")}
  function closeSitter(){document.getElementById("sitterModal")?.classList.remove("open")}

  async function shareSitter(){
    const lines=["Frannie’s Sitter",...sitterSections().flatMap(section=>["",section.title,...section.items.map(item=>"- "+item)])];
    const text=lines.join("\n");
    if(navigator.share){try{await navigator.share({title:"Frannie’s Sitter",text});return}catch(error){if(error.name==="AbortError")return}}
    try{await navigator.clipboard.writeText(text);alert("Frannie’s sitter information was copied.")}catch{alert("Sharing is not available on this device. Use Print / PDF instead.")}
  }

  function printSitter(){
    const checklist=document.getElementById("sitterChecklistToggle")?.checked||false;
    const report=document.getElementById("printReport");
    report.innerHTML=`<section class="print-card"><h1>Frannie’s Sitter</h1><p class="print-profile">Current caretaker reference</p>${sitterHtml({checklist,print:true})}</section>`;
    document.documentElement.dataset.printMode="letter";
    const cleanup=()=>{delete document.documentElement.dataset.printMode;window.removeEventListener("afterprint",cleanup)};
    window.addEventListener("afterprint",cleanup);void report.offsetHeight;window.print();
  }

  function buildUI(){
    const careCard=document.querySelector("#care > .card");
    const careGrid=careCard?.querySelector(".care-grid");
    if(!careCard||!careGrid||document.getElementById("cloudCarePanel"))return;

    const home=document.getElementById("home");
    if(home&&!document.getElementById("sitterActiveBanner")){
      const banner=document.createElement("button");
      banner.id="sitterActiveBanner";banner.type="button";banner.className="sitter-active-banner hidden";
      banner.innerHTML=`<span class="sitter-paw" aria-hidden="true">🐾</span><span><strong>SITTER INSTRUCTIONS READY</strong><small id="sitterActiveMeta">Tap to view current directions</small></span><span class="sitter-paw" aria-hidden="true">🐾</span>`;
      banner.addEventListener("click",openSitter);
      home.prepend(banner);
    }

    const intro=careCard.querySelector(":scope > p");
    const cloud=document.createElement("div");
    cloud.id="cloudCarePanel";cloud.className="care-cloud-panel";
    cloud.innerHTML=`<div class="care-cloud-main"><div><h3>Shared Frannie record</h3><p id="cloudCareStatus" data-tone="neutral">${connectionCode?"Connecting to shared care…":"Not connected — care stays on this device only"}</p></div><div class="care-cloud-actions"><input id="cloudCareCode" type="password" autocomplete="off" autocapitalize="none" aria-label="Family connection code" placeholder="Enter family connection code"><button id="cloudCareConnect" class="primary" type="button">Connect</button><button id="cloudCareSync" class="secondary hidden" type="button">Sync now</button><button id="cloudCareDisconnect" class="secondary hidden" type="button">Disconnect</button></div></div><div class="care-cloud-identity"><div id="cloudCareIdentityCompact" class="care-cloud-identity-compact hidden"><span>Using this device as <strong id="cloudCareIdentityName"></strong></span><button id="cloudCareChangeUser" class="secondary compact-button" type="button">Change</button></div><div id="cloudCareIdentityEditor"><label for="cloudCareUserName">Who is using this device?</label><div class="care-cloud-identity-row"><input id="cloudCareUserName" type="text" maxlength="60" autocomplete="name" placeholder="Mollie, Brett, Michelle, Bill…"><button id="cloudCareSaveUser" class="secondary" type="button">Save name</button></div><p id="cloudCareCurrentUser"></p><div id="cloudCareUserSaved" class="save-confirm hidden">✓ Name saved on this device.</div></div></div><details class="care-activity"><summary>Recent shared changes <span class="activity-hint">who changed what</span></summary><p id="cloudCareActivityEmpty" class="care-activity-empty">No shared changes have been recorded yet.</p><ol id="cloudCareActivityList"></ol></details>`;
    intro?.after(cloud);

    const editor=document.createElement("div");
    editor.className="care-section full";editor.id="sitterEditor";
    editor.innerHTML=`<h3>Frannie’s Sitter</h3><p>Save directions as a shared draft while planning. When it is time for the sitter, activate them so everyone sees the Sitter Instructions Ready banner.</p><div class="row-2"><div><label>Potty / outside routine</label><textarea id="sitterPotty" placeholder="When to go out, door or yard routine"></textarea></div><div><label>Crate / sleep instructions</label><textarea id="sitterCrate" placeholder="Crate, bedtime, settling, and sleep routine"></textarea></div></div><div class="row-2" style="margin-top:9px"><div><label>Emergency / vet information</label><textarea id="sitterEmergency" placeholder="Vet, emergency contact, clinic, phone"></textarea></div><div><label>Sitter-specific instructions</label><textarea id="sitterInstructions" placeholder="Anything this caretaker should know"></textarea></div></div><div class="actions"><button class="secondary" id="saveSitterInstructions" type="button">Save draft</button><button class="primary" id="activateSitterInstructions" type="button">Activate sitter directions</button><button class="secondary hidden" id="endSitterInstructions" type="button">End sitter directions</button><button class="secondary" id="openSitterView" type="button">Open caretaker view</button></div><div id="sitterSaved" class="save-confirm hidden">✓ Sitter instruction draft saved.</div>`;
    const timeline=Array.from(careGrid.children).find(item=>item.querySelector("h3")?.textContent.includes("Frannie timeline"));
    careGrid.insertBefore(editor,timeline||null);

    const modal=document.createElement("div");
    modal.className="modal sitter-modal";modal.id="sitterModal";
    modal.innerHTML=`<div class="modal-box sitter-modal-box"><div class="modal-head"><strong>Frannie’s Sitter</strong><button id="closeSitterView" type="button">Close ✕</button></div><div class="sitter-modal-body"><label class="sitter-checklist"><input id="sitterChecklistToggle" type="checkbox"> Add a temporary caretaker checklist</label><div id="sitterViewContent"></div><div class="actions"><button class="primary" id="shareSitterView" type="button">Share</button><button class="secondary" id="printSitterView" type="button">Print / PDF</button></div></div></div>`;
    document.body.appendChild(modal);

    document.getElementById("cloudCareConnect").addEventListener("click",connect);
    document.getElementById("cloudCareSaveUser").addEventListener("click",saveUserName);
    document.getElementById("cloudCareChangeUser").addEventListener("click",editUserName);
    document.getElementById("cloudCareUserName").addEventListener("keydown",event=>{if(event.key==="Enter")saveUserName()});
    document.getElementById("cloudCareSync").addEventListener("click",()=>synchronize());
    document.getElementById("cloudCareDisconnect").addEventListener("click",disconnect);
    document.getElementById("saveSitterInstructions").addEventListener("click",saveSitterInstructions);
    document.getElementById("activateSitterInstructions").addEventListener("click",activateSitterInstructions);
    document.getElementById("endSitterInstructions").addEventListener("click",endSitterInstructions);
    document.getElementById("openSitterView").addEventListener("click",openSitter);
    document.getElementById("closeSitterView").addEventListener("click",closeSitter);
    document.getElementById("sitterChecklistToggle").addEventListener("change",renderSitterView);
    document.getElementById("shareSitterView").addEventListener("click",shareSitter);
    document.getElementById("printSitterView").addEventListener("click",printSitter);
    modal.addEventListener("click",event=>{if(event.target===modal)closeSitter()});
    renderConnectionControls();renderIdentityControls();fillSitterEditor();renderSitterView();renderSitterBanner();renderActivityLog();
    lastCareSnapshot=careSnapshot();
    if(connectionCode)synchronize();
  }

  globalThis.FrannieCloudSync={onLocalPersist,synchronize};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",buildUI,{once:true});else buildUI();
  window.addEventListener("focus",()=>{if(connectionCode)synchronize()});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&connectionCode)synchronize()});
})();
