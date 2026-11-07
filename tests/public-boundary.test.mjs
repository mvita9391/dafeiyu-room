import test from 'node:test';
import assert from 'node:assert/strict';
import {blockedPublicFile} from '../scripts/check-public.mjs';
test('public boundary rejects scratch, credentials, saves and voice/model assets at any depth',()=>{
 for(const file of ['.town-import-jobs/task/manifest.json','.superpowers/report.md','scratch/probe.json','tests/tmp/client.json','data/save.sqlite-wal','local/token.json','secrets.json','credentials.json','public/voices/a.mp3','public/model.gguf','private/asr/weights.bin','public/font.woff2','public/characters/a.png','.env.local','character.local.json'])assert.equal(blockedPublicFile(file),true,file);
 for(const file of ['src/main.js','server/audio/playback.js','tests/audio-playback.test.mjs','docs/screenshots/yard.png','package-lock.json'])assert.equal(blockedPublicFile(file),false,file);
});
