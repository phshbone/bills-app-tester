const JSON_HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"};
const CARE_RECORD_ID="frannie";
const MAX_BODY_BYTES=512000;

class HttpError extends Error{constructor(status,message,extra={}){super(message);this.status=status;this.extra=extra}}
const reply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{...JSON_HEADERS,...headers}});
const token=(prefix)=>prefix+Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
async function digest(value){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("")}
async function secretMatches(provided,expected){
  if(!provided||!expected)return false;
  const encoder=new TextEncoder();
  const [left,right]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(provided)),crypto.subtle.digest("SHA-256",encoder.encode(expected))]);
  const a=new Uint8Array(left),b=new Uint8Array(right);let difference=0;
  for(let index=0;index<a.length;index++)difference|=a[index]^b[index];
  return difference===0;
}
function bearer(request){const value=request.headers.get("Authorization")||"";return value.startsWith("Bearer ")?value.slice(7).trim():""}
async function body(request){try{return await request.json()}catch{throw new HttpError(400,"Invalid JSON body")}}

function cors(request,env){
  const origin=request.headers.get("Origin")||"";
  const allowed=String(env.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(!origin)return {};
  if(!allowed.includes(origin))throw new HttpError(403,"Origin not allowed");
  return {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"Authorization, Content-Type, X-Admin-Recovery","Access-Control-Allow-Methods":"GET, PUT, POST, DELETE, OPTIONS","Vary":"Origin"};
}

async function authorize(request,env,{allowLegacy=true}={}){
  const credential=bearer(request);
  if(!credential)throw new HttpError(401,"Missing device credential");
  if(allowLegacy&&await secretMatches(credential,env.CARE_ACCESS_KEY))return {legacy:true,id:null,display_name:"Legacy family device"};
  const hash=await digest(credential);
  const device=await env.CARE_DB.prepare("SELECT id, display_name, revoked_at FROM frannie_devices WHERE credential_hash = ?").bind(hash).first();
  if(!device||device.revoked_at)throw new HttpError(401,"Device credential not accepted");
  await env.CARE_DB.prepare("UPDATE frannie_devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(device.id).run();
  return device;
}

async function createDevice(env,displayName){
  const credential=token("fd_");
  const id=crypto.randomUUID();
  await env.CARE_DB.prepare("INSERT INTO frannie_devices (id, display_name, credential_hash) VALUES (?, ?, ?)").bind(id,displayName,await digest(credential)).run();
  return {credential,device:{id,displayName}};
}

async function getCare(env){
  const row=await env.CARE_DB.prepare("SELECT data, version, updated_at FROM care_records WHERE id = ?").bind(CARE_RECORD_ID).first();
  if(!row)return {data:null,version:0,updatedAt:null};
  let data=null;try{data=JSON.parse(row.data)}catch{throw new HttpError(500,"Stored care record is invalid")}
  return {data,version:Number(row.version)||0,updatedAt:row.updated_at||null};
}

async function putCare(request,env){
  const input=await body(request);
  if(!input.data||typeof input.data!=="object"||Array.isArray(input.data))throw new HttpError(400,"Care data must be an object");
  const baseVersion=Number(input.baseVersion);
  if(!Number.isInteger(baseVersion)||baseVersion<0)throw new HttpError(400,"baseVersion must be a non-negative integer");
  const current=await getCare(env);
  if(current.version!==baseVersion)throw new HttpError(409,"Care record changed on another device",{conflict:true,...current});
  // Do not sanitize away valid shared fields. The frontend already sends the
  // normalized schema; preserve it byte-for-byte through JSON serialization.
  const serialized=JSON.stringify(input.data);
  if(new TextEncoder().encode(serialized).byteLength>MAX_BODY_BYTES)throw new HttpError(413,"Care record is too large");
  const nextVersion=current.version+1;
  const updatedAt=new Date().toISOString();
  const result=current.version===0
    ? await env.CARE_DB.prepare("INSERT INTO care_records (id, version, updated_at, data) VALUES (?, 1, ?, ?) ON CONFLICT(id) DO NOTHING").bind(CARE_RECORD_ID,updatedAt,serialized).run()
    : await env.CARE_DB.prepare("UPDATE care_records SET data = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?").bind(serialized,nextVersion,updatedAt,CARE_RECORD_ID,current.version).run();
  if(!result.meta?.changes)throw new HttpError(409,"Care record changed on another device",{conflict:true,...await getCare(env)});
  return getCare(env);
}

async function createInvite(request,env){
  await authorize(request,env);
  const input=await body(request);
  const minutes=Math.min(1440,Math.max(5,Number(input.expiresInMinutes)||60));
  const inviteToken=token("fi_");
  await env.CARE_DB.prepare("INSERT INTO frannie_invites (id, token_hash, expires_at) VALUES (?, ?, datetime('now', ?))").bind(crypto.randomUUID(),await digest(inviteToken),`+${minutes} minutes`).run();
  return {inviteToken,expiresAt:new Date(Date.now()+minutes*60000).toISOString()};
}

async function pair(request,env){
  const input=await body(request);
  const inviteToken=String(input.inviteToken||"").trim();
  const displayName=String(input.displayName||"").trim().slice(0,60);
  if(!inviteToken||!displayName)throw new HttpError(400,"Invite token and display name are required");
  const hash=await digest(inviteToken);
  const invite=await env.CARE_DB.prepare("SELECT id, expires_at, used_at FROM frannie_invites WHERE token_hash = ?").bind(hash).first();
  if(!invite)throw new HttpError(404,"Invite not found");
  if(invite.used_at||Date.parse(invite.expires_at)<=Date.now())throw new HttpError(410,"Invite expired or already used");
  const claimed=await env.CARE_DB.prepare("UPDATE frannie_invites SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP").bind(invite.id).run();
  if(!claimed.meta?.changes)throw new HttpError(410,"Invite expired or already used");
  return createDevice(env,displayName);
}

async function adminInvite(request,env){
  if(!await secretMatches(request.headers.get("X-Admin-Recovery")||"",env.ADMIN_RECOVERY_TOKEN))throw new HttpError(401,"Administrative recovery not authorized");
  const inviteToken=token("fi_");
  await env.CARE_DB.prepare("INSERT INTO frannie_invites (id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+30 minutes'))").bind(crypto.randomUUID(),await digest(inviteToken)).run();
  return {inviteToken,expiresAt:new Date(Date.now()+1800000).toISOString()};
}

async function route(request,env){
  const url=new URL(request.url),key=`${request.method} ${url.pathname}`;
  if(key==="GET /health")return reply({ok:true,service:"frannie-care"});
  if(key==="POST /v1/pair")return reply(await pair(request,env),201);
  if(key==="POST /v1/admin/recovery-invite")return reply(await adminInvite(request,env),201);
  if(key==="POST /v1/invites")return reply(await createInvite(request,env),201);
  if(key==="POST /v1/devices/migrate"){
    const actor=await authorize(request,env);
    if(!actor.legacy)throw new HttpError(409,"This device already has a device credential");
    const input=await body(request),name=String(input.displayName||"Family device").trim().slice(0,60)||"Family device";
    return reply(await createDevice(env,name),201);
  }
  if(key==="DELETE /v1/devices/current"){
    const actor=await authorize(request,env,{allowLegacy:false});
    await env.CARE_DB.prepare("UPDATE frannie_devices SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?").bind(actor.id).run();
    return reply({revoked:true});
  }
  if(key==="GET /v1/care"){await authorize(request,env);return reply(await getCare(env))}
  if(key==="PUT /v1/care"){await authorize(request,env);return reply(await putCare(request,env))}
  throw new HttpError(404,"Not found");
}

export default {async fetch(request,env){
  let headers={};
  try{
    headers=cors(request,env);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
    const response=await route(request,env);
    Object.entries(headers).forEach(([key,value])=>response.headers.set(key,value));
    return response;
  }catch(error){
    const known=error instanceof HttpError;
    return reply({error:known?error.message:"Internal server error",...(known?error.extra:{})},known?error.status:500,headers);
  }
}};
