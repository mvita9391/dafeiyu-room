import {randomUUID} from 'node:crypto';
// Stable consumer identity belongs to the authorization subject, never a token or session.
export function installConsumers(db){db.exec(`
 CREATE TABLE IF NOT EXISTS consumer_recoveries(token TEXT PRIMARY KEY,subject_id TEXT NOT NULL,world_id TEXT NOT NULL,cursor INTEGER NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS event_retention(world_id TEXT PRIMARY KEY,removed_through INTEGER NOT NULL);
 CREATE TRIGGER IF NOT EXISTS track_event_retention AFTER DELETE ON events
 WHEN OLD.kind NOT IN ('owner_voice','owner_message') AND OLD.kind NOT LIKE 'voice.%'
 BEGIN INSERT INTO event_retention VALUES(OLD.world_id,OLD.cursor) ON CONFLICT(world_id) DO UPDATE SET removed_through=MAX(removed_through,excluded.removed_through); END;
 CREATE TABLE IF NOT EXISTS consumer_cursors(subject_id TEXT NOT NULL,world_id TEXT NOT NULL,confirmed_cursor INTEGER NOT NULL DEFAULT 0,delivered_cursor INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(subject_id,world_id));
 CREATE TABLE IF NOT EXISTS consumer_deliveries(subject_id TEXT NOT NULL,world_id TEXT NOT NULL,cursor INTEGER NOT NULL,PRIMARY KEY(subject_id,world_id,cursor));
 CREATE TABLE IF NOT EXISTS compacted_checkpoints(world_id TEXT NOT NULL,cursor INTEGER NOT NULL,PRIMARY KEY(world_id,cursor));
 CREATE TABLE IF NOT EXISTS consumer_acks(subject_id TEXT NOT NULL,world_id TEXT NOT NULL,request_id TEXT NOT NULL,cursor INTEGER NOT NULL,result TEXT NOT NULL,PRIMARY KEY(subject_id,world_id,request_id));
`);}
const visible="kind NOT IN ('owner_voice','owner_message') AND kind NOT LIKE 'voice.%'";
export function consumerState(db,subjectId,worldId){return db.prepare('SELECT confirmed_cursor,delivered_cursor FROM consumer_cursors WHERE subject_id=? AND world_id=?').get(subjectId,worldId)||{confirmed_cursor:0,delivered_cursor:0};}
export function recordDelivery(db,subjectId,worldId,page){
 db.exec('BEGIN IMMEDIATE');try{
 db.prepare('INSERT OR IGNORE INTO consumer_cursors(subject_id,world_id) VALUES(?,?)').run(subjectId,worldId);
 for(const event of page.events)db.prepare('INSERT OR IGNORE INTO consumer_deliveries VALUES(?,?,?)').run(subjectId,worldId,event.cursor);
 if(page.events.length)db.prepare('UPDATE consumer_cursors SET delivered_cursor=MAX(delivered_cursor,?) WHERE subject_id=? AND world_id=?').run(page.events.at(-1).cursor,subjectId,worldId);
 db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
export function confirmEvents(db,subjectId,{worldId,cursor,requestId,recoveryToken},now=Date.now()){
 if(!Number.isSafeInteger(cursor)||cursor<0||typeof requestId!=='string'||!requestId.length)throw Error('INVALID_CURSOR_OR_REQUEST');
 db.exec('BEGIN IMMEDIATE');try{
 const old=db.prepare('SELECT * FROM consumer_acks WHERE subject_id=? AND world_id=? AND request_id=?').get(subjectId,worldId,requestId);
 if(old){if(old.cursor!==cursor)throw Error('REQUEST_ID_REUSED');db.exec('COMMIT');return JSON.parse(old.result);}
 const state=consumerState(db,subjectId,worldId);
 let recovery=false;
 if(recoveryToken!==undefined){
 const receipt=db.prepare('SELECT * FROM consumer_recoveries WHERE token=? AND subject_id=? AND world_id=?').get(recoveryToken,subjectId,worldId);
 if(!receipt||receipt.cursor!==cursor||receipt.expires_at<=now)throw Error('INVALID_RECOVERY_TOKEN');
 recovery=true;
 }
 const removedThrough=db.prepare('SELECT removed_through FROM event_retention WHERE world_id=?').get(worldId)?.removed_through||0;
 if(cursor>state.confirmed_cursor&&removedThrough>state.confirmed_cursor&&!recovery)throw Error('CURSOR_GAP_UNRECOVERED');
 if(cursor>state.confirmed_cursor&&!recovery){
 const delivered=db.prepare('SELECT 1 FROM consumer_deliveries WHERE subject_id=? AND world_id=? AND cursor=?').get(subjectId,worldId,cursor);
 const unseen=db.prepare(`SELECT 1 FROM events e WHERE world_id=? AND cursor>? AND cursor<=? AND ${visible} AND NOT EXISTS(SELECT 1 FROM consumer_deliveries d WHERE d.subject_id=? AND d.world_id=e.world_id AND d.cursor=e.cursor) LIMIT 1`).get(worldId,state.confirmed_cursor,cursor,subjectId);
 if(!delivered||unseen)throw Error('EVENT_CURSOR_NOT_DELIVERED');
 }
 const result={confirmedCursor:Math.max(cursor,state.confirmed_cursor)};
 db.prepare('INSERT INTO consumer_cursors VALUES(?,?,?,?) ON CONFLICT(subject_id,world_id) DO UPDATE SET confirmed_cursor=excluded.confirmed_cursor').run(subjectId,worldId,result.confirmedCursor,state.delivered_cursor);
 db.prepare('INSERT INTO consumer_acks VALUES(?,?,?,?,?)').run(subjectId,worldId,requestId,cursor,JSON.stringify(result));
 db.exec('COMMIT');return result;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function resumeConsumer(db,subjectId,worldId){
 const state=consumerState(db,subjectId,worldId),rows=db.prepare(`SELECT kind,COUNT(*) count FROM events WHERE world_id=? AND cursor>? AND ${visible} GROUP BY kind`).all(worldId,state.confirmed_cursor);
 const missing=db.prepare('SELECT 1 FROM consumer_deliveries d WHERE subject_id=? AND world_id=? AND cursor>? AND NOT EXISTS(SELECT 1 FROM events e WHERE e.cursor=d.cursor AND e.world_id=d.world_id) AND NOT EXISTS(SELECT 1 FROM compacted_checkpoints c WHERE c.cursor=d.cursor AND c.world_id=d.world_id) LIMIT 1').get(subjectId,worldId,state.confirmed_cursor);
 return {lastConfirmedCursor:state.confirmed_cursor,deliveredCursor:state.delivered_cursor,unreadCounts:{total:rows.reduce((n,r)=>n+r.count,0),byKind:Object.fromEntries(rows.map(r=>[r.kind,r.count]))},snapshotResetRequired:Boolean(missing)||(db.prepare('SELECT removed_through FROM event_retention WHERE world_id=?').get(worldId)?.removed_through||0)>state.confirmed_cursor};
}

// Called only with a freshly read authorized snapshot. The receipt proves delivery
// of that snapshot through this exact head, not delivery of deleted event payloads.
export function snapshotRecovery(db,subjectId,worldId,now=Date.now()){
 const head=db.prepare(`SELECT MAX(cursor) head FROM events WHERE world_id=? AND ${visible}`).get(worldId)?.head||0;
 const removed=db.prepare('SELECT removed_through FROM event_retention WHERE world_id=?').get(worldId)?.removed_through||0;
 const recoveryCursor=Math.max(head,removed),recoveryToken=randomUUID();
 db.prepare('DELETE FROM consumer_recoveries WHERE expires_at<=? OR (subject_id=? AND world_id=?)').run(now,subjectId,worldId);
 db.prepare('INSERT INTO consumer_recoveries VALUES(?,?,?,?,?)').run(recoveryToken,subjectId,worldId,recoveryCursor,now+300000);
 return {recoveryToken,recoveryCursor};
}
