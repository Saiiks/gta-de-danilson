export function resolveCircleRect(cx, cy, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= radius * radius) {
    return { x: cx, y: cy, collided: false };
  }

  if (distSq > 1e-6) {
    const dist = Math.sqrt(distSq);
    const overlap = radius - dist;
    return {
      x: cx + (dx / dist) * overlap,
      y: cy + (dy / dist) * overlap,
      collided: true
    };
  }

  const left = cx - rect.x;
  const right = rect.x + rect.w - cx;
  const top = cy - rect.y;
  const bottom = rect.y + rect.h - cy;
  const minEdge = Math.min(left, right, top, bottom);

  if (minEdge === left) return { x: rect.x - radius, y: cy, collided: true };
  if (minEdge === right) return { x: rect.x + rect.w + radius, y: cy, collided: true };
  if (minEdge === top) return { x: cx, y: rect.y - radius, collided: true };
  return { x: cx, y: rect.y + rect.h + radius, collided: true };
}

export function resolveEntityCollisions(x, y, radius, colliders, worldSize) {
  let nx = x;
  let ny = y;
  let collided = false;

  for (let pass = 0; pass < 2; pass++) {
    for (const rect of colliders) {
      const res = resolveCircleRect(nx, ny, radius, rect);
      nx = res.x;
      ny = res.y;
      if (res.collided) {
        collided = true;
      }
    }
  }

  const minBound = radius;
  const maxBound = worldSize - radius;
  if (nx < minBound) { nx = minBound; collided = true; }
  if (ny < minBound) { ny = minBound; collided = true; }
  if (nx > maxBound) { nx = maxBound; collided = true; }
  if (ny > maxBound) { ny = maxBound; collided = true; }

  return { x: nx, y: ny, collided };
}

export function isPositionFree(x, y, radius, colliders, worldSize) {
  if (x < radius || y < radius || x > worldSize - radius || y > worldSize - radius) {
    return false;
  }
  for (const rect of colliders) {
    const res = resolveCircleRect(x, y, radius, rect);
    if (res.collided) {
      return false;
    }
  }
  return true;
}
