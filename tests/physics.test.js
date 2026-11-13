import test from 'node:test';
import assert from 'node:assert/strict';
import { CityMap } from '../src/world/city-map.js';
import {
  createVehicleEntity,
  findSafeExitPosition,
  updatePedestrian,
  updateVehicle
} from '../src/physics/vehicle-physics.js';

test('colisão sólida impede jogador a pé de atravessar parede de edificação', () => {
  const map = new CityMap();
  const casa = map.resolveLocationCode('CASA-01');
  const wall = casa.interior.walls[0];

  const player = {
    x: wall.x + wall.w * 0.5,
    y: wall.y - 12,
    angle: 0,
    speed: 0,
    radius: 11
  };

  for (let i = 0; i < 20; i++) {
    updatePedestrian(player, { moveX: 0, moveY: 1 }, 0.016, map);
  }

  assert.ok(player.y <= wall.y - player.radius + 0.01);
});

test('carros, motos e vans têm resposta distinta e ativam drift em curvas em velocidade', () => {
  const map = new CityMap();
  const road = map.resolveLocationCode('RUA-01');

  const car = createVehicleEntity({ id: 'v1', kind: 'car', model: 'Sedan', color: '#f00', x: 500, y: road.bounds.y + 64, angle: 0 });
  const moto = createVehicleEntity({ id: 'v2', kind: 'moto', model: 'Street', color: '#0f0', x: 900, y: road.bounds.y + 64, angle: 0 });
  const van = createVehicleEntity({ id: 'v3', kind: 'van', model: 'Carga', color: '#00f', x: 1300, y: road.bounds.y + 64, angle: 0 });

  car.driver = 'player';
  moto.driver = 'player';
  van.driver = 'player';

  const accelInput = { moveX: 0, moveY: 0, actionPressed: true, secondaryPressed: false };
  for (let i = 0; i < 60; i++) {
    updateVehicle(car, accelInput, 0.016, map);
    updateVehicle(moto, accelInput, 0.016, map);
    updateVehicle(van, accelInput, 0.016, map);
  }

  assert.ok(moto.speed > car.speed);
  assert.ok(car.speed > van.speed);

  const steerInput = { moveX: 1, moveY: 0, actionPressed: true, secondaryPressed: false };
  for (let i = 0; i < 15; i++) {
    updateVehicle(car, steerInput, 0.016, map);
  }

  assert.equal(car.isDrifting, true);
  assert.ok(car.driftIntensity > 0);
});

test('saída do veículo posiciona o jogador em local livre adjacente', () => {
  const map = new CityMap();
  const road = map.resolveLocationCode('RUA-01');
  const car = createVehicleEntity({ id: 'v1', kind: 'car', model: 'Sedan', color: '#f00', x: 600, y: road.bounds.y + 64, angle: 0 });

  const exitPos = findSafeExitPosition(car, 11, map);
  assert.ok(Math.hypot(exitPos.x - car.x, exitPos.y - car.y) > 15);
});

test('jogador a pé colide de forma sólida com veículos e não passa por cima deles', () => {
  const map = new CityMap();
  const road = map.resolveLocationCode('RUA-01');
  const car = createVehicleEntity({ id: 'v1', kind: 'car', model: 'Sedan', color: '#f00', x: 700, y: road.bounds.y + 64, angle: 0 });
  const player = { x: car.x - 40, y: car.y, angle: 0, speed: 0, radius: 11 };

  for (let i = 0; i < 30; i++) {
    updatePedestrian(player, { moveX: 1, moveY: 0 }, 0.016, map, [car]);
  }

  assert.ok(player.x <= car.x - car.length * 0.5 - player.radius + 0.5);
});

test('veículo não pode entrar pela porta de uma construção', () => {
  const map = new CityMap();
  const house = map.resolveLocationCode('CASA-01');
  const doorCenterX = house.entrance.x + house.entrance.w * 0.5;
  const moto = createVehicleEntity({
    id: 'm1',
    kind: 'moto',
    model: 'Moto',
    color: '#0f0',
    x: doorCenterX,
    y: house.bounds.y + house.bounds.h + 26,
    angle: -Math.PI * 0.5
  });
  moto.driver = 'player';

  const input = { moveX: 0, moveY: 0, actionPressed: true, secondaryPressed: false };
  for (let i = 0; i < 30; i++) {
    updateVehicle(moto, input, 0.016, map);
  }

  assert.ok(moto.y >= house.bounds.y + house.bounds.h + moto.radius - 0.5);
});
