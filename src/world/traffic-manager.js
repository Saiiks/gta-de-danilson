import { findSafeExitPosition } from '../physics/vehicle-physics.js';
import { resolveEntityCollisions } from '../physics/collision.js';

const PED_COLORS = [
  [0.25, 0.55, 0.85, 1],
  [0.82, 0.32, 0.35, 1],
  [0.32, 0.72, 0.45, 1],
  [0.72, 0.45, 0.82, 1],
  [0.88, 0.65, 0.25, 1],
  [0.18, 0.72, 0.74, 1],
  [0.9, 0.44, 0.22, 1]
];

const SKIN_COLORS = [
  [0.96, 0.8, 0.66, 1],
  [0.92, 0.72, 0.52, 1],
  [0.82, 0.6, 0.42, 1],
  [0.64, 0.42, 0.28, 1],
  [0.44, 0.28, 0.18, 1]
];

const HAIR_COLORS = [
  [0.1, 0.09, 0.09, 1],
  [0.28, 0.17, 0.1, 1],
  [0.52, 0.32, 0.16, 1],
  [0.86, 0.72, 0.32, 1],
  [0.72, 0.28, 0.14, 1],
  [0.68, 0.7, 0.74, 1]
];

const PANTS_COLORS = [
  [0.15, 0.22, 0.35, 1],
  [0.14, 0.15, 0.18, 1],
  [0.22, 0.34, 0.52, 1],
  [0.42, 0.36, 0.26, 1],
  [0.2, 0.28, 0.22, 1]
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
        const idx = bx * 3 + by * 5;
        const color = PED_COLORS[idx % PED_COLORS.length];
        const skinColor = SKIN_COLORS[(idx + 1) % SKIN_COLORS.length];
        const hairColor = HAIR_COLORS[(idx + 2) % HAIR_COLORS.length];
        const pantsColor = PANTS_COLORS[(idx + 3) % PANTS_COLORS.length];
        const horizontal = (bx + by) % 4 === 0;
        this.pedestrians.push({
          id: `PED-${this.nextPedId++}`,
          x: b.x + 12,
          y: b.y + 12,
          dirX: horizontal ? 1 : 0,
          dirY: horizontal ? 0 : 1,
          angle: horizontal ? 0 : Math.PI * 0.5,
          speed: 62,
          baseSpeed: 62,
          health: 100,
          radius: 10,
          hitCooldown: 0,
          fleeTimer: 0,
          crossTimer: 2.2 + ((bx + by) % 4) * 1.1,
          walkPhase: (bx + by) * 0.7,
          color,
          skinColor,
          hairColor,
          pantsColor,
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
      skinColor: SKIN_COLORS[this.nextPedId % SKIN_COLORS.length],
      hairColor: HAIR_COLORS[this.nextPedId % HAIR_COLORS.length],
      pantsColor: PANTS_COLORS[this.nextPedId % PANTS_COLORS.length],
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

    // Atualiza pedestres caminhando, atravessando ruas e fugindo de veículos próximos
    for (const ped of this.pedestrians) {
      if (ped.hitCooldown > 0) {
        ped.hitCooldown = Math.max(0, ped.hitCooldown - dt);
      }
      if (ped.state === 'downed') continue;
      if (Math.abs(ped.x - player.x) > activeRadius || Math.abs(ped.y - player.y) > activeRadius) {
        continue;
      }

      // Verifica se há veículo em movimento se aproximando perto do pedestre
      let threat = null;
      let threatDist = 115;
      for (const v of vehicles) {
        if (v.destroyed || v.speed < 25) continue;
        const dx = ped.x - v.x;
        const dy = ped.y - v.y;
        const d = Math.hypot(dx, dy);
        if (d < threatDist) {
          const approaching = dx * v.vx + dy * v.vy > 0 || d < 65;
          if (approaching) {
            threatDist = d;
            threat = v;
          }
        }
      }

      if (threat) {
        ped.state = 'fleeing';
        ped.fleeTimer = 2.4;
        const dx = ped.x - threat.x;
        const dy = ped.y - threat.y;
        const d = Math.hypot(dx, dy) || 1;
        ped.dirX = dx / d;
        ped.dirY = dy / d;
        ped.angle = Math.atan2(ped.dirY, ped.dirX);
      } else if (ped.state === 'fleeing') {
        ped.fleeTimer = Math.max(0, (ped.fleeTimer || 0) - dt);
        if (ped.fleeTimer <= 0) {
          ped.state = 'walking';
        }
      }

      // Atravessar ruas periodicamente enquanto caminha
      if (ped.state === 'walking') {
        ped.crossTimer = (ped.crossTimer ?? 3.5) - dt;
        if (ped.crossTimer <= 0) {
          ped.crossTimer = 3.2 + ((Math.floor(ped.x + ped.y) % 5) * 0.8);
          const turnSign = (Math.floor(ped.x * 0.1 + ped.y * 0.1) % 2 === 0) ? 1 : -1;
          const nx = -ped.dirY * turnSign;
          const ny = ped.dirX * turnSign;
          ped.dirX = nx;
          ped.dirY = ny;
          ped.angle = Math.atan2(ped.dirY, ped.dirX);
        }
      }

      const targetSpeed = ped.state === 'fleeing' ? 158 : (ped.baseSpeed || 62);
      ped.speed += (targetSpeed - ped.speed) * Math.min(1, dt * (ped.state === 'fleeing' ? 7 : 4));

      const nextX = ped.x + ped.dirX * ped.speed * dt;
      const nextY = ped.y + ped.dirY * ped.speed * dt;
      const colliders = this.cityMap.getCollidersAround(nextX, nextY, 80);
      const res = resolveEntityCollisions(nextX, nextY, ped.radius || 10, colliders);

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
        ped.walkPhase += dt * (ped.state === 'fleeing' ? 18 : 9);
      }
    }
  }
}
