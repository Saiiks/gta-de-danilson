import test from 'node:test';
import assert from 'node:assert/strict';
import { CityMap } from '../src/world/city-map.js';
import { TrafficManager } from '../src/world/traffic-manager.js';

test('gera cidade-base 30x30 com códigos únicos de ruas, casas, comércios e praças', () => {
  const map = new CityMap();
  assert.equal(map.blocks.length, 30);
  assert.equal(map.blocks[0].length, 30);

  const rua1 = map.resolveLocationCode('RUA-01');
  const casa1 = map.resolveLocationCode('CASA-01');
  const com1 = map.resolveLocationCode('COM-01');
  const praca1 = map.resolveLocationCode('PRACA-01');

  assert.equal(rua1.type, 'road');
  assert.equal(casa1.type, 'house');
  assert.equal(com1.type, 'commerce');
  assert.equal(praca1.type, 'plaza');

  assert.ok(casa1.interior.walls.length > 0);
  assert.ok(casa1.roofRect.w > 0);
  assert.ok(casa1.doormat.w > 0);

  const uniqueWidths = new Set(map.colWidths);
  const uniqueHeights = new Set(map.rowHeights);
  assert.ok(uniqueWidths.size > 1);
  assert.ok(uniqueHeights.size > 1);
});

test('sinaliza erro descritivo ao resolver código de local inexistente', () => {
  const map = new CityMap();
  assert.throws(() => map.resolveLocationCode('NAO-EXISTE-99'), /Código de local inexistente/);
  assert.throws(() => map.resolveLocationCode(''), /Código de local inválido/);
});

test('identifica entrada em interior térreo pelo getLocationAt', () => {
  const map = new CityMap();
  const casa = map.resolveLocationCode('CASA-01');
  const centerX = casa.bounds.x + casa.bounds.w * 0.5;
  const centerY = casa.bounds.y + casa.bounds.h * 0.5;

  const detected = map.getLocationAt(centerX, centerY);
  assert.equal(detected?.code, 'CASA-01');
});

test('gera veículos variados de cada tipo (carro, moto, van)', () => {
  const map = new CityMap();
  const kinds = new Set(map.vehicleSpawns.map((v) => v.kind));
  assert.ok(kinds.has('car'));
  assert.ok(kinds.has('moto'));
  assert.ok(kinds.has('van'));
});

test('gera hospitais espalhados pela cidade com telhado branco e interior acessível', () => {
  const map = new CityMap();
  const hospitals = [];
  for (const row of map.blocks) {
    for (const block of row) {
      for (const b of block.buildings) {
        if (b.type === 'hospital') hospitals.push(b);
      }
    }
  }

  assert.equal(hospitals.length, 40);
  const hosp1 = map.resolveLocationCode('HOSP-01');
  const hosp40 = map.resolveLocationCode('HOSP-40');
  assert.equal(hosp40.type, 'hospital');
  assert.equal(hosp1.type, 'hospital');
  assert.equal(hosp1.roofColor, '#ffffff');
  assert.ok(hosp1.interior.walls.length > 0);

  const detected = map.getLocationAt(
    hosp1.bounds.x + hosp1.bounds.w * 0.5,
    hosp1.bounds.y + hosp1.bounds.h * 0.5
  );
  assert.equal(detected?.code, 'HOSP-01');
  assert.equal(detected?.type, 'hospital');

  // Garante que locais usados pelas missões continuam válidos
  for (const code of ['CASA-01', 'COM-01', 'COM-24', 'COM-320', 'CASA-353', 'COM-554', 'CASA-656']) {
    assert.ok(map.resolveLocationCode(code));
  }
});

test('resolveItemLocation posiciona itens em praças, interiores e esquinas entre duas ruas', () => {
  const map = new CityMap();
  const plazaPt = map.resolveItemLocation('PRACA-03');
  assert.equal(plazaPt.kind, 'plaza');
  assert.ok(Number.isFinite(plazaPt.x) && Number.isFinite(plazaPt.y));

  const interiorPt = map.resolveItemLocation('HOSP-05');
  assert.equal(interiorPt.kind, 'interior');
  assert.equal(interiorPt.code, 'HOSP-05');

  const cornerPt = map.resolveItemLocation('RUA-04 x RUA-36 NE');
  assert.equal(cornerPt.kind, 'corner');
  assert.equal(map.getLocationAt(cornerPt.x, cornerPt.y), null);
});

test('divide a cidade em chunks ativos com cerca de 2 veículos variados por quarteirão dirigidos por NPCs', () => {
  const map = new CityMap();
  assert.equal(map.chunkCols * map.chunkRows, 100);
  assert.equal(map.vehicleSpawns.length, map.gridBlocks * map.gridBlocks * 2);
  assert.ok(map.vehicleSpawns.every((v) => v.driver === 'npc' && v.isParked === false));

  const casa1 = map.resolveLocationCode('CASA-01');
  const localChunks = map.getActiveChunks(
    casa1.spawnPoint.x - 10,
    casa1.spawnPoint.y - 10,
    casa1.spawnPoint.x + 10,
    casa1.spawnPoint.y + 10,
    1,
  );
  assert.ok(localChunks.length >= 4 && localChunks.length <= 9);
  for (const chunk of localChunks) {
    assert.equal(chunk.vehicleSpawns.length, chunk.blocks.length * 2);
    assert.ok(chunk.trashBinSpawns.length > 0);
    const kinds = new Set(chunk.vehicleSpawns.map((v) => v.kind));
    assert.ok(kinds.size >= 2);
  }

  const traffic = new TrafficManager(map, { chunkManaged: true });
  assert.equal(traffic.pedestrians.length, 0);
  const nextKeys = new Set(localChunks.map((c) => c.key));
  traffic.syncPedestrianChunks(localChunks, nextKeys, { x: casa1.spawnPoint.x, y: casa1.spawnPoint.y });
  assert.ok(traffic.pedestrians.length > 0);

  // Ao mover para um chunk distante, os pedestres antigos fora da vizinhança são removidos
  const farCorner = map.resolveLocationCode('CASA-656');
  const farChunks = map.getActiveChunks(
    farCorner.spawnPoint.x - 10,
    farCorner.spawnPoint.y - 10,
    farCorner.spawnPoint.x + 10,
    farCorner.spawnPoint.y + 10,
    1,
  );
  const farKeys = new Set(farChunks.map((c) => c.key));
  traffic.syncPedestrianChunks(farChunks, farKeys, { x: farCorner.spawnPoint.x, y: farCorner.spawnPoint.y }, nextKeys);
  assert.ok(traffic.pedestrians.every((p) => farKeys.has(p.chunkKey)));
});
