import { findSafeExitPosition, hitTrashBin, resolvePedestrianEnvironmentCollisions } from '../physics/vehicle-physics.js';
import { resolveEntityCollisions } from '../physics/collision.js';
import { SIDEWALK_WIDTH } from './city-layout.js';

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

const SIDEWALK_MID = SIDEWALK_WIDTH * 0.5;

export class TrafficManager {
  constructor(cityMap) {
    this.cityMap = cityMap;
    this.pedestrians = [];
    this.nextPedId = 1;
    this.#spawnInitialPedestrians();
  }

  #nextRand(ped) {
    ped.rngState = ((ped.rngState * 1664525 + 1013904223) >>> 0);
    return ped.rngState / 4294967296;
  }

  #getSidewalkBounds(block) {
    const b = block.bounds;
    return {
      northY: b.y + SIDEWALK_MID,
      southY: b.y + b.h - SIDEWALK_MID,
      westX: b.x + SIDEWALK_MID,
      eastX: b.x + b.w - SIDEWALK_MID
    };
  }

  #getSidewalkDirection(side, cw) {
    if (side === 'north') return { x: cw, y: 0 };
    if (side === 'east') return { x: 0, y: cw };
    if (side === 'south') return { x: -cw, y: 0 };
    return { x: 0, y: -cw };
  }

  #isOnSidewalk(ped) {
    const block = this.cityMap.blocks[ped.by]?.[ped.bx];
    if (!block) return false;
    const sw = this.#getSidewalkBounds(block);
    return (
      ped.x >= block.bounds.x - 6 &&
      ped.x <= block.bounds.x + block.bounds.w + 6 &&
      ped.y >= block.bounds.y - 6 &&
      ped.y <= block.bounds.y + block.bounds.h + 6 &&
      (Math.abs(ped.y - sw.northY) <= 18 ||
        Math.abs(ped.y - sw.southY) <= 18 ||
        Math.abs(ped.x - sw.westX) <= 18 ||
        Math.abs(ped.x - sw.eastX) <= 18)
    );
  }

  #spawnInitialPedestrians() {
    for (let by = 0; by < this.cityMap.gridBlocks; by += 2) {
      for (let bx = 0; bx < this.cityMap.gridBlocks; bx += 2) {
        const block = this.cityMap.blocks[by][bx];
        const sw = this.#getSidewalkBounds(block);
        const idx = bx * 3 + by * 5;
        const color = PED_COLORS[idx % PED_COLORS.length];
        const skinColor = SKIN_COLORS[(idx + 1) % SKIN_COLORS.length];
        const hairColor = HAIR_COLORS[(idx + 2) % HAIR_COLORS.length];
        const pantsColor = PANTS_COLORS[(idx + 3) % PANTS_COLORS.length];
        const side = (bx + by) % 4 === 0 ? 'south' : 'east';
        const cw = (idx % 2 === 0) ? 1 : -1;
        const dir = this.#getSidewalkDirection(side, cw);
        const startX = side === 'south' ? (sw.westX + sw.eastX) * 0.5 : sw.eastX;
        const startY = side === 'south' ? sw.southY : (sw.northY + sw.southY) * 0.5;
        const idNum = this.nextPedId++;

        this.pedestrians.push({
          id: `PED-${idNum}`,
          x: startX,
          y: startY,
          dirX: dir.x,
          dirY: dir.y,
          angle: Math.atan2(dir.y, dir.x),
          speed: 62,
          baseSpeed: 62,
          health: 100,
          radius: 10,
          hitCooldown: 0,
          fleeTimer: 0,
          crossTimer: 2.2 + ((bx + by) % 4) * 1.1,
          crossCooldown: 0,
          visitCooldown: 3 + (idx % 5),
          walkPhase: (bx + by) * 0.7,
          color,
          skinColor,
          hairColor,
          pantsColor,
          state: 'walking',
          substate: null,
          bx,
          by,
          side,
          cw,
          rngState: ((idNum * 2654435761) >>> 0) || 1,
          crossTarget: null,
          targetBuilding: null,
          visitStep: 0,
          insideTimer: 0,
          plazaTarget: null,
          plazaVisitsLeft: 0,
          returnTarget: null,
          stuckTimer: 0,
          lastCheckX: startX,
          lastCheckY: startY
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
    const idNum = this.nextPedId++;
    const nearest = this.#findNearestSidewalkPoint(pos.x, pos.y);
    const dx = nearest.x - pos.x;
    const dy = nearest.y - pos.y;
    const d = Math.hypot(dx, dy) || 1;
    const dirX = dx / d;
    const dirY = dy / d;
    const npc = {
      id: `PED-${idNum}`,
      x: pos.x,
      y: pos.y,
      dirX,
      dirY,
      angle: Math.atan2(dirY, dirX),
      speed: 62,
      baseSpeed: 62,
      health: 100,
      radius: 10,
      hitCooldown: 0,
      fleeTimer: 0,
      crossTimer: 4.0,
      crossCooldown: 1.5,
      visitCooldown: 6,
      binReactCooldown: 0,
      walkPhase: 0,
      color: PED_COLORS[idNum % PED_COLORS.length],
      skinColor: SKIN_COLORS[idNum % SKIN_COLORS.length],
      hairColor: HAIR_COLORS[idNum % HAIR_COLORS.length],
      pantsColor: PANTS_COLORS[idNum % PANTS_COLORS.length],
      state: 'walking',
      substate: 'returning_to_sidewalk',
      bx: nearest.bx,
      by: nearest.by,
      side: nearest.side,
      cw: idNum % 2 === 0 ? 1 : -1,
      rngState: ((idNum * 2654435761) >>> 0) || 1,
      crossTarget: null,
      targetBuilding: null,
      visitStep: 0,
      insideTimer: 0,
      plazaTarget: null,
      plazaVisitsLeft: 0,
      returnTarget: nearest,
      stuckTimer: 0,
      lastCheckX: pos.x,
      lastCheckY: pos.y
    };
    this.pedestrians.push(npc);
    return npc;
  }

  update(dt, player, vehicles, trashBins = [], time = 0) {
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

    // Atualiza pedestres caminhando, atravessando ruas, visitando locais e fugindo de veículos
    for (const ped of this.pedestrians) {
      if (ped.hitCooldown > 0) {
        ped.hitCooldown = Math.max(0, ped.hitCooldown - dt);
      }
      if (ped.crossCooldown > 0) {
        ped.crossCooldown = Math.max(0, ped.crossCooldown - dt);
      }
      if (ped.visitCooldown > 0) {
        ped.visitCooldown = Math.max(0, ped.visitCooldown - dt);
      }
      if (ped.binReactCooldown > 0) {
        ped.binReactCooldown = Math.max(0, ped.binReactCooldown - dt);
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
        ped.fleeTimer = 2.6;
        ped.substate = null;
        ped.crossTarget = null;
        ped.waitingCrosswalk = null;
        ped.targetBuilding = null;
        ped.plazaTarget = null;
        ped.returnTarget = null;
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
          ped.substate = 'returning_to_sidewalk';
          ped.returnTarget = this.#findNearestSidewalkPoint(ped.x, ped.y);
          ped.crossCooldown = 2.0;
        }
      }

      if (ped.state === 'walking' && ped.substate === 'inside_building') {
        ped.insideTimer = Math.max(0, (ped.insideTimer || 0) - dt);
        ped.speed = 0;
        if (ped.insideTimer <= 0) {
          ped.substate = 'exiting_building';
          ped.visitStep = 0;
        }
        continue;
      }

      if (ped.avoidTimer > 0) {
        ped.avoidTimer = Math.max(0, ped.avoidTimer - dt);
      }

      if (ped.state === 'waiting_light') {
        const lightState = ped.waitingCrosswalk && this.cityMap.getTrafficLightState
          ? this.cityMap.getTrafficLightState(ped.waitingCrosswalk, time)
          : 'green';
        if (lightState === 'green') {
          ped.waitingCrosswalk = null;
          ped.state = 'crossing';
        } else {
          ped.speed = 0;
          continue;
        }
      }

      if (ped.state === 'crossing') {
        this.#updateCrossingPedestrian(ped);
      } else if (ped.state === 'walking') {
        this.#updateWalkingPedestrian(ped, dt, time);
      }

      if (ped.state === 'waiting_light') {
        ped.speed = 0;
        continue;
      }

      const pedRadius = ped.radius || 10;

      // Em fuga, pedestre derruba lixeiras no caminho; caminhando, não colide com lixeiras
      if (ped.state === 'fleeing') {
        for (const bin of trashBins) {
          const dx = ped.x - bin.x;
          const dy = ped.y - bin.y;
          const minBinDist = pedRadius + (bin.radius || 7);
          if (Math.abs(dx) < minBinDist + 4 && Math.abs(dy) < minBinDist + 4) {
            const d = Math.hypot(dx, dy);
            if (d < minBinDist + 3) {
              hitTrashBin(
                bin,
                ped.dirX * Math.max(ped.speed, 110) * 0.9,
                ped.dirY * Math.max(ped.speed, 110) * 0.9,
                ped.x,
                ped.y,
                85
              );
            }
          }
        }
      }

      const targetSpeed = ped.state === 'fleeing' ? 158 : (ped.baseSpeed || 62);
      ped.speed += (targetSpeed - ped.speed) * Math.min(1, dt * (ped.state === 'fleeing' ? 7 : 4));

      const nextX = ped.x + ped.dirX * ped.speed * dt;
      const nextY = ped.y + ped.dirY * ped.speed * dt;
      const res = resolvePedestrianEnvironmentCollisions(nextX, nextY, pedRadius, this.cityMap, vehicles);

      const nearEdge =
        res.x < 40 ||
        res.y < 40 ||
        res.x > this.cityMap.worldWidth - 40 ||
        res.y > this.cityMap.worldHeight - 40;

      if (res.hitVehicle && res.hitVehicle.speed <= 18) {
        ped.x = res.x;
        ped.y = res.y;
        const dx = ped.x - res.hitVehicle.x;
        const dy = ped.y - res.hitVehicle.y;
        const d = Math.hypot(dx, dy) || 1;
        ped.avoidTimer = 0.45;
        this.#steerPedestrianAvoidance(ped, dx / d, dy / d, 1);
      } else if (res.collided || nearEdge) {
        if (ped.state === 'fleeing' || ped.substate === 'returning_to_sidewalk' || ped.state === 'crossing') {
          ped.avoidTimer = 0.55;
          this.#pickFreeFleeDirection(ped, pedRadius, vehicles);
        } else if (ped.substate === 'entering_building' || ped.substate === 'exiting_building') {
          ped.substate = 'returning_to_sidewalk';
          ped.targetBuilding = null;
          ped.visitCooldown = 12;
          ped.returnTarget = this.#findNearestSidewalkPoint(ped.x, ped.y);
        } else if (ped.substate === 'plaza') {
          this.#pickNextPlazaTarget(ped);
        } else {
          ped.dirX = -ped.dirX;
          ped.dirY = -ped.dirY;
          ped.angle = Math.atan2(ped.dirY, ped.dirX);
          if (ped.state === 'walking' && ped.substate === null) {
            ped.cw = -(ped.cw || 1);
          }
        }
      } else {
        ped.x = res.x;
        ped.y = res.y;
        ped.walkPhase += dt * (ped.state === 'fleeing' ? 18 : 9);
      }

      // Anti-travamento: se percorrer quase nada por mais de 1.2s, recalcula rota
      ped.stuckTimer = (ped.stuckTimer || 0) + dt;
      if (ped.stuckTimer >= 1.2) {
        const moved = Math.hypot(ped.x - (ped.lastCheckX ?? ped.x), ped.y - (ped.lastCheckY ?? ped.y));
        ped.lastCheckX = ped.x;
        ped.lastCheckY = ped.y;
        ped.stuckTimer = 0;
        if (moved < 10 && ped.state !== 'fleeing') {
          ped.state = 'walking';
          ped.crossTarget = null;
          ped.targetBuilding = null;
          ped.substate = 'returning_to_sidewalk';
          ped.returnTarget = this.#findNearestSidewalkPoint(ped.x, ped.y);
        }
      }
    }

    // Colisão jogador <-> pedestre e pedestre <-> pedestre: dão um passo para trás e desviam
    const standing = this.pedestrians.filter(
      (p) =>
        p.state !== 'downed' &&
        Math.abs(p.x - player.x) <= activeRadius &&
        Math.abs(p.y - player.y) <= activeRadius
    );

    if (!player.inVehicleId && !player.isDead) {
      const pRadius = player.radius || 11;
      for (const ped of standing) {
        const pedRadius = ped.radius || 10;
        const minDist = pRadius + pedRadius;
        const dx = ped.x - player.x;
        const dy = ped.y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist < minDist) {
          const nx = dist > 1e-4 ? dx / dist : 1;
          const ny = dist > 1e-4 ? dy / dist : 0;
          const stepBack = minDist - dist + 3;
          const target = resolveEntityCollisions(
            ped.x + nx * stepBack,
            ped.y + ny * stepBack,
            pedRadius,
            this.cityMap.getCollidersAround(ped.x, ped.y, 60)
          );
          ped.x = target.x;
          ped.y = target.y;
          this.#steerPedestrianAvoidance(ped, nx, ny, 1);
        }
      }
    }

    for (let i = 0; i < standing.length; i++) {
      const pedA = standing[i];
      const radA = pedA.radius || 10;
      for (let j = i + 1; j < standing.length; j++) {
        const pedB = standing[j];
        const radB = pedB.radius || 10;
        const minDist = radA + radB;
        const dx = pedB.x - pedA.x;
        const dy = pedB.y - pedA.y;
        if (Math.abs(dx) >= minDist || Math.abs(dy) >= minDist) continue;
        const dist = Math.hypot(dx, dy);
        if (dist < minDist) {
          const nx = dist > 1e-4 ? dx / dist : 1;
          const ny = dist > 1e-4 ? dy / dist : 0;
          const push = (minDist - dist) * 0.5 + 1.5;

          const resA = resolveEntityCollisions(
            pedA.x - nx * push,
            pedA.y - ny * push,
            radA,
            this.cityMap.getCollidersAround(pedA.x, pedA.y, 60)
          );
          const resB = resolveEntityCollisions(
            pedB.x + nx * push,
            pedB.y + ny * push,
            radB,
            this.cityMap.getCollidersAround(pedB.x, pedB.y, 60)
          );
          pedA.x = resA.x;
          pedA.y = resA.y;
          pedB.x = resB.x;
          pedB.y = resB.y;
          this.#steerPedestrianAvoidance(pedA, -nx, -ny, 1);
          this.#steerPedestrianAvoidance(pedB, nx, ny, 1);
        }
      }
    }
  }

  #steerToward(ped, tx, ty) {
    const dx = tx - ped.x;
    const dy = ty - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) return 0;
    ped.dirX = dx / dist;
    ped.dirY = dy / dist;
    ped.angle = Math.atan2(ped.dirY, ped.dirX);
    return dist;
  }

  #findNearestSidewalkPoint(x, y) {
    let bestBx = 0;
    let bestBy = 0;
    let bestDist = Infinity;

    for (let by = 0; by < this.cityMap.gridBlocks; by++) {
      const ry = this.cityMap.blockYOffsets[by];
      const rh = this.cityMap.rowHeights[by];
      const cy = Math.max(ry + SIDEWALK_MID, Math.min(ry + rh - SIDEWALK_MID, y));
      const dy = y - cy;
      if (Math.abs(dy) > bestDist) continue;
      for (let bx = 0; bx < this.cityMap.gridBlocks; bx++) {
        const rx = this.cityMap.blockXOffsets[bx];
        const rw = this.cityMap.colWidths[bx];
        const cx = Math.max(rx + SIDEWALK_MID, Math.min(rx + rw - SIDEWALK_MID, x));
        const d = Math.hypot(x - cx, dy);
        if (d < bestDist) {
          bestDist = d;
          bestBx = bx;
          bestBy = by;
        }
      }
    }

    const block = this.cityMap.blocks[bestBy][bestBx];
    const sw = this.#getSidewalkBounds(block);
    const clampedX = Math.max(sw.westX, Math.min(sw.eastX, x));
    const clampedY = Math.max(sw.northY, Math.min(sw.southY, y));
    const candidates = [
      { side: 'north', x: clampedX, y: sw.northY },
      { side: 'south', x: clampedX, y: sw.southY },
      { side: 'west', x: sw.westX, y: clampedY },
      { side: 'east', x: sw.eastX, y: clampedY }
    ];

    let best = candidates[0];
    let minD = Infinity;
    for (const c of candidates) {
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < minD) {
        minD = d;
        best = c;
      }
    }

    return { bx: bestBx, by: bestBy, side: best.side, x: best.x, y: best.y };
  }

  #getBuildingDoorTargets(building) {
    const ent = building.entrance;
    const sp = building.spawnPoint;
    const b = building.bounds;
    const doorCx = ent.x + ent.w * 0.5;
    const doorCy = ent.y + ent.h * 0.5;

    // Ponto interno seguro logo após a soleira da porta
    let insideX = doorCx;
    let insideY = doorCy;
    if (sp.y > b.y + b.h) {
      insideY = b.y + b.h - 38;
    } else if (sp.y < b.y) {
      insideY = b.y + 38;
    } else if (sp.x < b.x) {
      insideX = b.x + 38;
    } else {
      insideX = b.x + b.w - 38;
    }

    const safeInside = resolveEntityCollisions(
      insideX,
      insideY,
      10,
      this.cityMap.getCollidersAround(insideX, insideY, 60)
    );

    return {
      outside: { x: sp.x, y: sp.y },
      inside: { x: safeInside.x, y: safeInside.y }
    };
  }

  #startPerpendicularCrossing(ped, time = 0) {
    const { bx, by, side } = ped;
    const grid = this.cityMap.gridBlocks;
    let targetBx = bx;
    let targetBy = by;
    let targetSide = side;
    let dirX = 0;
    let dirY = 0;

    if (side === 'north' && by > 0) {
      targetBy = by - 1;
      targetSide = 'south';
      dirY = -1;
    } else if (side === 'south' && by < grid - 1) {
      targetBy = by + 1;
      targetSide = 'north';
      dirY = 1;
    } else if (side === 'west' && bx > 0) {
      targetBx = bx - 1;
      targetSide = 'east';
      dirX = -1;
    } else if (side === 'east' && bx < grid - 1) {
      targetBx = bx + 1;
      targetSide = 'west';
      dirX = 1;
    } else {
      return false;
    }

    const targetBlock = this.cityMap.blocks[targetBy][targetBx];
    const tsw = this.#getSidewalkBounds(targetBlock);
    const targetX = dirX === 0 ? Math.max(tsw.westX + 12, Math.min(tsw.eastX - 12, ped.x)) : (dirX > 0 ? tsw.westX : tsw.eastX);
    const targetY = dirY === 0 ? Math.max(tsw.northY + 12, Math.min(tsw.southY - 12, ped.y)) : (dirY > 0 ? tsw.northY : tsw.southY);
    const axis = dirX === 0 ? 'v' : 'h';

    ped.substate = null;
    ped.dirX = dirX;
    ped.dirY = dirY;
    ped.angle = Math.atan2(dirY, dirX);
    ped.crossTarget = {
      x: targetX,
      y: targetY,
      bx: targetBx,
      by: targetBy,
      side: targetSide,
      axis
    };

    const nearbyCw = this.cityMap.findNearbyCrosswalk?.(ped.x, ped.y, axis, 58);
    if (nearbyCw && this.cityMap.getTrafficLightState?.(nearbyCw, time) === 'red') {
      ped.state = 'waiting_light';
      ped.waitingCrosswalk = nearbyCw;
      ped.speed = 0;
      return true;
    }

    ped.state = 'crossing';
    ped.waitingCrosswalk = null;
    return true;
  }

  #updateCrossingPedestrian(ped) {
    const ct = ped.crossTarget;
    if (!ct) {
      ped.state = 'walking';
      return;
    }

    // Mantém travessia estritamente perpendicular à calçada (exceto durante desvio momentâneo de obstáculo)
    if (ct.axis === 'v') {
      const signY = ct.y >= ped.y ? 1 : -1;
      if ((ped.avoidTimer || 0) <= 0) {
        ped.dirX = 0;
        ped.dirY = signY;
        ped.angle = Math.atan2(ped.dirY, ped.dirX);
      }
      if (Math.abs(ped.y - ct.y) <= 8) {
        ped.y = ct.y;
        ped.bx = ct.bx;
        ped.by = ct.by;
        ped.side = ct.side;
        ped.cw = this.#nextRand(ped) < 0.5 ? 1 : -1;
        ped.state = 'walking';
        ped.crossTarget = null;
        ped.crossCooldown = 3.5;
        ped.crossTimer = 4.0 + this.#nextRand(ped) * 5.0;
        const dir = this.#getSidewalkDirection(ped.side, ped.cw);
        ped.dirX = dir.x;
        ped.dirY = dir.y;
        ped.angle = Math.atan2(dir.y, dir.x);
      }
    } else {
      const signX = ct.x >= ped.x ? 1 : -1;
      if ((ped.avoidTimer || 0) <= 0) {
        ped.dirX = signX;
        ped.dirY = 0;
        ped.angle = Math.atan2(ped.dirY, ped.dirX);
      }
      if (Math.abs(ped.x - ct.x) <= 8) {
        ped.x = ct.x;
        ped.bx = ct.bx;
        ped.by = ct.by;
        ped.side = ct.side;
        ped.cw = this.#nextRand(ped) < 0.5 ? 1 : -1;
        ped.state = 'walking';
        ped.crossTarget = null;
        ped.crossCooldown = 3.5;
        ped.crossTimer = 4.0 + this.#nextRand(ped) * 5.0;
        const dir = this.#getSidewalkDirection(ped.side, ped.cw);
        ped.dirX = dir.x;
        ped.dirY = dir.y;
        ped.angle = Math.atan2(dir.y, dir.x);
      }
    }
  }

  #pickNextPlazaTarget(ped) {
    const block = this.cityMap.blocks[ped.by]?.[ped.bx];
    if (!block?.plaza) {
      ped.substate = 'returning_to_sidewalk';
      ped.returnTarget = this.#findNearestSidewalkPoint(ped.x, ped.y);
      return;
    }

    if ((ped.plazaVisitsLeft || 0) <= 0) {
      ped.substate = 'returning_to_sidewalk';
      ped.plazaTarget = null;
      ped.returnTarget = this.#findNearestSidewalkPoint(ped.x, ped.y);
      ped.visitCooldown = 10;
      return;
    }

    const pb = block.plaza.bounds;
    const margin = 22;
    for (let attempt = 0; attempt < 6; attempt++) {
      const tx = pb.x + margin + this.#nextRand(ped) * Math.max(20, pb.w - margin * 2);
      const ty = pb.y + margin + this.#nextRand(ped) * Math.max(20, pb.h - margin * 2);
      const test = resolveEntityCollisions(tx, ty, ped.radius || 10, this.cityMap.getCollidersAround(tx, ty, 40));
      if (!test.collided) {
        ped.plazaTarget = { x: tx, y: ty };
        ped.plazaVisitsLeft -= 1;
        return;
      }
    }

    ped.substate = 'returning_to_sidewalk';
    ped.returnTarget = this.#findNearestSidewalkPoint(ped.x, ped.y);
  }

  #updateWalkingPedestrian(ped, dt, time = 0) {
    if (ped.substate === 'returning_to_sidewalk') {
      const rt = ped.returnTarget || this.#findNearestSidewalkPoint(ped.x, ped.y);
      ped.returnTarget = rt;
      const dist = (ped.avoidTimer || 0) > 0 ? Math.hypot(rt.x - ped.x, rt.y - ped.y) : this.#steerToward(ped, rt.x, rt.y);
      if (dist <= 12) {
        ped.x = rt.x;
        ped.y = rt.y;
        ped.bx = rt.bx;
        ped.by = rt.by;
        ped.side = rt.side;
        ped.cw = this.#nextRand(ped) < 0.5 ? 1 : -1;
        ped.substate = null;
        ped.returnTarget = null;
        const dir = this.#getSidewalkDirection(ped.side, ped.cw);
        ped.dirX = dir.x;
        ped.dirY = dir.y;
        ped.angle = Math.atan2(dir.y, dir.x);
      }
      return;
    }

    if (ped.substate === 'entering_building' && ped.targetBuilding) {
      const targets = this.#getBuildingDoorTargets(ped.targetBuilding);
      const goal = ped.visitStep === 0 ? targets.outside : targets.inside;
      const dist = this.#steerToward(ped, goal.x, goal.y);
      if (dist <= 10) {
        if (ped.visitStep === 0) {
          ped.visitStep = 1;
        } else {
          ped.substate = 'inside_building';
          ped.insideTimer = 2.5 + this.#nextRand(ped) * 3.0;
          ped.speed = 0;
        }
      }
      return;
    }

    if (ped.substate === 'exiting_building' && ped.targetBuilding) {
      const targets = this.#getBuildingDoorTargets(ped.targetBuilding);
      const goal = ped.visitStep === 0 ? targets.inside : targets.outside;
      const dist = this.#steerToward(ped, goal.x, goal.y);
      if (dist <= 10) {
        if (ped.visitStep === 0) {
          ped.visitStep = 1;
        } else {
          ped.substate = 'returning_to_sidewalk';
          ped.targetBuilding = null;
          ped.visitCooldown = 18;
          ped.returnTarget = this.#findNearestSidewalkPoint(ped.x, ped.y);
        }
      }
      return;
    }

    if (ped.substate === 'plaza') {
      if (!ped.plazaTarget) {
        this.#pickNextPlazaTarget(ped);
      }
      if (ped.plazaTarget) {
        const dist = this.#steerToward(ped, ped.plazaTarget.x, ped.plazaTarget.y);
        if (dist <= 12) {
          this.#pickNextPlazaTarget(ped);
        }
      }
      return;
    }

    // Se o pedestre está fora da calçada (ex.: posicionado manualmente na rua), preserva direção
    // e só aplica travessia/virada se o timer expirar
    const block = this.cityMap.blocks[ped.by]?.[ped.bx];
    if (!block) return;

    const sw = this.#getSidewalkBounds(block);
    const onBlockPerimeter =
      ped.x >= block.bounds.x - 6 &&
      ped.x <= block.bounds.x + block.bounds.w + 6 &&
      ped.y >= block.bounds.y - 6 &&
      ped.y <= block.bounds.y + block.bounds.h + 6 &&
      (Math.abs(ped.y - sw.northY) <= 18 ||
        Math.abs(ped.y - sw.southY) <= 18 ||
        Math.abs(ped.x - sw.westX) <= 18 ||
        Math.abs(ped.x - sw.eastX) <= 18);

    ped.crossTimer = (ped.crossTimer ?? 3.5) - dt;

    if (!onBlockPerimeter) {
      if (ped.crossTimer <= 0) {
        ped.crossTimer = 3.5 + this.#nextRand(ped) * 3.5;
        const turnSign = this.#nextRand(ped) < 0.5 ? 1 : -1;
        const nx = -ped.dirY * turnSign;
        const ny = ped.dirX * turnSign;
        ped.dirX = nx;
        ped.dirY = ny;
        ped.angle = Math.atan2(ped.dirY, ped.dirX);
      }
      return;
    }

    // Verifica se há estabelecimento próximo na calçada para entrar
    if ((ped.visitCooldown || 0) <= 0 && !block.isPlaza && block.buildings.length > 0) {
      for (const b of block.buildings) {
        if (b.type !== 'commerce' || !b.spawnPoint || !b.entrance) continue;
        const sp = b.spawnPoint;
        if (Math.hypot(ped.x - sp.x, ped.y - sp.y) < 75) {
          ped.visitCooldown = 8;
          if (this.#nextRand(ped) < 0.4) {
            ped.substate = 'entering_building';
            ped.targetBuilding = b;
            ped.visitStep = 0;
            return;
          }
        }
      }
    }

    // Se o timer de travessia expirou na calçada, atravessa a rua perpendicularmente
    if (ped.crossTimer <= 0 && (ped.crossCooldown || 0) <= 0) {
      ped.crossTimer = 4.0 + this.#nextRand(ped) * 4.5;
      if (this.#startPerpendicularCrossing(ped, time)) {
        return;
      }
    }

    // Caminha ao longo da faixa da calçada e decide nas esquinas sem entrar em loop
    const cw = ped.cw || 1;
    const cornerEps = 8;
    let atCorner = false;
    let nextSide = ped.side;

    if (ped.side === 'north') {
      ped.y += (sw.northY - ped.y) * Math.min(1, dt * 6);
      if (cw > 0 && ped.x >= sw.eastX - cornerEps) {
        ped.x = sw.eastX;
        atCorner = true;
        nextSide = 'east';
      } else if (cw < 0 && ped.x <= sw.westX + cornerEps) {
        ped.x = sw.westX;
        atCorner = true;
        nextSide = 'west';
      }
    } else if (ped.side === 'east') {
      ped.x += (sw.eastX - ped.x) * Math.min(1, dt * 6);
      if (cw > 0 && ped.y >= sw.southY - cornerEps) {
        ped.y = sw.southY;
        atCorner = true;
        nextSide = 'south';
      } else if (cw < 0 && ped.y <= sw.northY + cornerEps) {
        ped.y = sw.northY;
        atCorner = true;
        nextSide = 'north';
      }
    } else if (ped.side === 'south') {
      ped.y += (sw.southY - ped.y) * Math.min(1, dt * 6);
      if (cw > 0 && ped.x <= sw.westX + cornerEps) {
        ped.x = sw.westX;
        atCorner = true;
        nextSide = 'west';
      } else if (cw < 0 && ped.x >= sw.eastX - cornerEps) {
        ped.x = sw.eastX;
        atCorner = true;
        nextSide = 'east';
      }
    } else {
      ped.x += (sw.westX - ped.x) * Math.min(1, dt * 6);
      if (cw > 0 && ped.y <= sw.northY + cornerEps) {
        ped.y = sw.northY;
        atCorner = true;
        nextSide = 'north';
      } else if (cw < 0 && ped.y >= sw.southY - cornerEps) {
        ped.y = sw.southY;
        atCorner = true;
        nextSide = 'south';
      }
    }

    if (atCorner) {
      const roll = this.#nextRand(ped);
      if (block.isPlaza && (ped.visitCooldown || 0) <= 0 && roll < 0.35) {
        ped.substate = 'plaza';
        ped.plazaVisitsLeft = 1 + Math.floor(this.#nextRand(ped) * 3);
        this.#pickNextPlazaTarget(ped);
        return;
      }
      if ((ped.crossCooldown || 0) <= 0 && roll < 0.55 && this.#startPerpendicularCrossing(ped, time)) {
        return;
      }
      ped.side = nextSide;
    }

    const dir = this.#getSidewalkDirection(ped.side, cw);
    ped.dirX = dir.x;
    ped.dirY = dir.y;
    ped.angle = Math.atan2(dir.y, dir.x);
  }

  #pickFreeFleeDirection(ped, pedRadius, vehicles) {
    const baseAngle = Math.atan2(ped.dirY, ped.dirX);
    const offsets = [Math.PI * 0.35, -Math.PI * 0.35, Math.PI * 0.65, -Math.PI * 0.65, Math.PI];
    for (const off of offsets) {
      const ang = baseAngle + off;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const probe = resolvePedestrianEnvironmentCollisions(
        ped.x + dx * 16,
        ped.y + dy * 16,
        pedRadius,
        this.cityMap,
        vehicles
      );
      if (!probe.collided) {
        ped.dirX = dx;
        ped.dirY = dy;
        ped.angle = ang;
        return;
      }
    }
    ped.dirX = -ped.dirX;
    ped.dirY = -ped.dirY;
    ped.angle = Math.atan2(ped.dirY, ped.dirX);
  }

  #steerPedestrianAvoidance(ped, awayX, awayY, side = 1) {
    // Combina passo para trás (away) com desvio lateral perpendicular
    const sx = awayX * 0.65 - awayY * 0.76 * side;
    const sy = awayY * 0.65 + awayX * 0.76 * side;
    const len = Math.hypot(sx, sy) || 1;
    ped.dirX = sx / len;
    ped.dirY = sy / len;
    ped.angle = Math.atan2(ped.dirY, ped.dirX);
    ped.crossTimer = Math.max(ped.crossTimer || 0, 1.2);
  }
}
