export const UI_SOUND = Object.freeze({
 enemyHover: 'ui-target-hover',
 confirm: 'ui-confirm',
});

export const MUSIC_THEMES={
 home:'garden-theme',
 city:'town-theme',
 wild:'wild-theme',
 battle:'battle-theme',
};

export const ACTION_EFFECTS = {
 [UI_SOUND.enemyHover]: [UI_SOUND.enemyHover, .44],
 [UI_SOUND.confirm]: [UI_SOUND.confirm, .48],
 'jump-effort': ['effort-hey', .42],
 'double-jump-effort': ['effort-ya', .52],
 'flying-kick-effort': ['effort-huo', .52],
 'punch-effort': ['effort-ha', .44],
 'kick-effort': [['effort-ha', 'effort-hey', 'effort-huo', 'effort-ya'], .48],
 'roll-effort': ['effort-hey', .37],
 'slide-effort': ['effort-huo', .38],
 'battle-countdown': ['battle-countdown', .42],
 'scene-transition': ['scene-transition', .44],
 'battle-encounter': ['battle-encounter', .34],
 kick: ['kick-whoosh', .24],
 'kick-whoosh': ['kick-whoosh', .33],
 'punch-whoosh': ['punch-whoosh', .26],
 'punch-finish': ['punch-whoosh', .28],
 land: ['land', .30],
 'crawl-cloth': ['crawl-cloth', .22],
 slide: ['slide-rustle', .26],
 'run-grass-left': ['run-grass-left', .24],
 'run-grass-right': ['run-grass-right', .24],
 'run-hard-left': ['run-hard-left', .20],
 'run-hard-right': ['run-hard-right', .20],
 'meal-soft': ['meal-soft', .82],
 'meal-crunch': ['meal-crunch', .78],
 'spell-wood': ['spell-wood', .48],
};
const SPELL_VOLUMES={frost:.66,storm:.66,meteor:.77,beam:.78,snare:.65,crown:.67,rift:.72,bloom:.66,waterJet:.68};
for(const [id,volume] of Object.entries(SPELL_VOLUMES)){
 const name=id==='waterJet'?'water-jet':id;
 ACTION_EFFECTS[`spell-${id}-release`]=[`spell-${name}-release`,.65];
 ACTION_EFFECTS[`spell-${id}`]=[`spell-${name}-impact`,volume];
}
