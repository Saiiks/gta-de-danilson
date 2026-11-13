import { isPositionFree, resolveCircleOBB, resolveEntityCollisions } from './collision.js';

export const VEHICLE_PROFILES = {
  car: {
    maxSpeed: 420,
    reverseMax: 160,
    accel: 420,
    brake: 520,
    turnRate: 3.1,
    lateralGrip: 6.2,
    driftGrip: 2.0,
    length: 44,
    width: 24,
    radius: 17
  },
  moto: {
    maxSpeed: 480,
    reverseMax: 110,
    accel: 540,
    brake: 560,
    turnRate: 4.1,
    lateralGrip: 7.4,
    driftGrip: 2.7,
    length: 34,
    width: 16,
    radius: 12
  },
  van: {
    maxSpeed: 340,
    reverseMax: 140,
    accel: 310,
    brake: 430,
    turnRate: 2.4,
    lateralGrip: 5.2,
    driftGrip: 1.6,
    length: 54,
    width: 28,
    radius: 20
  }
};

export function createVehicleEntity(spawn) {
  const profile = VEHICLE_PROFILES[spawn.kind] || VEHICLE_PROFILES.car;
  return {
    id: spawn.id,
    kind: spawn.kind,
    model: spawn.model,
    color: spawn.color,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    angle: spawn.angle || 0,
    speed: 0,
    isDrifting: false,
    driftIntensity: 0,
    length: profile.length,
    width: profile.width,
    radius: profile.radius,
    isParked: Boolean(spawn.isParked),
    driver: spawn.driver || null,
    health: 100,
    destroyed: false
  };
}

export function updatePedestrian(player, input, dt, cityMap, vehicles = []) {
  const walkSpeed = 175;
  const mx = input.moveX;
  const my = input.moveY;

  if (Math.hypot(mx, my) > 0.05) {
    player.angle = Math.atan2(my, mx);
    player.speed = walkSpeed;
  } else {
    player.speed = 0;
  }

  const nextX = player.x + mx * walkSpeed * dt;
  const nextY = player.y + my * walkSpeed * dt;
  const colliders = cityMap.getCollidersAround(nextX, nextY, 100);
  let resolved = resolveEntityCollisions(nextX, nextY, player.radius, colliders, cityMap.worldSize);

  for (const v of vehicles) {
    if (Math.abs(v.x - resolved.x) > 80 || Math.abs(v.y - resolved.y) > 80) continue;
    const hit = resolveCircleOBB(resolved.x, resolved.y, player.radius, v);
    if (hit.collided) {
      resolved = hit;
    }
  }

  player.x = resolved.x;
  player.y = resolved.y;
}

export function updateVehicle(vehicle, input, dt, cityMap) {
  if (vehicle.destroyed) {
    vehicle.vx = 0;
    vehicle.vy = 0;
    vehicle.speed = 0;
    vehicle.isDrifting = false;
    vehicle.driftIntensity = 0;
    return { collided: false, impactSpeed: 0 };
  }
  const profile = VEHICLE_PROFILES[vehicle.kind] || VEHICLE_PROFILES.car;

  if (vehicle.driver === 'player') {
    const prevCos = Math.cos(vehicle.angle);
    const prevSin = Math.sin(vehicle.angle);
    const prevForward = vehicle.vx * prevCos + vehicle.vy * prevSin;
    const speedFactor = Math.min(1, Math.abs(prevForward) / 90);
    const directionSign = prevForward >= -5 ? 1 : -1;
    const steer = input.moveX;
    vehicle.angle += steer * profile.turnRate * speedFactor * directionSign * dt;

    const cos = Math.cos(vehicle.angle);
    const sin = Math.sin(vehicle.angle);
    let forwardSpeed = vehicle.vx * cos + vehicle.vy * sin;
    let lateralSpeed = -vehicle.vx * sin + vehicle.vy * cos;

    if (input.actionPressed && !input.secondaryPressed) {
      forwardSpeed += profile.accel * dt;
    } else if (input.secondaryPressed && !input.actionPressed) {
      if (forwardSpeed > 25) {
        forwardSpeed -= profile.brake * dt;
      } else {
        forwardSpeed -= profile.accel * 0.6 * dt;
      }
    } else {
      const drag = Math.exp(-2.5 * dt);
      forwardSpeed *= drag;
    }

    forwardSpeed = Math.max(-profile.reverseMax, Math.min(profile.maxSpeed, forwardSpeed));

    const drifting =
      Math.abs(forwardSpeed) > profile.maxSpeed * 0.42 &&
      Math.abs(steer) > 0.2;

    const grip = drifting ? profile.driftGrip : profile.lateralGrip;
    lateralSpeed *= Math.exp(-grip * dt);

    vehicle.isDrifting = drifting || Math.abs(lateralSpeed) > 45;
    vehicle.driftIntensity = Math.min(1, Math.abs(lateralSpeed) / 140);

    vehicle.vx = forwardSpeed * cos - lateralSpeed * sin;
    vehicle.vy = forwardSpeed * sin + lateralSpeed * cos;
  } else {
    const cos = Math.cos(vehicle.angle);
    const sin = Math.sin(vehicle.angle);
    const idleDrag = Math.exp(-4.0 * dt);
    const forwardSpeed = (vehicle.vx * cos + vehicle.vy * sin) * idleDrag;
    const lateralSpeed = (-vehicle.vx * sin + vehicle.vy * cos) * idleDrag;
    vehicle.isDrifting = false;
    vehicle.driftIntensity = 0;
    vehicle.vx = forwardSpeed * cos - lateralSpeed * sin;
    vehicle.vy = forwardSpeed * sin + lateralSpeed * cos;
  }
  vehicle.speed = Math.hypot(vehicle.vx, vehicle.vy);

  const nextX = vehicle.x + vehicle.vx * dt;
  const nextY = vehicle.y + vehicle.vy * dt;
  const colliders = cityMap.getCollidersAround(nextX, nextY, 120, true);
  const resolved = resolveEntityCollisions(nextX, nextY, vehicle.radius, colliders);

  let impactSpeed = 0;
  if (resolved.collided) {
    impactSpeed = Math.hypot(vehicle.vx, vehicle.vy);
    vehicle.vx *= 0.35;
    vehicle.vy *= 0.35;
    vehicle.speed = Math.hypot(vehicle.vx, vehicle.vy);
  }

  vehicle.x = resolved.x;
  vehicle.y = resolved.y;
  return { collided: resolved.collided, impactSpeed };
}

export function evaluateVehicleImpact(impactSpeed, threshold = 270) {
  if (impactSpeed < threshold) {
    return { eject: false, damage: 0 };
  }
  const damage = Math.min(85, Math.round((impactSpeed - threshold) * 0.35 + 22));
  return { eject: true, damage };
}

export function applyVehicleDamage(vehicle, impactSpeed, minImpact = 75) {
  if (!vehicle || vehicle.destroyed || impactSpeed < minImpact) {
    return { damaged: false, exploded: false, damage: 0 };
  }
  const damage = Math.min(65, Math.max(4, Math.round((impactSpeed - minImpact) * 0.18 + 6)));
  vehicle.health = Math.max(0, (vehicle.health ?? 100) - damage);
  return {
    damaged: true,
    exploded: vehicle.health <= 0,
    damage
  };
}

export function updateVehicleCriticalState(vehicle, dt) {
  if (!vehicle || vehicle.destroyed) {
    return { smokingCritical: false, shouldExplode: false };
  }
  const health = vehicle.health ?? 100;
  if (health <= 0) {
    return { smokingCritical: false, shouldExplode: true };
  }
  if (health >= 10) {
    vehicle.criticalTimer = null;
    return { smokingCritical: false, shouldExplode: false };
  }
  if (typeof vehicle.criticalTimer !== 'number') {
    vehicle.criticalTimer = 10;
  }
  vehicle.criticalTimer = Math.max(0, vehicle.criticalTimer - dt);
  return {
    smokingCritical: true,
    shouldExplode: vehicle.criticalTimer <= 0
  };
}

export function computeShockwaveFalloff(distance, maxRadius) {
  if (maxRadius <= 0 || distance >= maxRadius) {
    return 0;
  }
  const ratio = Math.max(0, Math.min(1, distance / maxRadius));
  return Math.pow(1 - ratio, 1.35);
}

export function computeShockwaveDamage(distance, maxRadius, maxDamage) {
  const strength = computeShockwaveFalloff(distance, maxRadius);
  if (strength <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(maxDamage * strength));
}

export function updateEjectedPlayer(player, dt, cityMap, vehicles = []) {
  const ej = player.ejected;
  if (!ej || !ej.active) {
    return { extraDamage: 0 };
  }

  if (ej.hitCooldown > 0) {
    ej.hitCooldown = Math.max(0, ej.hitCooldown - dt);
  }

  const nextX = player.x + ej.vx * dt;
  const nextY = player.y + ej.vy * dt;
  const colliders = cityMap.getCollidersAround(nextX, nextY, 100);
  let resolved = resolveEntityCollisions(nextX, nextY, player.radius, colliders);
  let hitObstacle = resolved.collided;

  for (const v of vehicles) {
    if (v.id === ej.sourceVehicleId && ej.graceTimer > 0) continue;
    if (Math.abs(v.x - resolved.x) > 80 || Math.abs(v.y - resolved.y) > 80) continue;
    const hit = resolveCircleOBB(resolved.x, resolved.y, player.radius, v);
    if (hit.collided) {
      resolved = hit;
      hitObstacle = true;
    }
  }

  if (ej.graceTimer > 0) {
    ej.graceTimer = Math.max(0, ej.graceTimer - dt);
  }

  player.x = resolved.x;
  player.y = resolved.y;

  let extraDamage = 0;
  const speed = Math.hypot(ej.vx, ej.vy);
  if (hitObstacle) {
    if (ej.hitCooldown <= 0 && speed > 45) {
      extraDamage = Math.min(35, Math.max(10, Math.round(speed * 0.08)));
      ej.hitCooldown = 0.25;
    }
    ej.vx *= -0.45;
    ej.vy *= -0.45;
  }

  const drag = Math.exp(-3.6 * dt);
  ej.vx *= drag;
  ej.vy *= drag;
  player.speed = Math.hypot(ej.vx, ej.vy);

  if (player.speed < 22) {
    ej.active = false;
    ej.vx = 0;
    ej.vy = 0;
    player.speed = 0;
  }

  return { extraDamage };
}

export function findNearestVehicle(x, y, vehicles, maxDist = 52) {
  let nearest = null;
  let bestDist = maxDist;
  for (const v of vehicles) {
    if (v.destroyed) continue;
    const dist = Math.hypot(v.x - x, v.y - y);
    if (dist <= bestDist) {
      bestDist = dist;
      nearest = v;
    }
  }
  return nearest;
}

export function findSafeExitPosition(vehicle, playerRadius, cityMap) {
  const offset = vehicle.width / 2 + playerRadius + 10;
  const cos = Math.cos(vehicle.angle);
  const sin = Math.sin(vehicle.angle);

  const candidates = [
    { x: vehicle.x - sin * offset, y: vehicle.y + cos * offset },
    { x: vehicle.x + sin * offset, y: vehicle.y - cos * offset },
    { x: vehicle.x - cos * (vehicle.length / 2 + playerRadius + 8), y: vehicle.y - sin * (vehicle.length / 2 + playerRadius + 8) },
    { x: vehicle.x + cos * (vehicle.length / 2 + playerRadius + 8), y: vehicle.y + sin * (vehicle.length / 2 + playerRadius + 8) }
  ];

  const colliders = cityMap.getCollidersAround(vehicle.x, vehicle.y, 120);
  for (const pos of candidates) {
    if (isPositionFree(pos.x, pos.y, playerRadius, colliders, cityMap)) {
      return pos;
    }
  }
  return { x: vehicle.x, y: vehicle.y };
}
