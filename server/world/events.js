export function appendEvent(db,{worldId,kind,subjectId,changeId,data,now=Date.now()}){
 if(typeof kind!=='string'||!kind.length)throw Error('INVALID_EVENT');
 return Number(db.prepare('INSERT INTO events(world_id,kind,subject_id,change_id,created_at,data) VALUES(?,?,?,?,?,?)').run(worldId,kind,subjectId,changeId,now,JSON.stringify(data)).lastInsertRowid);
}
export function readLatestCursor(db,worldId){
 return Number(db.prepare('SELECT COALESCE(MAX(cursor),0) AS cursor FROM events WHERE world_id=?').get(worldId).cursor);
}

export function readEvents(db,{worldId,afterCursor=0,limit=100}){
 if(!Number.isSafeInteger(afterCursor)||afterCursor<0||!Number.isSafeInteger(limit)||limit<1||limit>500)throw Error('INVALID_CURSOR_OR_LIMIT');
 // Retired chat records stay private; the world event log contains no chat delivery.
 const rows=db.prepare("SELECT * FROM events WHERE world_id=? AND cursor>? AND kind NOT IN ('owner_voice','owner_message') AND kind NOT LIKE 'voice.%' ORDER BY cursor LIMIT ?").all(worldId,afterCursor,limit+1);
 const hasMore=rows.length>limit;const events=rows.slice(0,limit).map(r=>({cursor:r.cursor,worldId:r.world_id,kind:r.kind,subjectId:r.subject_id,changeId:r.change_id,createdAt:r.created_at,data:JSON.parse(r.data)}));
 return {events,nextCursor:events.at(-1)?.cursor??afterCursor,hasMore};
}

// Shared transport policy: no adapter may return raw event payloads. Actor data
// follows the caller's actor grant; lease credentials additionally belong to its
// stable subject. Keep event cursors/kinds so redaction cannot break pagination.
export function projectEventPage(page,principal){
 const actorIds=new Set(principal.actorIds||[]);
 function project(value,subjectId,actorId){
  if(Array.isArray(value))return value.map(v=>project(v,subjectId,actorId)).filter(v=>v!==undefined);
  if(!value||typeof value!=='object')return value;
  const subject=value.subjectId??subjectId,actor=value.actorId??actorId;
  if(actor&&!actorIds.has(actor))return undefined;
  const ownLease=subject===principal.subjectId&&actorIds.has(actor),result={};
  for(const [key,item] of Object.entries(value)){
   if((key==='leaseId'||key==='leaseVersion')&&!ownLease)continue;
   if(key==='subjectId'&&item!==principal.subjectId)continue;
   const projected=project(item,subject,actor);if(projected!==undefined)result[key]=projected;
  }
  return result;
 }
 return {...page,events:page.events.map(event=>({...event,subjectId:event.subjectId===principal.subjectId?event.subjectId:null,data:project(event.data,event.subjectId,undefined)||{}}))};
}
