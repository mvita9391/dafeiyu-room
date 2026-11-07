import { FOODS } from '../../shared/world/foods.js';
import { FURNITURE } from '../world/props.js';
import { appendCatalogPreview } from './catalog-preview.js';

export function mountFoodPicker({ entry, onOpen, onChoose }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'food-picker';
  dialog.className = 'settings-dialog food-picker';
  dialog.setAttribute('aria-labelledby', 'food-picker-title');
  dialog.innerHTML = `<div class="settings-card"><header class="settings-header">
    <h2 id="food-picker-title">选一份食物</h2>
    <button class="settings-close" type="button" aria-label="关闭食物选择">×</button>
  </header><div class="food-grid"></div></div>`;
  document.body.append(dialog);
  entry.setAttribute('aria-haspopup', 'dialog');
  entry.setAttribute('aria-controls', dialog.id);
  const grid = dialog.querySelector('.food-grid');
  dialog.querySelector('.settings-close').onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', event => event.stopPropagation());
  return {
    get isOpen() { return dialog.open; },
    open() {
      if (dialog.open) return;
      grid.replaceChildren();
      for (const [foodId, food] of Object.entries(FOODS)) {
        const asset = food.asset ? FURNITURE[food.asset] : null;
        if (food.asset && !asset) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.food = foodId;
        appendCatalogPreview(button, {
          ...asset,
          label: food.label,
          thumbnailURL: food.asset ? asset.thumbnailURL : './food-previews/rice.webp',
        });
        button.onclick = () => {
          dialog.close();
          onChoose(foodId);
        };
        grid.append(button);
      }
      onOpen();
      dialog.showModal();
    },
  };
}
