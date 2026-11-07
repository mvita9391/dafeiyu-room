// Passive hunger and energy decay belongs in the save, not in the activity feed.
export function checkpointSignature(actors,{includePosition=true}={}) {
 return JSON.stringify(actors.map(actor=>JSON.stringify([
  actor.actorId,actor.sceneId,
  includePosition?actor.position?.map(value=>Math.round(value*1000)):null,
  actor.pose,actor.actionId??null,Math.round((actor.needs?.happiness??0)*10),
 ])).sort());
}

export function recordCheckpoint(snapshot,now,db,emit,{includePosition=true}={}) {
 if(snapshot.runtime.lastCheckpointAt&&now-snapshot.runtime.lastCheckpointAt<60_000)return;
 snapshot.runtime.lastCheckpointAt=now;
 db.prepare('DELETE FROM movement_receipts WHERE expires_at<=?').run(now);
 const actors=snapshot.actors.map(({actorId,sceneId,position,pose,needs,actionId})=>({actorId,sceneId,...includePosition?{position}:{},pose,needs,actionId}));
 const signature=checkpointSignature(actors,{includePosition});
 if(!includePosition)snapshot.runtime.checkpointPositionOmitted=true;
 let previous=snapshot.runtime.lastCheckpointSignature;
 if(previous===undefined){
  const latest=db.prepare("SELECT data FROM events WHERE world_id=? AND kind='runtime.checkpoint' ORDER BY cursor DESC LIMIT 1").get(snapshot.worldId);
  if(latest)previous=checkpointSignature(JSON.parse(latest.data).actors,{includePosition});
 }
 snapshot.runtime.lastCheckpointSignature=signature;
 if(signature!==previous)emit('runtime.checkpoint',{at:now,actors});
}
