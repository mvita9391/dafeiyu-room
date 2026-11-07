import { backup, DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync } from 'node:fs';
import { compactCheckpoints } from '../server/storage/checkpoint-cleanup.js';

const [databasePath,backupPath]=process.argv.slice(2);
if(!databasePath||!backupPath||!existsSync(databasePath)||existsSync(backupPath)){
 throw Error('Usage with the game stopped: node scripts/compact-checkpoints.mjs EXISTING_DB NEW_BACKUP');
}
const db=new DatabaseSync(databasePath);
try {
 await backup(db,backupPath);
 chmodSync(backupPath,0o600);
 const saved=new DatabaseSync(backupPath,{readOnly:true});
 try {
  if(saved.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup failed integrity check');
 }finally{saved.close();}
 console.log(JSON.stringify({...compactCheckpoints(db),backupPath}));
}finally{db.close();}
