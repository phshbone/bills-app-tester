(function(root){
  "use strict";

  const ARRAY_FIELDS=["treatments","treatmentHistory","careHistory","allergies","weights","heights","careNotes","feedingItems","feedingHistory"];
  const SITTER_FIELDS=["pottyRoutine","crateSleep","emergencyVet","instructions"];

  function isObject(value){return Boolean(value)&&typeof value==="object"&&!Array.isArray(value)}
  function text(value){return typeof value==="string"?value:""}
  function cloneArray(value){return Array.isArray(value)?value.filter(isObject).map(item=>({...item})):[]}

  function normalize(raw){
    const value=isObject(raw)?raw:{};
    const profile=isObject(value.profile)?{
      name:text(value.profile.name)||"Frannie",
      age:text(value.profile.age),
      size:text(value.profile.size)||"Medium"
    }:null;
    const sitter={};
    SITTER_FIELDS.forEach(field=>{sitter[field]=isObject(value.sitter)?text(value.sitter[field]):""});
    const result={schemaVersion:Number.isInteger(value.schemaVersion)?value.schemaVersion:1,profile,sitter};
    ARRAY_FIELDS.forEach(field=>{result[field]=cloneArray(value[field])});
    return result;
  }

  function extract(appState){
    const source=isObject(appState)?appState:{};
    return normalize({
      schemaVersion:1,
      profile:source.profile?{name:source.profile.name,age:source.profile.age,size:source.profile.size}:null,
      sitter:source.sitter,
      treatments:source.treatments,
      treatmentHistory:source.treatmentHistory,
      careHistory:source.careHistory,
      allergies:source.allergies,
      weights:source.weights,
      heights:source.heights,
      careNotes:source.careNotes,
      feedingItems:source.feedingItems,
      feedingHistory:source.feedingHistory
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
    return mergeObject(base,local,remote,["name","age","size"]);
  }

  function mergeArray(base,local,remote){
    const baseItems=cloneArray(base),localItems=cloneArray(local),remoteItems=cloneArray(remote);
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

  function merge(baseValue,localValue,remoteValue){
    const base=normalize(baseValue),local=normalize(localValue),remote=normalize(remoteValue);
    const result={
      schemaVersion:Math.max(base.schemaVersion,local.schemaVersion,remote.schemaVersion),
      profile:mergeProfile(base.profile,local.profile,remote.profile),
      sitter:mergeObject(base.sitter,local.sitter,remote.sitter,SITTER_FIELDS)
    };
    ARRAY_FIELDS.forEach(field=>{result[field]=mergeArray(base[field],local[field],remote[field])});
    return normalize(result);
  }

  root.FrannieCareCore={ARRAY_FIELDS,SITTER_FIELDS,normalize,extract,merge,same};
})(globalThis);
