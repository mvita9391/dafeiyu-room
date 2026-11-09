import test from 'node:test';import assert from 'node:assert/strict';import {LocalSound} from '../src/core/local-sound.js';
test('sound requires opt-in, music loops, action speech replaces previous and mute stops both',()=>{class Audio{constructor(url){this.url=url;}play(){this.played=true;return Promise.resolve();}pause(){this.paused=true;}}const s=new LocalSound({AudioClass:Audio});s.play('eat');assert.equal(s.voice,undefined);s.setEnabled(true);assert.equal(s.music.loop,true);assert.equal(s.music.played,true);s.play('eat');assert.match(s.voice.url,/feed.mp3$/);const old=s.voice;s.play('sleep');assert.equal(old.paused,true);assert.match(s.voice.url,/sleep.mp3$/);s.setEnabled(false);assert.equal(s.music.paused,true);assert.equal(s.voice.paused,true);});

test('pool speech is reserved for actual transformation, not swim or slide commands',()=>{class Audio{constructor(url){this.url=url;}play(){return Promise.resolve();}pause(){}}const s=new LocalSound({AudioClass:Audio});s.setEnabled(true);s.play('slide');s.play('swim');assert.equal(s.voice,undefined);s.play('pool');assert.match(s.voice.url,/pool.mp3$/);});
test('battle water jet plays a splash through the effect channel',async()=>{
 const {readFileSync}=await import('node:fs');
 const vm=await import('node:vm');
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 class Audio{constructor(url){this.url=url;}play(){this.played=true;return Promise.resolve();}pause(){}}
 const localSound=new LocalSound({AudioClass:Audio});
 localSound.setEnabled(true);
 const start=source.indexOf('const baizeBattle=mountBaizeBattle(');
 const end=source.indexOf('client.onSnapshot(',start);
 const cue=vm.runInNewContext(source.slice(start,end)+'\nbaizeBattle.playSound', {
  client:{},original:{},localSound,mountBaizeBattle:(_client,options)=>options,
 });
 cue('spell-waterJet-release');
 assert.equal(localSound.actionClip('spell-water-jet-release').played,true);
 cue('spell-waterJet');
 assert.equal(localSound.voice,undefined);
 assert.equal(localSound.actionClip('spell-water-jet-impact').played,true);
});
test('meal reactions and flying kick use bundled clips outside Vite development',()=>{
 class Audio {
  constructor(url){this.url=url;this.readyState=0;this.paused=true;}
  play(){this.paused=false;return Promise.resolve();}
  pause(){this.paused=true;}
 }
 const sound=new LocalSound({AudioClass:Audio});
 sound.setEnabled(true);
 sound.playMealReaction('rice');
 const meal=sound.voice;
 assert.equal(meal?.url,'/resources/audio/action-meal-voice-rice.wav');
 assert.equal(meal.paused,false);
 sound.playAction('flying-kick-effort');
 const kick=sound.actionClip('effort-huo');
 assert.equal(kick.url,'/resources/audio/action-effort-huo.wav');
 assert.equal(kick.paused,false);
 assert.equal(meal.paused,false);
 sound.setEnabled(false);
 assert.equal(sound.voice.paused,true);
 assert.equal(kick.paused,true);
});
test('movement actions play effects without speech, and effects stop on mute',()=>{
 class Audio {
  constructor(url){this.url=url;this.paused=true;}
  play(){this.paused=false;return Promise.resolve();}
  pause(){this.paused=true;}
 }
 const sound=new LocalSound({AudioClass:Audio});
 sound.playAction('kick');assert.equal(sound.actionAudio.size,0);
 sound.setEnabled(true);
 sound.playAction('kick');
 const effect=sound.actionClip('kick-whoosh');
 assert.equal(effect.paused,false);
 sound.playAction('land');assert.equal(sound.voice,undefined);
 sound.setEnabled(false);
 assert.equal(effect.paused,true);
 assert.equal(sound.actionClip('land').paused,true);
});
test('actual render path plays transformation speech once per human-to-whale switch',async()=>{
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const {waterAt}=await import('../shared/world/water.js');
 const calls=[],original={group:{position:{},visible:true}},blob={group:{position:{y:0},visible:false},pos:{y:0}};
 let visual={form:'normal',pose:'idle'};
 const context={client:{snapshot:{}},poolAt:()=>null,waterAt,activeComputerDisplay:null,fpActive:false,thirdActive:false,sprintHeld:false,sprintToggle:false,crawling:false,runningJump:false,travelAction:null,actor:{position:[0,0,0]},player:{sample:()=>visual},actorTimeline:{},performance:{now:()=>0},original,blob,whale:original,game:{},window:{},localSound:{play:kind=>calls.push(kind)},fx:{splash(){},trackFootsteps(){}},THREE:{Vector3:class{}},presentActor(){},registry:{seatOffset(){},scenes:new Map([['room',{template:{kind:'indoor'}}]])},activeScene:'room',renderPosition:{copy(){}},editor:null};
 Object.assign(context,{forestLighting:false,swimDepth:0,renderedSpellCast:null});
 context.THREE.MathUtils={damp:()=>0};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function renderActor('),source.indexOf('R.setScene(')),context);
 context.renderActor(.016,1);visual={form:'swim',pose:'swimming'};context.renderActor(.016,2);context.renderActor(.016,3);assert.deepEqual(calls,['pool']);
 visual={form:'normal',pose:'idle'};context.renderActor(.016,4);assert.deepEqual(calls,['pool']);visual={form:'swim',pose:'swimming'};context.renderActor(.016,5);assert.deepEqual(calls,['pool','pool']);
 context.forestLighting=true;
 context.client.snapshot={scenes:[{sceneId:'forest',templateId:'forest_v1'}],entities:[]};
 visual={sceneId:'forest',position:[91,11.2,-9],form:'swim',pose:'swimming',grounded:true};
 assert.equal(context.renderActor(.016,6).form,'normal');
 assert.equal(context.window.__whale,original);
 visual={...visual,grounded:false};
 assert.equal(context.renderActor(.016,7).pose,'jumping');
 assert.deepEqual(calls,['pool','pool']);
});
