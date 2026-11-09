import { FOODS } from '../../shared/world/foods.js';
import { ACTION_EFFECTS, MUSIC_THEMES } from './sound-dictionary.js';

const FOOTSTEP_COUNT=8;
const MEAL_CHEW_COUNT=3;
const CHEW_CUES=['meal-soft','meal-crunch'];

export class LocalSound {
 mealChewIndex=0;
 footstepIndex=0;
 kickEffortIndex=0;
 constructor({AudioClass=globalThis.Audio}={}){this.AudioClass=AudioClass;this.enabled=false;this.actionAudio=new Map();this.voiceVersion=0;this.setMusic('home');}
 setMusic(theme){
  if(theme===this.musicTheme||!Object.hasOwn(MUSIC_THEMES,theme))return;
  this.music?.pause();
  this.musicTheme=theme;
  this.music=new this.AudioClass(`/resources/audio/${MUSIC_THEMES[theme]}.mp3`);
  this.music.loop=true;
  this.music.volume=this.musicDucked ? .07 : .18;
  if(this.enabled)void Promise.resolve(this.music.play()).catch(()=>{});
 }
 setEnabled(enabled){
  this.enabled=enabled;
  if(enabled){
   this.music.volume=.18;
   void Promise.resolve(this.music.play()).catch(()=>{});
   for(const [clip] of Object.values(ACTION_EFFECTS)){
    for(const name of Array.isArray(clip)?clip:[clip])this.actionClip(name);
   }
   for(const id of Object.keys(FOODS))this.mealVoice(id);
   for(let i=1;i<=FOOTSTEP_COUNT;i++)this.actionClip(`footstep-${i}`);
   for(const cue of CHEW_CUES)for(let i=1;i<=MEAL_CHEW_COUNT;i++)this.actionClip(`${cue}-${i}`);
  }else{
   this.voiceVersion++;
   this.musicDucked=false;
   this.music.pause();this.voice?.pause();
   for(const audio of this.actionAudio.values())audio.pause();
  }
 }
 resume(){if(this.enabled&&this.music.paused)void Promise.resolve(this.music.play()).catch(()=>{});}
 play(kind){if(!this.enabled)return;const names={pet:'pet',eat:'feed',feed:'feed',sleep:'sleep',pool:'pool'};const name=names[kind];if(name)this.playVoice(new this.AudioClass(`/resources/audio/${name}.mp3`),.85);}
 mealVoice(foodId){
  return this.actionClip(`meal-voice-${foodId}`);
 }
 playMealReaction(foodId){
  if(!this.enabled||!Object.hasOwn(FOODS,foodId))return;
  this.playVoice(this.mealVoice(foodId),.9);
 }
 actionClip(name){
  if(!this.actionAudio.has(name)){
   const audio=new this.AudioClass(`/resources/audio/action-${name}.wav`);
   audio.preload='auto';
   this.actionAudio.set(name,audio);
  }
  return this.actionAudio.get(name);
 }
 playVoice(audio,volume){
  const version=++this.voiceVersion;
  this.voice?.pause();
  this.voice=audio;audio.currentTime=0;audio.volume=volume;
  this.musicDucked=true;
  this.music.volume=.07;
  const restoreMusic=()=>{if(this.voiceVersion===version){this.musicDucked=false;this.music.volume=.18;}};
  audio.onended=audio.onerror=restoreMusic;
  void Promise.resolve(audio.play()).catch(restoreMusic);
 }
 playAction(cue){
  if(!this.enabled)return;
  const effect=ACTION_EFFECTS[cue];
  if(effect){
   const [clip,volume]=effect;
   const name=Array.isArray(clip)?clip[this.kickEffortIndex++ % clip.length]:clip;
   let sample;
   const footstep=name.startsWith('run-');
   if(footstep)sample=this.actionClip(`footstep-${this.footstepIndex++ % FOOTSTEP_COUNT+1}`);
   if(CHEW_CUES.includes(name))sample=this.actionClip(`${name}-${this.mealChewIndex++ % MEAL_CHEW_COUNT+1}`);
   const ready=sample?.readyState>=2;
   const audio=ready?sample:this.actionClip(name);
   audio.currentTime=0;
   audio.volume=ready&&footstep ? .25 : volume;
   void Promise.resolve(audio.play()).catch(()=>{});
  }

 }
 dispose(){this.setEnabled(false);this.actionAudio.clear();}
}
