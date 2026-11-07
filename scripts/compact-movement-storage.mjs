import { backup, DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrateWorld } from '../server/storage/migrations.js';

// Run once with the game server stopped. Keep the backup for rollback.
const [databasePath, backupPath] = process.argv.slice(2);
if (!databasePath || !backupPath || !existsSync(databasePath) ||
    resolve(databasePath) === resolve(backupPath) || existsSync(backupPath)) {
  throw Error('Usage: node scripts/compact-movement-storage.mjs EXISTING_DB NEW_BACKUP');
}

const db = new DatabaseSync(databasePath);
try {
  await backup(db, backupPath);
  chmodSync(backupPath, 0o600);
  const saved = new DatabaseSync(backupPath, { readOnly: true });
  try {
    if (saved.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Backup failed integrity check');
    const worlds = 'SELECT world_id,snapshot FROM worlds ORDER BY world_id';
    const commands = 'SELECT count(*) AS total FROM command_results';
    for (const query of [worlds, commands]) {
      if (JSON.stringify(saved.prepare(query).all()) !== JSON.stringify(db.prepare(query).all())) {
        throw Error('Backup differs from source');
      }
    }
  } finally {
    saved.close();
  }

  migrateWorld(db);
  const { changes } = db.prepare("DELETE FROM command_results WHERE json_extract(command,'$.kind')='actor.input'").run();
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
  console.log(`Removed ${changes} legacy movement receipts. Verified backup: ${backupPath}`);
} finally {
  db.close();
}
