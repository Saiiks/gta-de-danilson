import test from 'node:test';
import assert from 'node:assert/strict';
import { CityMap } from '../src/world/city-map.js';

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
