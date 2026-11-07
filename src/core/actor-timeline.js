// Render between received authoritative samples instead of repeatedly easing
// toward a stationary target. Never extrapolate beyond known world positions.
export class ActorTimeline {
  constructor({delayMs=250}={}) { this.delayMs=delayMs;this.samples=[]; }
  push(actor,time) {
    const value={...actor,position:[...actor.position],time};
    const last=this.samples.at(-1);
    if(last&&time<last.time)return;
    if(!last||last.sceneId!==actor.sceneId||Math.hypot(...actor.position.map((v,i)=>v-last.position[i]))>3)this.samples=[];
    if(this.samples.at(-1)?.time===time)this.samples.pop();
    this.samples.push(value);
    while(this.samples.length>2&&this.samples[1].time<time-2000)this.samples.shift();
  }
  // Seed the current render time with the final acknowledged keyboard position.
  // Otherwise releasing local prediction exposes buffered pre-doorway samples.
  handoff(actor,now){this.samples=[];this.push(actor,now-this.delayMs);}
  sample(now) {
    if(!this.samples.length)return null;
    const time=now-this.delayMs;
    let a=this.samples[0],b=a;
    for(const value of this.samples){if(value.time<=time)a=value;else{b=value;break;}b=a;}
    const duration=b.time-a.time;
    const alpha=duration>0?Math.max(0,Math.min(1,(time-a.time)/duration)):0;
    const position=a.position.map((v,i)=>v+(b.position[i]-v)*alpha);
    const speed=duration>0?Math.hypot(b.position[0]-a.position[0],b.position[2]-a.position[2])*1000/duration:0;
    const angle=Math.atan2(Math.sin(b.rotation-a.rotation),Math.cos(b.rotation-a.rotation));
    const maneuver=a.maneuver&&b.maneuver?.actionId===a.maneuver.actionId
      ? {...a.maneuver,elapsed:a.maneuver.elapsed+(b.maneuver.elapsed-a.maneuver.elapsed)*alpha}
      : a.maneuver;
    return {...a,position,rotation:a.rotation+angle*alpha,moving:speed>.02,speed,maneuver};
  }
}
