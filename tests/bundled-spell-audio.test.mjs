import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SPELLS} from '../shared/world/spells.js';
import {FOODS} from '../shared/world/foods.js';
import {LocalSound} from '../src/core/local-sound.js';
import {MUSIC_THEMES,UI_SOUND} from '../src/core/sound-dictionary.js';

test('game audio plays both spell phases and sound variants from the public manifest',()=>{
 const approved=new Set(JSON.parse(readFileSync(new URL('../resources/audio/manifest.json',import.meta.url))).files.map(entry=>entry.path));
 const played=[];
 const requested=new Set();
 class Audio{
  constructor(url){this.url=url;this.readyState=2;requested.add(url);}
  play(){played.push(this.url);return Promise.resolve();}
  pause(){}
 }
 const sound=new LocalSound({AudioClass:Audio});
 sound.setEnabled(true);
 const spells=[...SPELLS.map(({id})=>id),'waterJet'];
 for(const id of spells){
  sound.playAction(`spell-${id}-release`);
  sound.playAction(`spell-${id}`);
 }
 const expected=spells.flatMap(id=>{
  const name=id==='waterJet'?'water-jet':id;
  return ['release','impact'].map(phase=>`/resources/audio/action-spell-${name}-${phase}.wav`);
 });
 assert.deepEqual(played.slice(1),expected);
 sound.playAction('run-grass-left');
 sound.playAction('meal-crunch');
 assert.deepEqual(played.slice(-2),['/resources/audio/action-footstep-1.wav','/resources/audio/action-meal-crunch-1.wav']);
 sound.playAction(UI_SOUND.enemyHover);
 sound.playAction(UI_SOUND.confirm);
 assert.deepEqual(played.slice(-2),['/resources/audio/action-ui-target-hover.wav','/resources/audio/action-ui-confirm.wav']);
 const beforeKicks=played.length;
 for(let i=0;i<5;i++)sound.playAction('kick-effort');
 assert.deepEqual(played.slice(beforeKicks),['ha','hey','huo','ya','ha'].map(name=>`/resources/audio/action-effort-${name}.wav`));
 sound.playAction('scene-transition');
 sound.playAction('battle-encounter');
 for(const theme of ['city','wild','battle','home']){
  sound.setMusic(theme);
  assert.equal(played.at(-1),`/resources/audio/${MUSIC_THEMES[theme]}.mp3`);
  assert.equal(sound.music.loop,true);
 }
 assert.equal(sound.voice,undefined);
 for(const cue of ['pet','feed','sleep','pool'])sound.play(cue);
 for(const foodId of Object.keys(FOODS))sound.playMealReaction(foodId);
 for(const url of requested)assert.ok(approved.has(url.slice(1)),url);
});
