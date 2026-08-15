(function(root){
  "use strict";

  const OBJECT_ARRAY_FIELDS=["logs","treatments","treatmentHistory","careHistory","allergies","weights","heights","careNotes","feedingItems","feedingHistory","activityLog"];
  const PRIMITIVE_ARRAY_FIELDS=["selected","completed"];
  const ARRAY_FIELDS=[...PRIMITIVE_ARRAY_FIELDS,...OBJECT_ARRAY_FIELDS];
  const SITTER_TEXT_FIELDS=["pottyRoutine","crateSleep","emergencyVet","instructions","activatedAt","activatedBy","activatedByDeviceId","sessionId","changedAt","changedBy","changeId","endedAt","endedBy"];
  const SITTER_FIELDS=[...SITTER_TEXT_FIELDS,"active"];

  function isObject(value){return Boolean(value)&&typeof value==="object"&&!Array.isArray(value)}
  function text(value){return typeof value==="string"?value:""}
  function cloneObjectArray(value){return Array.isArray(value)?value.filter(isObject).map(item=>({...item})):[]}
  function clonePrimitiveArray(value){return Array.isArray(value)?value.filter(item=>typeof item==="string"||typeof item==="number"||typeof item==="boolean"):[]}

  function normalize(raw){
    const value=isObject(raw)?raw:{};
    const profile=isObject(value.profile)?{
      name:text(value.profile.name)||"Frannie",
      age:text(value.profile.age),
      size:text(value.profile.size)||"Medium",
      goal:text(value.profile.goal)
    }:null;
    const sitter={};
    SITTER_TEXT_FIELDS.forEach(field=>{sitter[field]=isObject(value.sitter)?text(value.sitter[field]):""});
    sitter.active=Boolean(isObject(value.sitter)&&value.sitter.active);
    const result={schemaVersion:Number.isInteger(value.schemaVersion)?value.schemaVersion:3,profile,sitter};
    PRIMITIVE_ARRAY_FIELDS.forEach(field=>{result[field]=clonePrimitiveArray(value[field])});
    OBJECT_ARRAY_FIELDS.forEach(field=>{result[field]=cloneObjectArray(value[field])});
    return result;
  }

  function extract(appState){
    const source=isObject(appState)?appState:{};
    return normalize({
      schemaVersion:3,
      profile:source.profile?{name:source.profile.name,age:source.profile.age,size:source.profile.size,goal:source.profile.goal}:null,
      selected:source.selected,
      completed:source.completed,
      logs:source.logs,
      sitter:source.sitter,
      treatments:source.treatments,
      treatmentHistory:source.treatmentHistory,
      careHistory:source.careHistory,
      allergies:source.allergies,
      weights:source.weights,
      heights:source.heights,
      careNotes:source.careNotes,
      feedingItems:source.feedingItems,
      feedingHistory:source.feedingHistory,
      activityLog:source.activityLog
    });
  }

  function same(left,right){return JSON.stringify(left)===JSON.stringify(right)}

  function mergeObject(base,local,remote,fields){
    const result={...(isObject(remote)?remote:{})};
    const baseObject=isObject(base)?base:{};
    const localObject=isObject(local)?local:{};
    fields.forEach(field=>{if(!same(localObject[field],baseObject[field]))result[field]=localObject[field]??""});
    return result;
  }

  function mergeProfile(base,local,remote){
    if(local===null&&base!==null)return null;
    return mergeObject(base,local,remote,["name","age","size","goal"]);
  }

  function mergeArray(base,local,remote){
    const baseItems=cloneObjectArray(base),localItems=cloneObjectArray(local),remoteItems=cloneObjectArray(remote);
    const baseById=new Map(baseItems.map(item=>[item.id,item]));
    const localById=new Map(localItems.map(item=>[item.id,item]));
    const remoteById=new Map(remoteItems.map(item=>[item.id,item]));

    baseById.forEach((item,id)=>{if(id&&!localById.has(id))remoteById.delete(id)});
    const locallyChanged=[];
    localItems.forEach(item=>{
      if(!item.id)return;
      if(!baseById.has(item.id)||!same(item,baseById.get(item.id))){remoteById.set(item.id,item);locallyChanged.push(item.id)}
    });

    const changedSet=new Set(locallyChanged);
    return [
      ...locallyChanged.map(id=>remoteById.get(id)).filter(Boolean),
      ...remoteItems.filter(item=>item.id&&remoteById.has(item.id)&&!changedSet.has(item.id)).map(item=>remoteById.get(item.id)),
      ...Array.from(remoteById.entries()).filter(([id])=>!remoteItems.some(item=>item.id===id)&&!changedSet.has(id)).map(([,item])=>item)
    ];
  }

  function mergePrimitiveArray(base,local,remote){
    const baseItems=clonePrimitiveArray(base),localItems=clonePrimitiveArray(local),remoteItems=clonePrimitiveArray(remote);
    const result=new Set(remoteItems);
    baseItems.forEach(item=>{if(!localItems.includes(item))result.delete(item)});
    localItems.forEach(item=>{if(!baseItems.includes(item))result.add(item)});
    return Array.from(result);
  }

  // Activity is an append-only audit trail. A stale/empty device must never
  // interpret missing audit entries as intentional deletions. Merge by id and
  // keep the newest copy of each entry, newest timestamp first.
  function mergeActivityLog(local,remote){
    const byId=new Map();
    [...cloneObjectArray(remote),...cloneObjectArray(local)].forEach(item=>{
      if(item.id)byId.set(item.id,item);
    });
    return Array.from(byId.values()).sort((a,b)=>{
      const left=Date.parse(a.at||"")||0,right=Date.parse(b.at||"")||0;
      return right-left;
    }).slice(0,100);
  }

  function merge(baseValue,localValue,remoteValue){
    const base=normalize(baseValue),local=normalize(localValue),remote=normalize(remoteValue);
    const result={
      schemaVersion:Math.max(base.schemaVersion,local.schemaVersion,remote.schemaVersion),
      profile:mergeProfile(base.profile,local.profile,remote.profile),
      sitter:mergeObject(base.sitter,local.sitter,remote.sitter,SITTER_FIELDS)
    };
    PRIMITIVE_ARRAY_FIELDS.forEach(field=>{result[field]=mergePrimitiveArray(base[field],local[field],remote[field])});
    OBJECT_ARRAY_FIELDS.forEach(field=>{
      result[field]=field==="activityLog"?mergeActivityLog(local[field],remote[field]):mergeArray(base[field],local[field],remote[field]);
    });
    return normalize(result);
  }

  root.FrannieCareCore={ARRAY_FIELDS,OBJECT_ARRAY_FIELDS,PRIMITIVE_ARRAY_FIELDS,SITTER_FIELDS,normalize,extract,merge,same,mergeActivityLog};
})(globalThis);
