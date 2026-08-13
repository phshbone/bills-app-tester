import assert from "node:assert/strict";
import worker from "../worker/src/worker.js";

class Statement{
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[]}
  bind(...args){this.args=args;return this}
  async first(){
    if(this.sql.includes("FROM frannie_devices WHERE credential_hash"))return this.db.devices.find(x=>x.credential_hash===this.args[0])||null;
    if(this.sql.includes("FROM frannie_invites WHERE token_hash"))return this.db.invites.find(x=>x.token_hash===this.args[0])||null;
    if(this.sql.includes("FROM frannie_care WHERE id = 1"))return this.db.care;
    throw new Error("Unhandled first: "+this.sql);
  }
  async run(){
    const now=new Date().toISOString();
    if(this.sql.startsWith("UPDATE frannie_devices SET last_seen_at")){const x=this.db.devices.find(v=>v.id===this.args[0]);if(x)x.last_seen_at=now;return {meta:{changes:x?1:0}}}
    if(this.sql.startsWith("INSERT INTO frannie_devices")){this.db.devices.push({id:this.args[0],display_name:this.args[1],credential_hash:this.args[2],revoked_at:null});return {meta:{changes:1}}}
    if(this.sql.startsWith("INSERT INTO frannie_invites")){this.db.invites.push({id:this.args[0],token_hash:this.args[1],expires_at:new Date(Date.now()+3600000).toISOString(),used_at:null});return {meta:{changes:1}}}
    if(this.sql.startsWith("UPDATE frannie_invites SET used_at")){const x=this.db.invites.find(v=>v.id===this.args[0]&&!v.used_at&&Date.parse(v.expires_at)>Date.now());if(x)x.used_at=now;return {meta:{changes:x?1:0}}}
    if(this.sql.startsWith("UPDATE frannie_devices SET revoked_at")){const x=this.db.devices.find(v=>v.id===this.args[0]);if(x)x.revoked_at=now;return {meta:{changes:x?1:0}}}
    if(this.sql.startsWith("INSERT INTO frannie_care")){if(this.db.care)return {meta:{changes:0}};this.db.care={data:this.args[0],version:1,updated_at:now,updated_by_device_id:this.args[1]};return {meta:{changes:1}}}
    if(this.sql.startsWith("UPDATE frannie_care SET data")){if(!this.db.care||this.db.care.version!==this.args[3])return {meta:{changes:0}};this.db.care={data:this.args[0],version:this.args[1],updated_at:now,updated_by_device_id:this.args[2]};return {meta:{changes:1}}}
    throw new Error("Unhandled run: "+this.sql);
  }
}
class MockDB{constructor(){this.devices=[];this.invites=[];this.care=null}prepare(sql){return new Statement(this,sql)}}
const db=new MockDB(),env={DB:db,ALLOWED_ORIGINS:"https://frannie.example",LEGACY_FAMILY_TOKEN:"legacy-test",ADMIN_RECOVERY_TOKEN:"recovery-test"};
const call=(path,{method="GET",credential,body,headers={}}={})=>worker.fetch(new Request("https://api.example"+path,{method,headers:{Origin:"https://frannie.example",...(credential?{Authorization:"Bearer "+credential}:{}),...(body?{"Content-Type":"application/json"}:{}),...headers},body:body?JSON.stringify(body):undefined}),env);

let response=await call("/v1/invites",{method:"POST",credential:"legacy-test",body:{expiresInMinutes:60}});
assert.equal(response.status,201);const invite=await response.json();assert.ok(invite.inviteToken.startsWith("fi_"));

response=await call("/v1/pair",{method:"POST",body:{inviteToken:invite.inviteToken,displayName:"Mollie"}});
assert.equal(response.status,201);const paired=await response.json();assert.ok(paired.credential.startsWith("fd_"));assert.equal(paired.device.displayName,"Mollie");
response=await call("/v1/pair",{method:"POST",body:{inviteToken:invite.inviteToken,displayName:"UB"}});assert.equal(response.status,410,"used invite is rejected");
response=await call("/v1/pair",{method:"POST",body:{inviteToken:"fi_invalid",displayName:"UB"}});assert.equal(response.status,404,"invalid invite is rejected");

response=await call("/v1/care",{method:"PUT",credential:paired.credential,body:{data:{sitter:{active:true}},baseVersion:0}});assert.equal(response.status,200);let care=await response.json();assert.equal(care.data.sitter.active,true);
response=await call("/v1/care",{method:"PUT",credential:paired.credential,body:{data:{sitter:{active:false}},baseVersion:0}});assert.equal(response.status,409,"stale write returns a conflict");
response=await call("/v1/devices/current",{method:"DELETE",credential:paired.credential});assert.equal(response.status,200);
response=await call("/v1/care",{credential:paired.credential});assert.equal(response.status,401,"revoked device cannot read/write");

response=await call("/v1/admin/recovery-invite",{method:"POST",headers:{"X-Admin-Recovery":"recovery-test"},body:{}});assert.equal(response.status,201,"offline admin recovery can issue an invite");
console.log("PASS: 12 Worker pairing, one-time invite, conflict, revocation, and recovery assertions");
