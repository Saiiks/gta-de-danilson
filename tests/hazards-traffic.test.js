import test from 'node:test';
import assert from 'node:assert/strict';
import { CityMap } from '../src/world/city-map.js';
import { TrafficManager } from '../src/world/traffic-manager.js';
import { isInWater, resolveVehiclePairCollision } from '../src/physics/collision.js';
import {
  applyPedestrianDamage,
  applyVehicleDamage,
  createVehicleEntity,
  evaluateVehicleImpact,
  findNearestVehicle,
  updateEjectedPlayer,
  updateVehicle
} from '../src/physics/vehicle-physics.js';

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

test('jogador ejetado arrasta na direção do movimento e sofre dano extra ao bater em obstáculo', () => {
  const map = new CityMap();
  const casa = map.resolveLocationCode('CASA-01');
  const wall = casa.interior.walls[0];

  const player = {
    x: wall.x + wall.w * 0.5,
    y: wall.y - 25,
    radius: 11,
    speed: 0,
    ejected: { active: true, vx: 0, vy: 320, hitCooldown: 0, graceTimer: 0, sourceVehicleId: null }
  };

  let totalExtra = 0;
  for (let i = 0; i < 40; i++) {
    const res = updateEjectedPlayer(player, 0.016, map, []);
    totalExtra += res.extraDamage;
  }

  assert.ok(totalExtra > 0);
});

test('veículo sofre dano proporcional ao impacto, sinaliza explosão ao zerar barra e não se move destruído', () => {
  const map = new CityMap();
  const v = createVehicleEntity({ id: 'car-1', kind: 'car', model: 'Sedan', color: '#f00', x: 500, y: 500, angle: 0 });
  assert.equal(v.health, 100);

  const light = applyVehicleDamage(v, 40);
  assert.equal(light.damaged, false);
  assert.equal(v.health, 100);

  const med = applyVehicleDamage(v, 180);
  assert.equal(med.damaged, true);
  assert.equal(med.exploded, false);
  assert.ok(v.health < 100 && v.health > 0);

  applyVehicleDamage(v, 500);
  const finalHit = applyVehicleDamage(v, 500);
  assert.equal(finalHit.exploded, true);
  assert.equal(v.health, 0);

  v.destroyed = true;
  v.driver = 'player';
  const moveRes = updateVehicle(v, { moveX: 0, moveY: -1, actionPressed: true, secondaryPressed: false }, 0.05, map);
  assert.equal(moveRes.collided, false);
  assert.equal(v.speed, 0);
  assert.equal(findNearestVehicle(500, 500, [v]), null);
});

test('pessoas fogem acelerando de veículos próximos e giram para atravessar ruas', () => {
  const map = new CityMap();
  const traffic = new TrafficManager(map);
  const ped = traffic.pedestrians[0];
  const player = { x: ped.x, y: ped.y, inVehicleId: null, radius: 11 };

  const initDirX = ped.dirX;
  const initDirY = ped.dirY;
  ped.crossTimer = 0.05;
  traffic.update(0.1, player, []);
  assert.ok(ped.dirX !== initDirX || ped.dirY !== initDirY);

  const v = createVehicleEntity({ id: 'v-threat', kind: 'car', model: 'Sedan', color: '#f00', x: ped.x - 50, y: ped.y, angle: 0 });
  v.vx = 140;
  v.vy = 0;
  v.speed = 140;
  traffic.update(0.2, player, [v]);
  assert.equal(ped.state, 'fleeing');
  assert.ok(ped.speed > 90);
});

test('veículos e lixeiras causam dano em pedestres na rua', () => {
  const ped = { id: 'PED-T', health: 100, state: 'walking', hitCooldown: 0, dirX: 1, dirY: 0, angle: 0 };
  const hit1 = applyPedestrianDamage(ped, 40, 200, 0);
  assert.equal(hit1.damaged, true);
  assert.equal(hit1.downed, false);
  assert.equal(ped.health, 60);
  assert.equal(ped.state, 'fleeing');

  ped.hitCooldown = 0;
  const hit2 = applyPedestrianDamage(ped, 70, 250, 0);
  assert.equal(hit2.damaged, true);
  assert.equal(hit2.downed, true);
  assert.equal(ped.health, 0);
  assert.equal(ped.state, 'downed');
});

test('pedestres dão um passo para trás e desviam ao colidir com jogador ou outros pedestres', () => {
  const map = new CityMap();
  const traffic = new TrafficManager(map);
  const road = map.resolveLocationCode('RUA-01');
  const pedA = traffic.pedestrians[0];
  const pedB = traffic.pedestrians[1];

  // Colisão jogador <-> pedestre
  pedA.x = road.bounds.x + 120;
  pedA.y = road.bounds.y + 64;
  pedA.dirX = -1;
  pedA.dirY = 0;
  const player = { x: pedA.x - 8, y: pedA.y, inVehicleId: null, isDead: false, radius: 11 };

  traffic.update(0.016, player, []);
  const distPlayerPed = Math.hypot(pedA.x - player.x, pedA.y - player.y);
  assert.ok(distPlayerPed >= 21);
  assert.ok(pedA.dirX > 0);
  assert.notEqual(pedA.dirY, 0);

  // Colisão pedestre <-> pedestre
  pedA.x = road.bounds.x + 240;
  pedA.y = road.bounds.y + 64;
  pedB.x = pedA.x + 6;
  pedB.y = pedA.y;
  pedA.dirX = 1;
  pedA.dirY = 0;
  pedB.dirX = -1;
  pedB.dirY = 0;

  traffic.update(0.016, player, []);
  const distPedPed = Math.hypot(pedB.x - pedA.x, pedB.y - pedA.y);
  assert.ok(distPedPed >= 20);
  assert.ok(pedA.dirX < 0);
  assert.ok(pedB.dirX > 0);
});
