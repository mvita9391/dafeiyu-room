// The first six effects follow Elemental Sandbox. Earth and growth use the extended demo as a visual reference.
export const SPELLS = [
  { id: 'frost', damage: 125, impact: 0.38, label: '寒冰长枪', kind: 'line', range: 6, cooldown: 2.6, color: '#8fe9ff', icon: 'M12 2l5 9-5 10-5-10z M12 2v19 M7 11h10' },
  { id: 'storm', damage: 148, impact: 0.08, label: '雷霆之矛', kind: 'line', range: 7, cooldown: 2.8, color: '#9fbdff', icon: 'm14 2-9 12h6l-1 8 9-12h-6z' },
  { id: 'meteor', damage: 280, impact: 0.62, label: '熔火陨星', kind: 'zone', range: 7, radius: 1.6, cooldown: 4.8, color: '#ff975d', icon: 'm5 9 3-6 2 5 8-5-3 7 5-2-2 6 M19 16a6 6 0 1 1-12 0 6 6 0 0 1 12 0z' },
  { id: 'beam', damage: 210, impact: 0.42, label: '新星光束', kind: 'line', range: 8, cooldown: 4, color: '#ffe4a3', icon: 'm3 17 11-7-4 10 11-14-12 5 3-8z' },
  { id: 'snare', damage: 112, impact: 0.24, label: '电弧陷阱', kind: 'zone', range: 7, radius: 2.05, cooldown: 4.4, color: '#c9a2ff', icon: 'M3 15a9 4 0 1 0 18 0 9 4 0 1 0-18 0 M13 3l-5 7h5l-2 5 5-7h-4z' },
  { id: 'crown', damage: 176, impact: 0.34, label: '冰晶王冠', kind: 'zone', range: 7, radius: 1.9, cooldown: 4.2, color: '#a1f5ff', icon: 'm3 6 5 6 4-9 4 9 5-6-3 13H6z M6 16h12' },
  { id: 'rift', damage: 188, impact: 0.38, label: '大地裂击', kind: 'line', range: 6, cooldown: 3.8, color: '#f4b881', icon: 'm2 19 6-11 3 4 4-9 7 16z M13 19l-2-4 5-3' },
  { id: 'bloom', damage: 155, impact: 0.58, label: '自然绽放', kind: 'zone', range: 6, radius: 2, cooldown: 5, color: '#a2ed9a', icon: 'M12 20v-8 M12 12c-11 0-9-10 0-6 9-4 11 6 0 6z M12 17c0-4 5-5 8-4-1 4-4 5-8 4z' },
];
