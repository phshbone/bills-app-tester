(function(){
  "use strict";

  const ENDPOINT="https://frannie-care.phshbone.workers.dev";
  const CONNECTION_KEY="frannieCareConnectionV1";
  const SYNC_KEY="frannieCareSyncV1";
  const core=globalThis.FrannieCareCore;
  let connectionCode=localStorage.getItem(CONNECTION_KEY)||"";
  let syncMeta=loadSyncMeta();
  let syncTimer=null;
  let syncing=false;
  let syncAgain=false;
  let suppressSync=false;

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
      const localGoal=state.profile?.goal||"";
      state.profile=shared.profile?{...state.profile,...shared.profile,goal:localGoal}:(localGoal?{name:"Frannie",age:"",size:"Medium",goal:localGoal}:null);
      core.ARRAY_FIELDS.forEach(field=>{state[field]=shared[field]});
      state.sitter=shared.sitter;
      Store.save(state);
      initializeUI();
      fillSitterEditor();
      renderSitterView();
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
    status("Syncing shared care…","working");
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
        }else if(!syncMeta.base&&hasSharedData(local)&&!hasSharedData(result.data)){
          result=await saveRemote(local,result.version||0);
        }
      }
      const shared=core.normalize(result.data||local);
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
        status("Shared care is up to date"+(result.updatedAt?" · "+new Date(result.updatedAt).toLocaleString():""),"success");
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
    if(syncing)syncAgain=true;
    scheduleSync();
    renderSitterView();
  }

  async function connect(){
    const input=document.getElementById("cloudCareCode");
    const code=input?.value.trim()||"";
    if(!code){alert("Enter the family connection code.");return}
    connectionCode=code;
    localStorage.setItem(CONNECTION_KEY,code);
    syncMeta={version:0,base:null,updatedAt:null};
    saveSyncMeta();
    renderConnectionControls();
    await synchronize({forcePull:true});
  }

  function disconnect(){
    if(!confirm("Disconnect this device from Frannie’s shared care? The cached information will stay on this device."))return;
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

  function saveSitterInstructions(){
    state.sitter={
      pottyRoutine:document.getElementById("sitterPotty")?.value.trim()||"",
      crateSleep:document.getElementById("sitterCrate")?.value.trim()||"",
      emergencyVet:document.getElementById("sitterEmergency")?.value.trim()||"",
      instructions:document.getElementById("sitterInstructions")?.value.trim()||""
    };
    if(persist()){
      renderSitterView();
      const saved=document.getElementById("sitterSaved");saved?.classList.remove("hidden");setTimeout(()=>saved?.classList.add("hidden"),2600);
    }
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

    const intro=careCard.querySelector(":scope > p");
    const cloud=document.createElement("div");
    cloud.id="cloudCarePanel";cloud.className="care-cloud-panel";
    cloud.innerHTML=`<div><h3>Shared family care</h3><p id="cloudCareStatus" data-tone="neutral">${connectionCode?"Connecting to shared care…":"Not connected — care stays on this device only"}</p></div><div class="care-cloud-actions"><input id="cloudCareCode" type="password" autocomplete="off" autocapitalize="none" aria-label="Family connection code" placeholder="Enter family connection code"><button id="cloudCareConnect" class="primary" type="button">Connect</button><button id="cloudCareSync" class="secondary hidden" type="button">Sync now</button><button id="cloudCareDisconnect" class="secondary hidden" type="button">Disconnect</button></div>`;
    intro?.after(cloud);

    const editor=document.createElement("div");
    editor.className="care-section full";editor.id="sitterEditor";
    editor.innerHTML=`<h3>Frannie’s Sitter</h3><p>These instructions combine with the current food, medication, and caution lists to make a simple caretaker view.</p><div class="row-2"><div><label>Potty / outside routine</label><textarea id="sitterPotty" placeholder="When to go out, door or yard routine"></textarea></div><div><label>Crate / sleep instructions</label><textarea id="sitterCrate" placeholder="Crate, bedtime, settling, and sleep routine"></textarea></div></div><div class="row-2" style="margin-top:9px"><div><label>Emergency / vet information</label><textarea id="sitterEmergency" placeholder="Vet, emergency contact, clinic, phone"></textarea></div><div><label>Sitter-specific instructions</label><textarea id="sitterInstructions" placeholder="Anything this caretaker should know"></textarea></div></div><div class="actions"><button class="primary" id="saveSitterInstructions" type="button">Save sitter instructions</button><button class="secondary" id="openSitterView" type="button">Open caretaker view</button></div><div id="sitterSaved" class="save-confirm hidden">✓ Sitter instructions saved.</div>`;
    const timeline=Array.from(careGrid.children).find(item=>item.querySelector("h3")?.textContent.includes("Frannie timeline"));
    careGrid.insertBefore(editor,timeline||null);

    const modal=document.createElement("div");
    modal.className="modal sitter-modal";modal.id="sitterModal";
    modal.innerHTML=`<div class="modal-box sitter-modal-box"><div class="modal-head"><strong>Frannie’s Sitter</strong><button id="closeSitterView" type="button">Close ✕</button></div><div class="sitter-modal-body"><label class="sitter-checklist"><input id="sitterChecklistToggle" type="checkbox"> Add a temporary caretaker checklist</label><div id="sitterViewContent"></div><div class="actions"><button class="primary" id="shareSitterView" type="button">Share</button><button class="secondary" id="printSitterView" type="button">Print / PDF</button></div></div></div>`;
    document.body.appendChild(modal);

    document.getElementById("cloudCareConnect").addEventListener("click",connect);
    document.getElementById("cloudCareSync").addEventListener("click",()=>synchronize());
    document.getElementById("cloudCareDisconnect").addEventListener("click",disconnect);
    document.getElementById("saveSitterInstructions").addEventListener("click",saveSitterInstructions);
    document.getElementById("openSitterView").addEventListener("click",openSitter);
    document.getElementById("closeSitterView").addEventListener("click",closeSitter);
    document.getElementById("sitterChecklistToggle").addEventListener("change",renderSitterView);
    document.getElementById("shareSitterView").addEventListener("click",shareSitter);
    document.getElementById("printSitterView").addEventListener("click",printSitter);
    modal.addEventListener("click",event=>{if(event.target===modal)closeSitter()});
    renderConnectionControls();fillSitterEditor();renderSitterView();
    if(connectionCode)synchronize();
  }

  globalThis.FrannieCloudSync={onLocalPersist,synchronize};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",buildUI,{once:true});else buildUI();
  window.addEventListener("focus",()=>{if(connectionCode)synchronize()});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&connectionCode)synchronize()});
})();
