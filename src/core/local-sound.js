import { FOODS } from '../../shared/world/foods.js';

const ACTION_EFFECTS = {
 kick: ['kick-whoosh', .24],
 'kick-whoosh': ['kick-whoosh', .33],
 'punch-whoosh': ['punch-whoosh', .26],
 'punch-finish': ['punch-whoosh', .28],
 land: ['land', .30],
 'crawl-cloth': ['crawl-cloth', .22],
 slide: ['slide-rustle', .26],
 'run-grass-left': ['run-grass-left', .58],
 'run-grass-right': ['run-grass-right', .58],
 'run-hard-left': ['run-hard-left', .50],
 'run-hard-right': ['run-hard-right', .50],
 'meal-soft': ['meal-soft', .82],
 'meal-crunch': ['meal-crunch', .78],
 'spell-cast': ['spell-cast', .45],
 'spell-frost': ['spell-frost', .66],
 'spell-storm': ['spell-storm', .66],
 'spell-meteor': ['spell-meteor', .77],
 'spell-beam': ['spell-beam', .78],
 'spell-snare': ['spell-snare', .65],
 'spell-crown': ['spell-crown', .67],
 'spell-rift': ['spell-rift', .72],
 'spell-bloom': ['spell-bloom', .66],
 'spell-wood': ['spell-wood', .48],
};
const LOCAL_FOOTSTEP_COUNT = 8;
const localFootstepUrl = index => `/.cache/local-foley/step-${index}.wav`;
const LOCAL_MEAL_CHEW_COUNT = 3;

export class LocalSound {
 mealChewIndex=0;
 constructor({AudioClass=globalThis.Audio}={}){this.AudioClass=AudioClass;this.enabled=false;this.music=new AudioClass('/resources/audio/garden-theme.mp3');this.music.loop=true;this.music.volume=.18;this.actionAudio=new Map();this.voiceVersion=0;}
 setEnabled(enabled){
  this.enabled=enabled;
  if(enabled){
   this.music.volume=.18;
   void Promise.resolve(this.music.play()).catch(()=>{});
   for(const [name] of Object.values(ACTION_EFFECTS))this.actionClip(name);
   if(import.meta.env?.DEV){
    this.localFootstepLoad??=this.loadLocalFootsteps();
    this.flyingKickVoice();
    for(const id of Object.keys(FOODS))this.mealVoice(id);
    for(const cue of ['meal-soft','meal-crunch']){
     for(let index=0;index<LOCAL_MEAL_CHEW_COUNT;index++)this.mealChew(cue,index);
    }
   }
  }else{
   this.voiceVersion++;
   this.music.pause();this.voice?.pause();
   for(const audio of this.actionAudio.values())audio.pause();
  }
 }
 resume(){if(this.enabled&&this.music.paused)void Promise.resolve(this.music.play()).catch(()=>{});}
 play(kind){if(!this.enabled)return;const names={pet:'pet',eat:'feed',feed:'feed',sleep:'sleep',pool:'pool'};const name=names[kind];if(name)this.playVoice(new this.AudioClass(`/resources/audio/${name}.mp3`),.85);}
 flyingKickVoice(){
  if(import.meta.env?.DEV)return this.actionClip('flying-kick-voice','/.cache/local-action-voice/chi-wo-yi-jiao.wav');
 }
 mealVoice(foodId){
  if(import.meta.env?.DEV)return this.actionClip(`meal-voice-${foodId}`,`/.cache/local-meal-voice/${foodId}.wav`);
 }
 mealChew(cue,index){
  if(import.meta.env?.DEV){
   const name=`${cue}-${index+1}`;
   return this.actionClip(`local-${name}`,`/.cache/local-meal-chews/${name}.wav`);
  }
 }
 playMealReaction(foodId){
  if(!import.meta.env?.DEV||!this.enabled||!Object.hasOwn(FOODS,foodId))return;
  const audio=this.mealVoice(foodId);
  if(audio.readyState>=2)this.playVoice(audio,.9);
 }
 async loadLocalFootsteps(){
  if(!import.meta.env?.DEV)return;
  try{
   const response=await fetch(localFootstepUrl(1),{method:'HEAD'});
   if(!response.ok||!response.headers.get('content-type')?.startsWith('audio/'))return;
   this.localFootsteps=Array.from({length:LOCAL_FOOTSTEP_COUNT},(_,index)=>{
    const step=index+1;
    return this.actionClip(`local-step-${step}`,localFootstepUrl(step));
   });
   this.localFootstepIndex=0;
  }catch{
   // The bundled footsteps cover clean checkouts and offline development.
  }
 }
 actionClip(name,url=`/resources/audio/action-${name}.wav`){
  if(!this.actionAudio.has(name)){
   const audio=new this.AudioClass(url);
   audio.preload='auto';
   this.actionAudio.set(name,audio);
  }
  return this.actionAudio.get(name);
 }
 playVoice(audio,volume){
  const version=++this.voiceVersion;
  this.voice?.pause();
  this.voice=audio;audio.currentTime=0;audio.volume=volume;
  this.music.volume=.07;
  const restoreMusic=()=>{if(this.voiceVersion===version)this.music.volume=.18;};
  audio.onended=audio.onerror=restoreMusic;
  void Promise.resolve(audio.play()).catch(restoreMusic);
 }
 playAction(cue){
  if(!this.enabled)return;
  if(import.meta.env?.DEV&&cue==='flying-kick-voice'){
   const audio=this.flyingKickVoice();
   if(audio.readyState>=2)this.playVoice(audio,.9);
   return;
  }
  const effect=ACTION_EFFECTS[cue];
  if(effect){
   const [name,volume]=effect;
   let sample=name.startsWith('run-') && this.localFootsteps?.[this.localFootstepIndex++ % LOCAL_FOOTSTEP_COUNT];
   if(import.meta.env?.DEV&&(name==='meal-soft'||name==='meal-crunch')){
    sample=this.mealChew(name,this.mealChewIndex++ % LOCAL_MEAL_CHEW_COUNT);
   }
   const local=sample?.readyState>=2;
   const audio=local ? sample : this.actionClip(name);
   audio.currentTime=0;
   audio.volume=local&&name.startsWith('run-') ? .78 : volume;
   void Promise.resolve(audio.play()).catch(()=>{});
  }

 }
 dispose(){this.setEnabled(false);this.actionAudio.clear();}
}
