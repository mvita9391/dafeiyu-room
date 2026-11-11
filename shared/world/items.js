// 家园物品定义：背包、地面掉落、堆肥和后续种植共用同一份元数据。
export const ITEMS = Object.freeze({
  poop: Object.freeze({
    id: 'poop',
    name: '便便',
    emoji: '💩',
    description: '宠物在院子里留下的。可以丢回地上，也可以放进农田边的堆肥箱。',
    stackMax: 99,
    placeable: true,
    compostInput: true,
  }),
  fertilizer: Object.freeze({
    id: 'fertilizer',
    name: '肥料',
    emoji: '🌱',
    icon: '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M8.2 10.2h15.6l2.1 15.1c-5.6 2.8-14 2.8-19.8 0z" fill="#aa7545" stroke="#6b4529" stroke-width="1.6" stroke-linejoin="round"/><path d="M10.4 10.2c0-4.1 3-6.5 5.6-6.5s5.6 2.4 5.6 6.5" fill="none" stroke="#6b4529" stroke-width="2" stroke-linecap="round"/><path d="M15.8 15.4c-3.1 2.2-4.1 5.2-3.1 8.2" fill="none" stroke="#86ad5d" stroke-width="2.6" stroke-linecap="round"/><path d="M16.4 17.4c2.7-.9 5-.1 6.4 2-2.5 1.1-4.8.4-6.4-2z" fill="#9bc46e"/><circle cx="12.3" cy="20.4" r="1.05" fill="#dcc08a"/><circle cx="18.8" cy="23.2" r="1.05" fill="#dcc08a"/><circle cx="14.2" cy="24.1" r="1.05" fill="#dcc08a"/></svg>',
    description: '堆肥产物。等种植系统接入后，施肥时使用。',
    stackMax: 99,
    placeable: false,
    compostInput: false,
  }),
});

export const ITEM_IDS = Object.freeze(Object.keys(ITEMS));

export function getItemDef(id) {
  return ITEMS[id] ?? null;
}
