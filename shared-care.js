(function(){
  "use strict";

  const ENDPOINT="https://frannie-care.phshbone.workers.dev";
  const CONNECTION_KEY="frannieCareConnectionV1";
  const DEVICE_KEY="frannieCareDeviceV1";
  const LOCAL_DEVICE_KEY="frannieCareLocalDeviceIdV1";
  const INVITE_KEY="franniePendingInviteV1";
  const SYNC_KEY="frannieCareSyncV1";
  const USER_KEY="frannieCareUserNameV1";
  const MAX_ACTIVITY=100;
  const BUILD_ID="SITTER-REWRITE-v1 · isolated cache v2";
  const CONNECTION_COOKIE="frannieFamilyConnectionV1";
  const USER_COOKIE="frannieFamilyUserV1";
  const INVITE_COOKIE="franniePendingInviteV1";
  const core=globalThis.FrannieCareCore;

  function readCookie(name){
    const prefix=encodeURIComponent(name)+"=";
    const part=document.cookie.split("; ").find(value=>value.startsWith(prefix));
    return part?decodeURIComponent(part.slice(prefix.length)):"";
  }
  function writeCookie(name,value){
    if(!value)return;
    document.cookie=`${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
  }
  function clearCookie(name){
    document.cookie=`${encodeURIComponent(name)}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
  }

  function isStandaloneApp(){
    return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone===true);
  }

  function inviteFromUrl(){
    try{
      const url=new URL(location.href);
      return (url.searchParams.get("invite")||"").trim();
    }catch{return ""}
  }

  const urlInvite=inviteFromUrl();
  if(urlInvite){
    // This is a temporary, single-use exchange token, never the family or
    // device credential. The cookie bridges Safari -> installed iOS PWA.
    localStorage.setItem(INVITE_KEY,urlInvite);
    writeCookie(INVITE_COOKIE,urlInvite);
  }

  let connectionCode=localStorage.getItem(CONNECTION_KEY)||readCookie(CONNECTION_COOKIE)||"";
  if(connectionCode)localStorage.setItem(CONNECTION_KEY,connectionCode);
  let syncMeta=loadSyncMeta();
  let userName=(localStorage.getItem(USER_KEY)||readCookie(USER_COOKIE)||"").trim();
  if(userName)localStorage.setItem(USER_KEY,userName);
  let pendingInvite=(urlInvite||localStorage.getItem(INVITE_KEY)||readCookie(INVITE_COOKIE)||"").trim();
  let deviceInfo=loadDeviceInfo();
  let localDeviceId=localStorage.getItem(LOCAL_DEVICE_KEY)||"";
  if(!localDeviceId){localDeviceId=(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));localStorage.setItem(LOCAL_DEVICE_KEY,localDeviceId)}
  let needsIdentitySetup=Boolean((connectionCode&&!userName)||(!connectionCode&&pendingInvite));
  let syncTimer=null;
  let syncing=false;
  let syncAgain=false;
  let suppressSync=false;
  let lastCareSnapshot=null;
  let focusSelectionIntent=null;
  let sitterMode=null;

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
      deviceId:deviceInfo?.id||localDeviceId,
      action:String(action).slice(0,300)
    };
    state.activityLog=[entry,...(Array.isArray(state.activityLog)?state.activityLog:[])].slice(0,MAX_ACTIVITY);
    Store.save(state);
    renderActivityLog();
    if(syncing)syncAgain=true;
    else scheduleSync();
    return entry;
  }

  function saveUserName(){
    if(state.sitter?.active&&sitterMode?.isOwner?.()){
      alert("End your active Sitter Mode session before changing your name on this device.");
      return;
    }
    const input=document.getElementById("cloudCareUserName");
    const name=(input?.value||"").trim();
    if(!name){alert("Enter the name to use for changes from this device.");return}
    userName=name.slice(0,60);
    localStorage.setItem(USER_KEY,userName);writeCookie(USER_COOKIE,userName);
    renderIdentityControls();
    renderSitterBanner();
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
    const badge=document.getElementById("cloudCareUserBadge");
    if(badge){badge.textContent=userName||"";badge.classList.toggle("hidden",!connectionCode||!userName)}
    if(editor)editor.classList.toggle("hidden",Boolean(userName));
    if(compact)compact.classList.toggle("hidden",!userName);
  }

  function editUserName(){
    if(state.sitter?.active&&sitterMode?.isOwner?.()){
      alert("End your active Sitter Mode session before changing your name on this device.");
      return;
    }
    document.getElementById("cloudCareIdentityEditor")?.classList.remove("hidden");
    document.getElementById("cloudCareIdentityCompact")?.classList.add("hidden");
    const input=document.getElementById("cloudCareUserName");
    if(input){input.value=userName;input.focus();input.select()}
  }

  function formatActivityTime(value){
    try{
      const date=new Date(value);
      if(Number.isNaN(date.getTime()))return String(value||"");
      const day=new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric"}).format(date);
      const time=new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(date);
      return `${day} · ${time}`;
    }catch{return String(value||"")}
  }

  function renderActivityLog(){
    const list=document.getElementById("cloudCareActivityList");
    const empty=document.getElementById("cloudCareActivityEmpty");
    if(!list)return;
    const entries=Array.isArray(state.activityLog)?state.activityLog.slice(0,30):[];
    list.innerHTML=entries.map(entry=>{
      const when=formatActivityTime(entry.at);
      return `<li><div class="activity-entry-head"><strong>${esc(entry.actor||"Unknown device")}</strong><time datetime="${esc(entry.at||"")}">${esc(when)}</time></div><span>${esc(entry.action||"Updated shared care")}</span></li>`;
    }).join("");
    if(empty)empty.classList.toggle("hidden",entries.length>0);
  }

  function loadSyncMeta(){
    try{
      const value=JSON.parse(localStorage.getItem(SYNC_KEY)||"null");
      return value&&typeof value==="object"?value:{version:0,base:null,updatedAt:null};
    }catch{return{version:0,base:null,updatedAt:null}}
  }
  function loadDeviceInfo(){
    try{
      const value=JSON.parse(localStorage.getItem(DEVICE_KEY)||"null");
      return value&&typeof value==="object"?value:null;
    }catch{return null}
  }
  function saveDeviceCredential(result){
    if(!result?.credential||!result?.device?.id)throw new Error("The pairing service returned an incomplete device credential.");
    connectionCode=result.credential;
    deviceInfo={id:String(result.device.id),displayName:String(result.device.displayName||userName||"")};
    localStorage.setItem(CONNECTION_KEY,connectionCode);
    localStorage.setItem(DEVICE_KEY,JSON.stringify(deviceInfo));
    // Remove legacy cookies. Device credentials stay in this installed app's
    // local storage and are never put into a URL or public source file.
    clearCookie(CONNECTION_COOKIE);
  }
  function clearPendingInvite(){
    pendingInvite="";
    localStorage.removeItem(INVITE_KEY);
    clearCookie(INVITE_COOKIE);
    try{
      const url=new URL(location.href);
      url.searchParams.delete("invite");
      history.replaceState(null,"",url.pathname+url.search+url.hash);
    }catch{}
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
    if(sitterMode)shared.sitter=sitterMode.resolveRemote(shared.sitter).sitter;
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
    const authenticated=options.auth!==false;
    const cleanOptions={...options};delete cleanOptions.auth;
    const response=await fetch(ENDPOINT+path,{...cleanOptions,headers:{...(authenticated?authHeaders():{"Content-Type":"application/json"}),...(options.headers||{})}});
    let body={};
    try{body=await response.json()}catch{}
    if(!response.ok){const error=new Error(body.error||"The shared care service could not be reached.");error.status=response.status;error.body=body;throw error}
    return body;
  }

  async function fetchRemote(){return request("/v1/care",{method:"GET"})}
  async function saveRemote(data,baseVersion){return request("/v1/care",{method:"PUT",body:JSON.stringify({data,baseVersion})})}

  async function pairDevice(name){
    const result=await request("/v1/pair",{auth:false,method:"POST",body:JSON.stringify({inviteToken:pendingInvite,displayName:name})});
    userName=String(result.device?.displayName||name).slice(0,60);
    localStorage.setItem(USER_KEY,userName);writeCookie(USER_COOKIE,userName);
    saveDeviceCredential(result);
    clearPendingInvite();
    syncMeta={version:0,base:null,updatedAt:null};saveSyncMeta();
    needsIdentitySetup=false;
    return result;
  }

  async function maybeMigrateLegacyCredential(){
    if(!connectionCode||connectionCode.startsWith("fd_")||deviceInfo?.id)return;
    try{
      const result=await request("/v1/devices/migrate",{method:"POST",body:JSON.stringify({displayName:userName||"Family device"})});
      saveDeviceCredential(result);
    }catch(error){
      // A frontend-first rollout must continue to work with the old Worker.
      if(error.status!==404)console.warn("Legacy device credential migration is not available yet",error);
    }
  }

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
      await maybeMigrateLegacyCredential();
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

      let serverState=core.normalize(result.data||local);
      let shared=localChanged&&!forcePull
        ? core.merge(syncMeta.base,local,serverState)
        : serverState;

      if(localChanged&&!forcePull){
        const base=core.normalize(syncMeta.base);
        core.PRIMITIVE_ARRAY_FIELDS.forEach(field=>{
          if(!core.same(local[field],base[field]))shared[field]=Array.isArray(local[field])?[...local[field]]:[];
        });
      }
      if(focusSelectionIntent!==null)shared.selected=[...focusSelectionIntent];

      // Sitter Mode has one state owner and one durable mutation id. A local
      // Activate / Update / End command stays authoritative until the Worker
      // returns that exact mutation id. No modal/view event can change it.
      if(sitterMode){
        const sitterResolution=sitterMode.resolveRemote(serverState.sitter);
        shared.sitter=sitterResolution.sitter;
        const focusNeedsWrite=focusSelectionIntent!==null&&!core.same(serverState.selected||[],focusSelectionIntent);
        if(sitterResolution.mustWrite||focusNeedsWrite){
          result=await saveRemote(shared,result.version||0);
          serverState=core.normalize(result.data||shared);
          sitterMode.acknowledge(serverState.sitter);
          shared=serverState;
        }
      }else if(focusSelectionIntent!==null&&!core.same(serverState.selected||[],focusSelectionIntent)){
        result=await saveRemote(shared,result.version||0);
        serverState=core.normalize(result.data||shared);
        shared=serverState;
      }

      const newestLocal=currentShared();
      const changedDuringSync=!core.same(newestLocal,local);
      syncMeta={version:result.version||0,base:serverState,updatedAt:result.updatedAt||null};
      saveSyncMeta();

      if(changedDuringSync){
        const preserved=core.merge(local,newestLocal,serverState);
        if(focusSelectionIntent!==null)preserved.selected=[...focusSelectionIntent];
        if(sitterMode)preserved.sitter=sitterMode.resolveRemote(serverState.sitter).sitter;
        applyShared(preserved);
        syncAgain=true;
        status("Saving a newer care change…","working");
      }else{
        const applied=core.normalize(shared);
        if(sitterMode)applied.sitter=sitterMode.resolveRemote(serverState.sitter).sitter;
        applyShared(applied);
        status("Frannie’s shared record is up to date"+(result.updatedAt?" · "+new Date(result.updatedAt).toLocaleString():""),"success");
      }

      if(focusSelectionIntent!==null){
        const remoteSelected=serverState.selected||[];
        if(core.same(remoteSelected,focusSelectionIntent))focusSelectionIntent=null;
        else syncAgain=true;
      }
      if(sitterMode?.hasPending?.())syncAgain=true;
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

  let pendingExplicitActivity=null;
  function setNextActivity(action){pendingExplicitActivity=String(action||"").trim()||null}
  function setFocusIntent(values){
    focusSelectionIntent=Array.isArray(values)?[...values]:[];
  }

  function onLocalPersist(){
    const now=careSnapshot();
    if(pendingExplicitActivity){
      const action=pendingExplicitActivity;
      pendingExplicitActivity=null;
      lastCareSnapshot=now;
      addActivity(action);
    }else if(lastCareSnapshot===null){
      lastCareSnapshot=now;
    }else if(!core.same(now,lastCareSnapshot)){
      const description=describeCareChange(lastCareSnapshot,now);
      lastCareSnapshot=now;
      addActivity(description);
    }
    if(syncing)syncAgain=true;
    scheduleSync();
    renderSitterView();
    renderSitterBanner();
  }

  async function connect(suppliedCode=""){
    const code=(suppliedCode||connectionCode||"").trim();
    if(!code){alert("Open the Frannie family setup link on this device first.");return}
    if(!userName){
      const identity=(document.getElementById("cloudCareUserName")?.value||"").trim();
      if(!identity){alert("Add your name or initials before connecting.");return}
      userName=identity.slice(0,60);localStorage.setItem(USER_KEY,userName);
    }
    connectionCode=code;
    localStorage.setItem(CONNECTION_KEY,code);writeCookie(CONNECTION_COOKIE,code);writeCookie(USER_COOKIE,userName);
    syncMeta={version:0,base:null,updatedAt:null};
    saveSyncMeta();
    needsIdentitySetup=false;
    renderConnectionControls();
    renderIdentityControls();
    await synchronize({forcePull:true});
  }

  async function disconnect(){
    if(!confirm("Disconnect and revoke this device from Frannie’s shared record? The cached information will stay on this device."))return;
    if(connectionCode.startsWith("fd_")){
      try{await request("/v1/devices/current",{method:"DELETE"})}
      catch(error){alert("This device could not be revoked. Check the connection and try again.");return}
    }
    connectionCode="";
    deviceInfo=null;
    syncMeta={version:0,base:null,updatedAt:null};
    localStorage.removeItem(CONNECTION_KEY);localStorage.removeItem(DEVICE_KEY);localStorage.removeItem(USER_KEY);clearCookie(CONNECTION_COOKIE);clearCookie(USER_COOKIE);
    localStorage.removeItem(SYNC_KEY);
    renderConnectionControls();
    status("Not connected — care stays on this device only","neutral");
  }

  async function shareSetupLink(){
    if(!connectionCode){alert("This device is not connected to Frannie yet.");return}
    let invite;
    try{invite=await request("/v1/invites",{method:"POST",body:JSON.stringify({expiresInMinutes:60})})}
    catch(error){alert("A one-time invite could not be created. Check the shared connection and try again.");return}
    const url=new URL(location.href);
    url.search="";
    url.hash="";
    url.searchParams.set("invite",invite.inviteToken);
    const text=url.toString();
    if(navigator.share){
      try{
        await navigator.share({title:"Connect to Frannie",text:"Open this once on the device you want to connect to Frannie.",url:text});
        return;
      }catch(error){if(error?.name==="AbortError")return}
    }
    try{await navigator.clipboard.writeText(text);alert("Frannie’s one-time invite was copied. It expires in one hour and stops working after one device pairs.")}
    catch{prompt("Copy this Frannie setup link:",text)}
  }

  async function shareRecoveryLink(){
    if(!connectionCode){alert("This device is not connected to Frannie yet.");return}
    if(!confirm("Create a reusable Family Recovery Link? Any previous recovery link will stop working. Keep the new link private; it can reconnect a deleted or reinstalled Frannie app."))return;
    let recovery;
    try{recovery=await request("/v1/recovery-links",{method:"POST",body:"{}"})}
    catch(error){alert("A Family Recovery Link could not be created. Check the shared connection and try again.");return}
    const url=new URL(location.href);
    url.search="";url.hash="";url.searchParams.set("invite",recovery.recoveryToken);
    const text=url.toString();
    if(navigator.share){
      try{await navigator.share({title:"Frannie Family Recovery Link",text:"Keep this private. Use it to reconnect your own Frannie app after reinstalling.",url:text});return}
      catch(error){if(error?.name==="AbortError")return}
    }
    try{await navigator.clipboard.writeText(text);alert("The reusable Family Recovery Link was copied. Save it somewhere private. It keeps working until you replace it.")}
    catch{prompt("Copy and privately save this reusable Family Recovery Link:",text)}
  }

  function renderConnectionControls(){
    const connectButton=document.getElementById("cloudCareConnect");
    const syncButton=document.getElementById("cloudCareSync");
    const disconnectButton=document.getElementById("cloudCareDisconnect");
    const setupButton=document.getElementById("cloudCareShareSetup");
    const recoveryButton=document.getElementById("cloudCareRecoveryLink");
    const badge=document.getElementById("cloudCareUserBadge");
    if(connectButton)connectButton.classList.toggle("hidden",Boolean(connectionCode));
    if(syncButton)syncButton.classList.toggle("hidden",!connectionCode);
    if(disconnectButton)disconnectButton.classList.toggle("hidden",!connectionCode);
    if(setupButton)setupButton.classList.toggle("hidden",!connectionCode);
    if(recoveryButton)recoveryButton.classList.toggle("hidden",!connectionCode);
    if(badge){
      badge.textContent=userName||"";
      badge.classList.toggle("hidden",!connectionCode||!userName);
    }
  }

  function readSitterEditor(){
    return {
      pottyRoutine:document.getElementById("sitterPotty")?.value.trim()||"",
      crateSleep:document.getElementById("sitterCrate")?.value.trim()||"",
      emergencyVet:document.getElementById("sitterEmergency")?.value.trim()||"",
      instructions:document.getElementById("sitterInstructions")?.value.trim()||""
    };
  }

  function fillSitterEditor(sitter=state.sitter||{}){
    const values={sitterPotty:sitter.pottyRoutine||"",sitterCrate:sitter.crateSleep||"",sitterEmergency:sitter.emergencyVet||"",sitterInstructions:sitter.instructions||""};
    Object.entries(values).forEach(([id,value])=>{const element=document.getElementById(id);if(element&&document.activeElement!==element)element.value=value});
  }

  function sitterSections(){
    const currentFood=(state.feedingItems||[]).filter(item=>item.active===true);
    const currentMedication=(state.treatments||[]).filter(item=>item.type==="Medication"&&item.active===true);
    const currentCautions=(state.allergies||[]);
    return [
      {title:"Food & feeding",items:currentFood.map(item=>[item.category,item.brand,item.amount,item.schedule,item.note].filter(Boolean).join(" · "))},
      {title:"Medications & instructions",items:currentMedication.map(item=>[item.name,item.note,item.date?"Started "+prettyDate(item.date):"",item.due?"Through / due "+prettyDate(item.due):""].filter(Boolean).join(" · "))},
      {title:"Potty / outside routine",items:[state.sitter?.pottyRoutine].filter(Boolean)},
      {title:"Crate / sleep instructions",items:[state.sitter?.crateSleep].filter(Boolean)},
      {title:"Allergies & cautions",items:currentCautions.map(item=>item.text).filter(Boolean)},
      {title:"Emergency & vet information",items:[state.sitter?.emergencyVet].filter(Boolean)},
      {title:"Sitter-specific instructions",items:[state.sitter?.instructions].filter(Boolean)}
    ];
  }

  function splashDismissed(){
    const splash=document.getElementById("splashScreen");
    return !splash||splash.classList.contains("hide")||splash.getAttribute("aria-hidden")==="true";
  }

  function renderSitterView(){sitterMode?.renderAll?.()}
  function renderSitterBanner(){sitterMode?.renderAll?.()}
  function openSitter(){sitterMode?.openView?.()}
  function closeSitter(){sitterMode?.closeView?.()}

  // Generic cleanup for the remaining connection dialog. Sitter Mode itself
  // no longer uses a modal or backdrop.
  function releaseModalState(){document.activeElement?.blur?.()}

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
    cloud.innerHTML=`<div class="care-cloud-main"><div class="care-cloud-heading"><div><h3>Shared Frannie record</h3><p id="cloudCareStatus" data-tone="neutral">${connectionCode?"Connecting to shared care…":"Not connected — open a Frannie invitation or recovery link"}</p></div><span id="cloudCareUserBadge" class="care-user-badge ${userName?"":"hidden"}">${esc(userName||"")}</span></div></div><details id="cloudCareDetails" class="care-connection-details"><summary>Manage connection & activity</summary><div class="care-cloud-actions"><button id="cloudCareConnect" class="primary" type="button">Enter Frannie</button><button id="cloudCareSync" class="secondary hidden" type="button">Reconnect / Sync</button><button id="cloudCareShareSetup" class="secondary hidden" type="button">Share one-time invite</button><button id="cloudCareRecoveryLink" class="secondary hidden" type="button">Create / replace recovery link</button><button id="cloudCareDisconnect" class="secondary hidden" type="button">Disconnect this device</button></div><p class="care-recovery-note">A private Family Recovery Link can reconnect your own app after it is deleted or reinstalled. Save it outside the app. It works repeatedly until you replace it.</p><div class="build-stamp">Build ${BUILD_ID}</div><div class="care-cloud-identity"><div id="cloudCareIdentityCompact" class="care-cloud-identity-compact hidden"><span>Using this device as <strong id="cloudCareIdentityName"></strong></span><button id="cloudCareChangeUser" class="secondary compact-button" type="button">Change</button></div><div id="cloudCareIdentityEditor"><label for="cloudCareUserName">Who is using this device?</label><div class="care-cloud-identity-row"><input id="cloudCareUserName" type="text" maxlength="60" autocapitalize="words" placeholder="Mollie, Brett, Michelle, UB…"><button id="cloudCareSaveUser" class="secondary" type="button">Save name</button></div><p id="cloudCareCurrentUser"></p><div id="cloudCareUserSaved" class="save-confirm hidden">✓ Name saved on this device.</div></div></div><details class="care-activity"><summary>Recent shared changes <span class="activity-hint">who changed what + when</span></summary><p id="cloudCareActivityEmpty" class="care-activity-empty">No shared changes have been recorded yet.</p><ol id="cloudCareActivityList"></ol></details></details>`;
    intro?.after(cloud);

    const jumpNav=document.createElement("nav");
    jumpNav.className="care-jump-nav";
    jumpNav.setAttribute("aria-label","Jump to Frannie care section");
    jumpNav.innerHTML=`
      <button type="button" data-care-jump="care-treatments">Treatments</button>
      <button type="button" data-care-jump="care-feeding">Food</button>
      <button type="button" data-care-jump="care-cautions">Cautions</button>
      <button type="button" data-care-jump="care-measurements">Measurements</button>
      <button type="button" data-care-jump="care-notes">Notes</button>
      <button type="button" data-care-jump="sitterEditor">Sitter</button>`;
    cloud.after(jumpNav);
    jumpNav.addEventListener("click",event=>{
      const button=event.target.closest("[data-care-jump]");
      if(!button)return;
      document.getElementById(button.dataset.careJump)?.scrollIntoView({behavior:"smooth",block:"start"});
    });

    const scroller=document.querySelector(".app-body");
    const topButton=document.createElement("button");
    topButton.type="button";
    topButton.id="careTopButton";
    topButton.className="care-top-button hidden";
    topButton.textContent="↑ Top";
    topButton.addEventListener("click",()=>{
      if(scroller)scroller.scrollTo({top:0,behavior:"smooth"});
      else document.getElementById("cloudCarePanel")?.scrollIntoView({behavior:"smooth",block:"start"});
    });
    document.body.appendChild(topButton);
    const updateTopButton=()=>{
      const care=document.getElementById("care");
      const careActive=care?.classList.contains("active");
      const y=scroller?scroller.scrollTop:window.scrollY;
      topButton.classList.toggle("hidden",!careActive||y<650);
    };
    (scroller||window).addEventListener("scroll",updateTopButton,{passive:true});
    document.addEventListener("click",()=>setTimeout(updateTopButton,30));

    const editor=document.createElement("div");
    editor.className="care-section full";editor.id="sitterEditor";
    editor.innerHTML=`<h3>Frannie’s Sitter</h3><p>Sitter Mode is a live care sheet. The person who activates a session owns it until that same person ends it. The owner can update these instructions at any time while the session stays active.</p><div class="row-2"><div><label>Potty / outside routine</label><textarea id="sitterPotty" placeholder="When to go out, door or yard routine"></textarea></div><div><label>Crate / sleep instructions</label><textarea id="sitterCrate" placeholder="Crate, bedtime, settling, and sleep routine"></textarea></div></div><div class="row-2" style="margin-top:9px"><div><label>Emergency / vet information</label><textarea id="sitterEmergency" placeholder="Vet, emergency contact, clinic, phone"></textarea></div><div><label>Sitter-specific instructions</label><textarea id="sitterInstructions" placeholder="Anything this caretaker should know"></textarea></div></div><div class="actions"><button class="secondary" id="saveSitterInstructions" type="button">Save draft</button><button class="primary" id="activateSitterInstructions" type="button">Activate Sitter Mode</button><button class="secondary hidden" id="endSitterInstructions" type="button">End Sitter Mode</button><button class="secondary" id="openSitterView" type="button">Open caretaker view</button></div><div id="sitterSaved" class="save-confirm hidden">✓ Sitter instruction draft saved.</div>`;
    const timeline=Array.from(careGrid.children).find(item=>item.querySelector("h3")?.textContent.includes("Frannie timeline"));
    careGrid.insertBefore(editor,timeline||null);


    sitterMode=globalThis.FrannieSitterMode?.create?.({
      getSitter:()=>state.sitter,
      setSitter:value=>{state.sitter=value},
      getUser:()=>userName,
      readEditor:readSitterEditor,
      fillEditor:fillSitterEditor,
      sections:sitterSections,
      escape:esc,
      showScreen:id=>globalThis.showScreen(id),
      splashDismissed,
      setActivity:action=>setNextActivity(action),
      persist:()=>persist(),
      saveLocalOnly:()=>Store.save(state),
      syncSoon:()=>scheduleSync()
    })||null;

    const connectModal=document.createElement("div");
    connectModal.className="modal connection-setup-modal";connectModal.id="connectionSetupModal";
    connectModal.innerHTML=`<div class="connection-setup-card"><div class="connection-setup-kicker">FRANNIE’S FAMILY</div><h2>Enter Frannie</h2><p id="setupIntro">Add the name or initials family members will see with your changes.</p><label for="setupUserName">Name or initials</label><input id="setupUserName" type="text" maxlength="60" autocapitalize="words" autocomplete="name" placeholder="Mollie, UB, Brett…"><div class="actions"><button id="setupConnectButton" class="primary" type="button">Enter Frannie</button><button id="setupCancelButton" class="secondary" type="button">Not now</button></div></div>`;
    document.body.appendChild(connectModal);

    const openConnectionSetup=()=>{
      const name=document.getElementById("setupUserName");
      const intro=document.getElementById("setupIntro");
      if(name)name.value=userName||"";
      if(intro)intro.textContent=pendingInvite?"Add the name or initials family members will see with your changes.":connectionCode?"Add the name or initials for this connected device.":"Open a current one-time Frannie invite on this device first.";
      connectModal.classList.add("open");
      setTimeout(()=>name?.focus(),50);
    };
    const closeConnectionSetup=()=>{connectModal.classList.remove("open");releaseModalState()};
    const connectFromSetup=async()=>{
      const name=(document.getElementById("setupUserName")?.value||"").trim();
      if(!name){alert("Add the name or initials for this device.");return}
      try{
        if(pendingInvite){await pairDevice(name)}
        else if(connectionCode){userName=name.slice(0,60);localStorage.setItem(USER_KEY,userName);await connect(connectionCode)}
        else{closeConnectionSetup();setTimeout(()=>alert("Open a current one-time Frannie invite on this device first."),0);return}
        renderConnectionControls();renderIdentityControls();closeConnectionSetup();await synchronize({forcePull:true});
      }catch(error){
        const recovery=pendingInvite.startsWith("fa_");
        const message=error.status===410?(recovery?"This Family Recovery Link was replaced. Use the newest saved recovery link.":"This invite has expired or was already used. Ask a connected family member for a new one."):error.status===404?(recovery?"This Family Recovery Link is not valid. Use the newest saved recovery link.":"This invite is not valid. Ask for a new Frannie invite."):"Frannie could not pair this device. Check the connection and try again.";
        closeConnectionSetup();setTimeout(()=>alert(message),0);
      }
    };

    document.getElementById("cloudCareConnect").addEventListener("click",openConnectionSetup);
    document.getElementById("setupConnectButton").addEventListener("click",connectFromSetup);
    document.getElementById("setupCancelButton").addEventListener("click",closeConnectionSetup);
    connectModal.addEventListener("click",event=>{if(event.target===connectModal)closeConnectionSetup()});
    document.getElementById("setupUserName").addEventListener("keydown",event=>{if(event.key==="Enter")connectFromSetup()});
    document.getElementById("cloudCareSaveUser").addEventListener("click",saveUserName);
    document.getElementById("cloudCareChangeUser").addEventListener("click",editUserName);
    document.getElementById("cloudCareUserName").addEventListener("keydown",event=>{if(event.key==="Enter")saveUserName()});
    document.getElementById("cloudCareSync").addEventListener("click",()=>synchronize());
    document.getElementById("cloudCareShareSetup").addEventListener("click",shareSetupLink);
    document.getElementById("cloudCareRecoveryLink").addEventListener("click",shareRecoveryLink);
    document.getElementById("cloudCareDisconnect").addEventListener("click",disconnect);
    document.getElementById("saveSitterInstructions").addEventListener("click",()=>sitterMode?.saveInstructions?.());
    document.getElementById("activateSitterInstructions").addEventListener("click",()=>sitterMode?.activate?.());
    document.getElementById("endSitterInstructions").addEventListener("click",()=>sitterMode?.end?.());
    document.getElementById("openSitterView").addEventListener("click",()=>sitterMode?.openView?.("care"));
    renderConnectionControls();renderIdentityControls();sitterMode?.renderAll?.();renderActivityLog();
    lastCareSnapshot=careSnapshot();

    if(needsIdentitySetup){
      setTimeout(()=>{
        const splash=document.getElementById("splashScreen");
        const wait=()=>{if(!splash||splash.classList.contains("hide"))openConnectionSetup();else setTimeout(wait,350)};
        wait();
      },250);
    }else if(connectionCode&&userName){
      setTimeout(()=>refreshForAppEntry(),0);
    }else if(!connectionCode){
      status(pendingInvite?"One-time invite ready — enter your name to pair":"Not connected — open a one-time Frannie invite","neutral");
    }
  }

  globalThis.FrannieCloudSync={onLocalPersist,synchronize,setNextActivity,setFocusIntent};
  globalThis.FrannieSharedCare={
    afterSplashDismiss:()=>sitterMode?.afterSplashDismiss?.(),
    checkSitterMode:()=>sitterMode?.onForeground?.()
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",buildUI,{once:true});else buildUI();

  let entryRefreshRunning=false;
  async function refreshForAppEntry(){
    if(entryRefreshRunning)return;
    entryRefreshRunning=true;
    try{
      if(connectionCode&&userName)await synchronize();
    }finally{
      entryRefreshRunning=false;
    }
  }

  // Sitter Mode is a normal app screen, not a fixed modal. Foreground entry may
  // open that screen when a session is active, but opening/closing the screen
  // has no authority over active state.
  window.addEventListener("pageshow",()=>{
    sitterMode?.onForeground?.();
    refreshForAppEntry();
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="hidden"){
      sitterMode?.onHidden?.();
      return;
    }
    sitterMode?.onForeground?.();
    refreshForAppEntry();
  });

  setTimeout(()=>{
    sitterMode?.onForeground?.();
    refreshForAppEntry();
  },500);
})();
