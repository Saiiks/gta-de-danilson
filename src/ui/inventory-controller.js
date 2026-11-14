import { INVENTORY_CAPACITY, INVENTORY_COLUMNS } from '../core/inventory.js';

export class InventoryController {
  constructor() {
    this.screen = document.getElementById('inventory-screen');
    this.titleEl = document.getElementById('inventory-title');
    this.subtitleEl = document.getElementById('inventory-subtitle');
    this.countEl = document.getElementById('inventory-count');
    this.gridEl = document.getElementById('inventory-grid');
    this.detailNameEl = document.getElementById('inventory-detail-name');
    this.detailDescEl = document.getElementById('inventory-detail-desc');
    this.feedbackEl = document.getElementById('inventory-feedback');
    this.deliverBtn = document.getElementById('inventory-deliver-btn');
    this.closeBtn = document.getElementById('inventory-close-btn');

    this.isOpen = false;
    this.mode = 'browse';
    this.inventory = null;
    this.selectedIndex = 0;
    this.expectedItemId = '';
    this.wrongItemMessage = '';
    this.onDeliver = null;
    this.onClose = null;

    this.prevLeft = false;
    this.prevRight = false;
    this.prevUp = false;
    this.prevDown = false;
    this.prevAction = false;
    this.prevSecondary = false;

    this.deliverBtn?.addEventListener('click', () => this.confirmDelivery());
    this.closeBtn?.addEventListener('click', () => this.close());
  }

  openBrowse(inventory, onClose = null) {
    this.inventory = inventory;
    this.mode = 'browse';
    this.expectedItemId = '';
    this.wrongItemMessage = '';
    this.onDeliver = null;
    this.onClose = onClose;

    this.titleEl.textContent = 'INVENTÁRIO';
    this.subtitleEl.textContent = 'Selecione um item para ver os detalhes.';
    this.deliverBtn.classList.add('hidden');
    this.closeBtn.textContent = 'Fechar';
    this.#hideFeedback();
    this.#selectInitialSlot();
    this.#openScreen();
  }

  openDelivery(inventory, options = {}) {
    const {
      prompt = 'Selecione o item correto para entregar:',
      expectedItemId = '',
      wrongItemMessage = 'Não é esse item que o personagem procura. Tente outro!',
      onDeliver = null,
      onCancel = null,
    } = options;

    this.inventory = inventory;
    this.mode = 'delivery';
    this.expectedItemId = expectedItemId;
    this.wrongItemMessage = wrongItemMessage;
    this.onDeliver = onDeliver;
    this.onClose = onCancel;

    this.titleEl.textContent = 'ENTREGAR ITEM';
    this.subtitleEl.textContent = prompt;
    this.deliverBtn.classList.remove('hidden');
    this.closeBtn.textContent = 'Voltar';
    this.#hideFeedback();
    this.#selectInitialSlot();
    this.#openScreen();
  }

  #openScreen() {
    this.isOpen = true;
    this.prevAction = true;
    this.prevSecondary = true;
    this.prevLeft = false;
    this.prevRight = false;
    this.prevUp = false;
    this.prevDown = false;
    this.render();
    this.screen.classList.remove('hidden');
  }

  #selectInitialSlot() {
    const slots = this.inventory?.getSlots() || [];
    const firstOccupied = slots.findIndex(Boolean);
    this.selectedIndex = firstOccupied >= 0 ? firstOccupied : 0;
  }

  #showFeedback(message) {
    if (!this.feedbackEl) return;
    this.feedbackEl.textContent = message;
    this.feedbackEl.classList.remove('hidden');
  }

  #hideFeedback() {
    if (!this.feedbackEl) return;
    this.feedbackEl.textContent = '';
    this.feedbackEl.classList.add('hidden');
  }

  selectSlot(index) {
    const cap = this.inventory?.capacity || INVENTORY_CAPACITY;
    this.selectedIndex = Math.max(0, Math.min(cap - 1, index));
    this.#hideFeedback();
    this.render();
  }

  confirmDelivery() {
    if (!this.isOpen || this.mode !== 'delivery' || !this.inventory) return;
    const item = this.inventory.getItemAt(this.selectedIndex);
    if (!item) {
      this.#showFeedback('Selecione um espaço com item para entregar.');
      return;
    }
    if (this.expectedItemId && item.id !== this.expectedItemId) {
      this.#showFeedback(this.wrongItemMessage || 'Não é esse item que o personagem procura.');
      return;
    }

    const removed = this.inventory.removeItemAt(this.selectedIndex);
    const deliverCb = this.onDeliver;
    this.isOpen = false;
    this.onDeliver = null;
    this.onClose = null;
    this.screen.classList.add('hidden');
    deliverCb?.(removed.item || item);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.screen.classList.add('hidden');
    const cb = this.onClose;
    this.onClose = null;
    this.onDeliver = null;
    cb?.();
  }

  render() {
    if (!this.gridEl || !this.inventory) return;
    const slots = this.inventory.getSlots();
    const count = this.inventory.getCount();
    this.countEl.textContent = `${count} / ${this.inventory.capacity}`;

    this.gridEl.replaceChildren();
    slots.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inventory-slot';
      if (item) btn.classList.add('occupied');
      if (idx === this.selectedIndex) btn.classList.add('selected');
      btn.setAttribute('role', 'gridcell');
      btn.setAttribute('aria-label', item ? item.name : `Espaço ${idx + 1} vazio`);

      if (item) {
        if (item.imageUrl) {
          const img = document.createElement('img');
          img.className = 'inventory-slot-img';
          img.src = item.imageUrl;
          img.alt = item.name;
          btn.appendChild(img);
        }
        const label = document.createElement('span');
        label.className = 'inventory-slot-name';
        label.textContent = item.name;
        btn.appendChild(label);
      } else {
        const emptyMark = document.createElement('span');
        emptyMark.className = 'inventory-slot-empty';
        emptyMark.textContent = String(idx + 1);
        btn.appendChild(emptyMark);
      }

      btn.addEventListener('click', () => {
        if (this.mode === 'delivery' && idx === this.selectedIndex && item) {
          this.confirmDelivery();
        } else {
          this.selectSlot(idx);
        }
      });

      this.gridEl.appendChild(btn);
    });

    const selected = this.inventory.getItemAt(this.selectedIndex);
    if (selected) {
      this.detailNameEl.textContent = selected.name;
      this.detailDescEl.textContent = selected.description || 'Item de missão.';
    } else {
      this.detailNameEl.textContent = 'Espaço vazio';
      this.detailDescEl.textContent = 'Nenhum item guardado neste espaço.';
    }
  }

  updateInput(inputState) {
    if (!this.isOpen || !this.inventory) return;
    const left = Boolean(inputState.moveX < -0.5);
    const right = Boolean(inputState.moveX > 0.5);
    const up = Boolean(inputState.moveY < -0.5);
    const down = Boolean(inputState.moveY > 0.5);
    const action = Boolean(inputState.actionPressed ?? inputState.action);
    const secondary = Boolean(inputState.secondary);

    const cap = this.inventory.capacity;
    if (left && !this.prevLeft) {
      this.selectSlot((this.selectedIndex - 1 + cap) % cap);
    } else if (right && !this.prevRight) {
      this.selectSlot((this.selectedIndex + 1) % cap);
    } else if (up && !this.prevUp) {
      this.selectSlot((this.selectedIndex - INVENTORY_COLUMNS + cap) % cap);
    } else if (down && !this.prevDown) {
      this.selectSlot((this.selectedIndex + INVENTORY_COLUMNS) % cap);
    }

    if (action && !this.prevAction) {
      if (this.mode === 'delivery') {
        this.confirmDelivery();
      } else {
        this.close();
      }
    } else if (secondary && !this.prevSecondary) {
      this.close();
    }

    this.prevLeft = left;
    this.prevRight = right;
    this.prevUp = up;
    this.prevDown = down;
    this.prevAction = action;
    this.prevSecondary = secondary;
  }
}
