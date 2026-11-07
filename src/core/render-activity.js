// A suspended view has no queued animation frames, even if Electron keeps timers alive.
export function createRenderActivity(active, {
 requestFrame = callback=>globalThis.requestAnimationFrame(callback),
 cancelFrame = id=>globalThis.cancelAnimationFrame(id),
} = {}) {
 const listeners = new Set();
 const subscribe = callback => {
  listeners.add(callback);
  callback(active);
  return () => listeners.delete(callback);
 };
 return {
  get active() { return active; },
  setActive(next) {
   if(next===active)return;
   active=next;
   for(const callback of listeners)callback(active);
  },
  subscribe,
  loop(render) {
   let id=null,stopped=false;
   const schedule=()=>{if(active&&!stopped&&id===null)id=requestFrame(frame);};
   const cancel=()=>{if(id!==null){cancelFrame(id);id=null;}};
   const frame=time=>{
    id=null;
    if(!active||stopped)return;
    render(time);
    schedule();
   };
   const unsubscribe=subscribe(running=>running?schedule():cancel());
   return ()=>{stopped=true;cancel();unsubscribe();};
  },
 };
}
