export const INVENTORY_COLUMNS = 5;
export const INVENTORY_ROWS = 1;
export const INVENTORY_CAPACITY = INVENTORY_COLUMNS * INVENTORY_ROWS;

export class Inventory {
  constructor(capacity = INVENTORY_CAPACITY) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.slots = new Array(this.capacity).fill(null);
  }

  getCount() {
    let count = 0;
    for (const slot of this.slots) {
      if (slot) count += 1;
    }
    return count;
  }

  isFull() {
    return this.getCount() >= this.capacity;
  }

  getSlots() {
    return this.slots.map((item) => (item ? { ...item } : null));
  }

  getItemAt(index) {
    if (index < 0 || index >= this.capacity) return null;
    const item = this.slots[index];
    return item ? { ...item } : null;
  }

  hasItem(itemId) {
    if (!itemId) return false;
    return this.slots.some((slot) => slot?.id === itemId);
  }

  findSlotIndex(itemId) {
    if (!itemId) return -1;
    return this.slots.findIndex((slot) => slot?.id === itemId);
  }

  addItem(itemDef) {
    if (!itemDef || !itemDef.id) {
      return { ok: false, reason: 'invalid_item', slotIndex: -1 };
    }
    const freeIndex = this.slots.findIndex((slot) => slot === null);
    if (freeIndex === -1) {
      return { ok: false, reason: 'inventory_full', slotIndex: -1 };
    }
    this.slots[freeIndex] = {
      id: String(itemDef.id),
      name: String(itemDef.name || itemDef.id),
      description: String(itemDef.description || ''),
      imageUrl: String(itemDef.imageUrl || ''),
    };
    return { ok: true, reason: 'added', slotIndex: freeIndex };
  }

  removeItem(itemId) {
    const index = this.findSlotIndex(itemId);
    if (index === -1) {
      return { ok: false, item: null, slotIndex: -1 };
    }
    const removed = this.slots[index];
    this.slots[index] = null;
    return { ok: true, item: removed, slotIndex: index };
  }

  removeItemAt(index) {
    if (index < 0 || index >= this.capacity || !this.slots[index]) {
      return { ok: false, item: null, slotIndex: -1 };
    }
    const removed = this.slots[index];
    this.slots[index] = null;
    return { ok: true, item: removed, slotIndex: index };
  }

  clear() {
    this.slots.fill(null);
  }
}
