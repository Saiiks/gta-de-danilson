import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Inventory,
  INVENTORY_CAPACITY,
  INVENTORY_COLUMNS,
  INVENTORY_ROWS,
} from '../src/core/inventory.js';
import { CityMap } from '../src/world/city-map.js';
import {
  parseStoryManifest,
  parseItemMarkdown,
  parseMissionMarkdown,
  StoryParseError,
} from '../src/story/story-parser.js';
import { collectStoryAssetUrls } from '../src/story/story-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storyDir = path.resolve(__dirname, '../story');

test('inventário possui grade 4x5 (20 slots) e rejeita adição quando cheio', () => {
  assert.equal(INVENTORY_COLUMNS, 4);
  assert.equal(INVENTORY_ROWS, 5);
  assert.equal(INVENTORY_CAPACITY, 20);

  const inv = new Inventory();
  assert.equal(inv.capacity, 20);
  assert.equal(inv.getCount(), 0);
  assert.equal(inv.isFull(), false);

  for (let i = 0; i < 20; i += 1) {
    const res = inv.addItem({
      id: `item-${i}`,
      name: `Item ${i}`,
      description: 'Teste',
      imageUrl: `./story/assets/item-${i}.svg`,
    });
    assert.equal(res.ok, true);
    assert.equal(res.slotIndex, i);
  }

  assert.equal(inv.getCount(), 20);
  assert.equal(inv.isFull(), true);

  const overflow = inv.addItem({ id: 'extra', name: 'Extra' });
  assert.equal(overflow.ok, false);
  assert.equal(overflow.reason, 'inventory_full');

  const removed = inv.removeItem('item-3');
  assert.equal(removed.ok, true);
  assert.equal(removed.slotIndex, 3);
  assert.equal(inv.getCount(), 19);
  assert.equal(inv.hasItem('item-3'), false);

  const refill = inv.addItem({ id: 'novo', name: 'Novo' });
  assert.equal(refill.ok, true);
  assert.equal(refill.slotIndex, 3);
});

test('parser de itens e missões lê story/items/ e valida entrega da caixa secreta na missão 01', () => {
  const cityMap = new CityMap();
  const manifest = parseStoryManifest(fs.readFileSync(path.join(storyDir, 'story.md'), 'utf8'), 'story.md');
  assert.ok(manifest.items.includes('caixa-secreta'));

  const itemsMap = new Map();
  for (const itemId of manifest.items) {
    const raw = fs.readFileSync(path.join(storyDir, 'items', `${itemId}.md`), 'utf8');
    const itemDef = parseItemMarkdown(raw, `items/${itemId}.md`);
    assert.equal(itemDef.id, itemId);
    assert.ok(itemDef.name);
    assert.ok(itemDef.image);
    assert.equal(fs.existsSync(path.join(storyDir, itemDef.image)), true, `Imagem ausente: ${itemDef.image}`);
    itemsMap.set(itemDef.id, { ...itemDef, imageUrl: `./story/${itemDef.image}` });
  }

  const mission1 = parseMissionMarkdown(
    fs.readFileSync(path.join(storyDir, 'missions', '01-caixa-secreta.md'), 'utf8'),
    'missions/01-caixa-secreta.md',
    cityMap,
  );
  assert.equal(mission1.pickupLocation, 'PRACA-01');
  assert.equal(mission1.giveItem, 'caixa-secreta');
  assert.equal(mission1.requireItem, 'caixa-secreta');
  assert.ok(mission1.deliveryPrompt.length > 0);
  assert.ok(mission1.wrongItemMessage.length > 0);
  assert.ok(mission1.outroCutscene.steps.some((step) => step.type === 'deliver' && step.itemId === 'caixa-secreta'));

  const assetUrls = collectStoryAssetUrls({ items: itemsMap, characters: new Map(), missions: [] });
  assert.ok(assetUrls.includes('./story/assets/item-caixa-secreta.svg'));
});

test('rejeita item sem campos obrigatórios ou caminho de imagem externo', () => {
  assert.throws(
    () => parseItemMarkdown('---\nid: sem-nome\n---\n', 'items/bad.md'),
    (err) => err instanceof StoryParseError,
  );
  assert.throws(
    () => parseItemMarkdown('---\nid: ext\nname: Externo\nimage: https://evil.com/a.png\n---\n', 'items/ext.md'),
    (err) => err instanceof StoryParseError,
  );
});
