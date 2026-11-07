// Playback only: the agent supplies audio. No microphone or speech synthesis.
export class AudioPlayer {
 constructor({api,AudioClass=globalThis.Audio,clientId=crypto.randomUUID()}={}){Object.assign(this,{api,AudioClass,clientId});this.enabled=false;this.generation=0;this.current=null;}
 cancel(){this.generation++;if(this.current){this.current.audio.pause();this.current.audio.removeAttribute?.('src');this.current.audio.load?.();this.current=null;}clearTimeout(this.deadline);}
 async setEnabled(enabled){this.enabled=enabled;if(!enabled)this.cancel();await this.tick();}
 async tick(){const generation=this.generation;try{const state=await this.api('/api/audio/poll',{clientId:this.clientId,enabled:this.enabled});if(generation!==this.generation)return;if(!state.leader||!this.enabled||!state.item){this.cancel();return;}const item=state.item;if(this.current?.id===item.playbackId)return;this.cancel();const token=this.generation,audio=new this.AudioClass(item.url);this.current={id:item.playbackId,audio};const active=()=>token===this.generation;let acknowledgements=Promise.resolve();const ack=status=>{if(!active())return;acknowledgements=acknowledgements.then(()=>this.api('/api/audio/'+item.playbackId+'/ack',{clientId:this.clientId,status})).catch(()=>{});return acknowledgements;};const blocked=()=>{if(!active())return;void ack('blocked');this.cancel();};audio.onloadedmetadata=()=>{if(!Number.isFinite(audio.duration)||audio.duration>60)blocked();};audio.onplaying=()=>{if(!active()){audio.pause();return;}if(!Number.isFinite(audio.duration)||audio.duration>60){blocked();return;}void ack('started');clearTimeout(this.deadline);this.deadline=setTimeout(blocked,60000);};audio.onended=()=>{if(!active())return;void ack('finished');this.cancel();};audio.onerror=blocked;this.deadline=setTimeout(blocked,60000);try{Promise.resolve(audio.play()).then(()=>{if(!active())audio.pause();},blocked);}catch{blocked();}}catch{this.cancel();}}
 start(){this.timer=setInterval(()=>{if(!this.busy){this.busy=true;this.tick().finally(()=>this.busy=false);}},1000);}
 dispose(){clearInterval(this.timer);this.cancel();}
}
export function mountAudioPlayer(client,localSound,button){
 const player=new AudioPlayer({api:(...args)=>client.api(...args)});
 const setEnabled=enabled=>{button.textContent=enabled?'静音':'开启声音';localSound?.setEnabled(enabled);void player.setEnabled(enabled);};
 button.disabled=false;
 button.onclick=()=>setEnabled(!player.enabled);
 // Retry blocked autoplay in a user gesture, without overriding a manual mute.
 const resume=()=>{if(player.enabled)localSound?.resume();};
 window.addEventListener('pointerdown',resume);window.addEventListener('keydown',resume);
 setEnabled(true);player.start();
 window.addEventListener('pagehide',()=>{window.removeEventListener('pointerdown',resume);window.removeEventListener('keydown',resume);player.dispose();localSound?.dispose();},{once:true});return player;
}
