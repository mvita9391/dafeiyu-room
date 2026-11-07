// Needs are bounded, deterministic, and contain no autonomous decision making.
export function advanceNeeds(actor,elapsedMs){
 actor.needs??={hunger:30,energy:80,happiness:70};
 const ticks=Math.min(Math.max(0,elapsedMs),1800000)/100;
 actor.needs.hunger=Math.min(100,actor.needs.hunger+ticks*.002);
 actor.needs.energy=Math.max(0,actor.needs.energy-ticks*.001);
}
