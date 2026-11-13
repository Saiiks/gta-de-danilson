import test from 'node:test';
import assert from 'node:assert/strict';
import { CityMap } from '../src/world/city-map.js';
import { TrafficManager } from '../src/world/traffic-manager.js';
import { isInWater, resolveVehiclePairCollision } from '../src/physics/collision.js';
import { createVehicleEntity, evaluateVehicleImpact } from '../src/physics/vehicle-physics.js';

test('detecta queda na água ao ultrapassar os limites da ilha', () => {
  const map = new CityMap();
  assert.equal(isInWater(100, 100, map), false);
  assert.equal(isInWater(-5, 100, map), true);
  assert.equal(isInWater(100, map.worldHeight + 5, map), true);
});

test('colisão veículo-veículo calcula impacto e só ejeta/machuca em impactos fortes', () => {
  const vA = createVehicleEntity({ id: 'a', kind: 'car', model: 'Sedan', color: '#f00', x: 500, y: 500, angle: 0 });
  const vB = createVehicleEntity({ id: 'b', kind: 'van', model: 'Van', color: '#00f', x: 520, y: 500, angle: Math.PI });
  vA.vx = 350;
  vB.vx = -120;

  const col = resolveVehiclePairCollision(vA, vB);
  assert.equal(col.collided, true);
  assert.ok(col.impactSpeed >= 400);

  const strong = evaluateVehicleImpact(col.impactSpeed);
  assert.equal(strong.eject, true);
  assert.ok(strong.damage > 0);

  const mild = evaluateVehicleImpact(80);
  assert.equal(mild.eject, false);
  assert.equal(mild.damage, 0);
});

test('gera veículos estacionados na calçada, tráfego NPC e retira motorista para o chão ao tomar veículo', () => {
  const map = new CityMap();
  const parked = map.vehicleSpawns.filter((v) => v.isParked);
  const trafficSpawns = map.vehicleSpawns.filter((v) => v.driver === 'npc');
  assert.ok(parked.length > 0);
  assert.ok(trafficSpawns.length > 0);

  const vehicles = map.vehicleSpawns.map(createVehicleEntity);
  const traffic = new TrafficManager(map);
  const player = { x: trafficSpawns[0].x, y: trafficSpawns[0].y, inVehicleId: null, radius: 11 };

  const targetVehicle = vehicles.find((v) => v.driver === 'npc');
  const startX = targetVehicle.x;
  const startY = targetVehicle.y;
  traffic.update(0.1, player, vehicles);
  assert.ok(targetVehicle.x !== startX || targetVehicle.y !== startY);

  const evicted = traffic.evictDriver(targetVehicle, player.radius);
  assert.equal(targetVehicle.driver, null);
  assert.equal(evicted.state, 'downed');
});
