import { installConsumers } from '../world/consumers.js';
import { checkpointSignature } from '../world/checkpoints.js';

export function compactCheckpoints(db) {
 db.exec('BEGIN IMMEDIATE');
 try {
  installConsumers(db);
  const checkpoints=db.prepare("SELECT world_id,cursor,data FROM events WHERE kind='runtime.checkpoint' ORDER BY world_id,cursor").all();
  const heads=new Map(db.prepare('SELECT world_id,MAX(cursor) AS cursor FROM events GROUP BY world_id').all().map(row=>[row.world_id,row.cursor]));
  const markDelivered=db.prepare(`INSERT OR IGNORE INTO compacted_checkpoints
   SELECT ?,? WHERE EXISTS(SELECT 1 FROM consumer_deliveries WHERE world_id=? AND cursor=?)`);
  const remove=db.prepare('DELETE FROM events WHERE world_id=? AND cursor=?');
  // Removing redundant payloads is compaction, not a missing segment of the event log.
  // Restore the normal retention trigger in the same transaction.
  db.exec('DROP TRIGGER track_event_retention');
  const last=new Map();
  let removed=0;
  for(const row of checkpoints){
   const {world_id:worldId,cursor,data}=row;
   const signature=checkpointSignature(JSON.parse(data).actors);
   if(last.get(worldId)===signature&&heads.get(worldId)!==cursor){
    markDelivered.run(worldId,cursor,worldId,cursor);
    removed+=remove.run(worldId,cursor).changes;
   }
   last.set(worldId,signature);
  }
  installConsumers(db);
  db.exec('COMMIT');
  return {removed,kept:checkpoints.length-removed};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
