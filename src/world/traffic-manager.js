import { findSafeExitPosition } from '../physics/vehicle-physics.js';
import { resolveEntityCollisions } from '../physics/collision.js';

const PED_COLORS = [
  [0.25, 0.55, 0.85, 1],
  [0.82, 0.32, 0.35, 1],
  [0.32, 0.72, 0.45, 1],
  [0.72, 0.45, 0.82, 1],
  [0.88, 0.65, 0.25, 1]
];

export class TrafficManager {
  constructor(cityMap) {
    this.cityMap = cityMap;
    this.pedestrians = [];
    this.nextPedId = 1;
    this.#spawnInitialPedestrians();
  }

  #spawnInitialPedestrians() {
    for (let by = 0; by < this.cityMap.gridBlocks; by += 2) {
      for (let bx = 0; bx < this.cityMap.gridBlocks; bx += 2) {
        const block = this.cityMap.blocks[by][bx];
        const b = block.bounds;
        const color = PED_COLORS[(bx + by) % PED_COLORS.length];
        const horizontal = (bx + by) % 4 === 0;
        this.pedestrians.push({
          id: `PED-${this.nextPedId++}`,
          x: b.x + 12,
          y: b.y + 12,
          dirX: horizontal ? 1 : 0,
          dirY: horizontal ? 0 : 1,
          angle: horizontal ? 0 : Math.PI * 0.5,
          speed: 62,
          walkPhase: (bx + by) * 0.7,
          color,
          state: 'walking'
        });
      }
    }
  }

  evictDriver(vehicle, playerRadius) {
    if (vehicle.driver !== 'npc') {
      return null;
    }
    const pos = findSafeExitPosition(vehicle, playerRadius, this.cityMap);
    vehicle.driver = null;
    const npc = {
      id: `PED-${this.nextPedId++}`,
      x: pos.x,
      y: pos.y,
      dirX: 0,
      dirY: 0,
      angle: vehicle.angle + Math.PI * 0.5,
      speed: 0,
      walkPhase: 0,
      color: PED_COLORS[this.nextPedId % PED_COLORS.length],
      state: 'downed'
    };
    this.pedestrians.push(npc);
    return npc;
  }

  update(dt, player, vehicles) {
    const activeRadius = 1500;

    // Atualiza veículos de tráfego próximos ao jogador
    for (const v of vehicles) {
      if (v.driver !== 'npc') continue;
      if (Math.abs(v.x - player.x) > activeRadius || Math.abs(v.y - player.y) > activeRadius) {
        continue;
      }

      const cos = Math.cos(v.angle);
      const sin = Math.sin(v.angle);
      let blocked = false;

      // Verifica se há veículo ou jogador logo à frente
      const lookX = v.x + cos * 56;
      const lookY = v.y + sin * 56;
      if (!player.inVehicleId && Math.hypot(player.x - lookX, player.y - lookY) < 28) {
        blocked = true;
      }
      if (!blocked) {
        for (const other of vehicles) {
          if (other.id === v.id) continue;
          if (Math.hypot(other.x - lookX, other.y - lookY) < 46) {
            blocked = true;
            break;
          }
        }
      }

      const targetSpeed = blocked ? 0 : 135;
      const currentSpeed = Math.hypot(v.vx, v.vy);
      const nextSpeed = currentSpeed + (targetSpeed - currentSpeed) * Math.min(1, dt * 4);
      v.vx = cos * nextSpeed;
      v.vy = sin * nextSpeed;
      v.speed = nextSpeed;

      v.x += v.vx * dt;
      v.y += v.vy * dt;

      // Mantém tráfego dentro da ilha invertendo sentido ao se aproximar da costa
      const margin = 72;
      if (
        v.x < margin ||
        v.y < margin ||
        v.x > this.cityMap.worldWidth - margin ||
        v.y > this.cityMap.worldHeight - margin
      ) {
        v.angle += Math.PI;
        v.x = Math.max(margin, Math.min(this.cityMap.worldWidth - margin, v.x));
        v.y = Math.max(margin, Math.min(this.cityMap.worldHeight - margin, v.y));
      }
    }

    // Atualiza pedestres caminhando pelas calçadas na área ativa
    for (const ped of this.pedestrians) {
      if (ped.state !== 'walking') continue;
      if (Math.abs(ped.x - player.x) > activeRadius || Math.abs(ped.y - player.y) > activeRadius) {
        continue;
      }

      const nextX = ped.x + ped.dirX * ped.speed * dt;
      const nextY = ped.y + ped.dirY * ped.speed * dt;
      const colliders = this.cityMap.getCollidersAround(nextX, nextY, 80);
      const res = resolveEntityCollisions(nextX, nextY, 10, colliders);

      const nearEdge =
        res.x < 40 ||
        res.y < 40 ||
        res.x > this.cityMap.worldWidth - 40 ||
        res.y > this.cityMap.worldHeight - 40;

      if (res.collided || nearEdge) {
        ped.dirX = -ped.dirX;
        ped.dirY = -ped.dirY;
        ped.angle = Math.atan2(ped.dirY, ped.dirX);
      } else {
        ped.x = res.x;
        ped.y = res.y;
        ped.walkPhase += dt * 9;
      }
    }
  }
}
