export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewRange = 1900;
  }

  #drawMapScene(ctx, w, h, {
    cityMap,
    player,
    routePoints,
    objectivePoint,
    worldCollectibles = [],
    scale,
    centerX,
    centerY,
    visibleMinX,
    visibleMaxX,
    visibleMinY,
    visibleMaxY,
    expanded = false,
  }) {
    ctx.fillStyle = '#144970';
    ctx.fillRect(0, 0, w, h);

    const toMiniX = (wx) => w * 0.5 + (wx - centerX) * scale;
    const toMiniY = (wy) => h * 0.5 + (wy - centerY) * scale;

    ctx.fillStyle = '#1b202b';
    ctx.fillRect(
      toMiniX(0),
      toMiniY(0),
      cityMap.worldWidth * scale,
      cityMap.worldHeight * scale,
    );

    const blocks = cityMap.getVisibleBlocks(visibleMinX, visibleMinY, visibleMaxX, visibleMaxY);
    for (const block of blocks) {
      const b = block.bounds;
      ctx.fillStyle = block.isPlaza ? '#2d6a4f' : '#3a4254';
      ctx.fillRect(toMiniX(b.x), toMiniY(b.y), b.w * scale, b.h * scale);

      for (const building of block.buildings) {
        const bb = building.bounds;
        const bx = toMiniX(bb.x);
        const by = toMiniY(bb.y);
        const bw = bb.w * scale;
        const bh = bb.h * scale;
        if (building.type === 'hospital') {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(bx, by, bw, bh);
          const cx = bx + bw * 0.5;
          const cy = by + bh * 0.5;
          const arm = Math.max(expanded ? 4 : 6, Math.min(bw, bh) * 0.85);
          const thick = Math.max(1.5, arm * 0.32);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(cx - thick * 0.5, cy - arm * 0.5, thick, arm);
          ctx.fillRect(cx - arm * 0.5, cy - thick * 0.5, arm, thick);
        } else {
          ctx.fillStyle = building.type === 'commerce' ? '#4f6d9a' : '#7c5c4e';
          ctx.fillRect(bx, by, bw, bh);
        }
      }
    }

    if (routePoints && routePoints.length > 1) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = expanded ? 3 : 2.5;
      ctx.beginPath();
      ctx.moveTo(toMiniX(routePoints[0].x), toMiniY(routePoints[0].y));
      for (let i = 1; i < routePoints.length; i += 1) {
        ctx.lineTo(toMiniX(routePoints[i].x), toMiniY(routePoints[i].y));
      }
      ctx.stroke();
    }

    if (objectivePoint) {
      const rawOx = toMiniX(objectivePoint.x);
      const rawOy = toMiniY(objectivePoint.y);
      const pad = 8;
      const isOutOfView =
        !expanded && (rawOx < pad || rawOx > w - pad || rawOy < pad || rawOy > h - pad);

      if (isOutOfView) {
        const cx = w * 0.5;
        const cy = h * 0.5;
        const dx = rawOx - cx;
        const dy = rawOy - cy;
        const angle = Math.atan2(dy, dx);
        const halfW = Math.max(1, cx - pad);
        const halfH = Math.max(1, cy - pad);
        const clampScale = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH, 1);
        const bx = cx + dx / clampScale;
        const by = cy + dy / clampScale;

        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(angle);
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(6.5, 0);
        ctx.lineTo(-4.5, -5);
        ctx.lineTo(-4.5, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        if (expanded) {
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(rawOx, rawOy, 10, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(rawOx, rawOy, expanded ? 6 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (worldCollectibles && worldCollectibles.length > 0) {
      ctx.save();
      const expandedFontSize = Math.max(19, Math.round(Math.min(w, h) * 0.045));
      ctx.font = expanded ? `bold ${expandedFontSize}px sans-serif` : 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = expanded ? 4 : 2.5;
      ctx.strokeStyle = '#0f172a';
      for (const c of worldCollectibles) {
        if (c.collected) continue;
        const cx = toMiniX(c.x);
        const cy = toMiniY(c.y);
        if (cx < -6 || cx > w + 6 || cy < -6 || cy > h + 6) continue;
        ctx.fillStyle = c.rarity === 'lendario'
          ? '#facc15'
          : c.rarity === 'especial'
            ? '#c084fc'
            : '#38bdf8';
        ctx.strokeText('?', cx, cy);
        ctx.fillText('?', cx, cy);
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(toMiniX(player.x), toMiniY(player.y));
    ctx.rotate(player.angle);
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = expanded ? 2 : 1.2;
    ctx.beginPath();
    const s = expanded ? 1.25 : 1;
    ctx.moveTo(7 * s, 0);
    ctx.lineTo(-5 * s, -4.5 * s);
    ctx.lineTo(-3 * s, 0);
    ctx.lineTo(-5 * s, 4.5 * s);
    ctx.closePath();
    if (expanded) ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  render(cityMap, player, routePoints, objectivePoint, worldCollectibles = []) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const scale = w / (this.viewRange * 2);
    this.#drawMapScene(ctx, w, h, {
      cityMap,
      player,
      routePoints,
      objectivePoint,
      worldCollectibles,
      scale,
      centerX: player.x,
      centerY: player.y,
      visibleMinX: player.x - this.viewRange,
      visibleMaxX: player.x + this.viewRange,
      visibleMinY: player.y - this.viewRange,
      visibleMaxY: player.y + this.viewRange,
      expanded: false,
    });
  }

  renderExpanded(
    expandedCanvas,
    cityMap,
    player,
    routePoints,
    objectivePoint,
    worldCollectibles = [],
    viewportWidth = 800,
    viewportHeight = 600,
  ) {
    if (!expandedCanvas || !cityMap) return;
    const maxW = Math.max(240, Math.floor(viewportWidth * 0.88));
    const maxH = Math.max(180, Math.floor(viewportHeight * 0.68));
    const aspect = Math.max(0.4, Math.min(2.5, viewportWidth / Math.max(1, viewportHeight)));
    let targetW = maxW;
    let targetH = Math.round(targetW / aspect);
    if (targetH > maxH) {
      targetH = maxH;
      targetW = Math.round(targetH * aspect);
    }
    if (expandedCanvas.width !== targetW || expandedCanvas.height !== targetH) {
      expandedCanvas.width = targetW;
      expandedCanvas.height = targetH;
    }

    const ctx = expandedCanvas.getContext('2d');
    const scale = Math.min(targetW / cityMap.worldWidth, targetH / cityMap.worldHeight) * 0.94;
    this.#drawMapScene(ctx, targetW, targetH, {
      cityMap,
      player,
      routePoints,
      objectivePoint,
      worldCollectibles,
      scale,
      centerX: cityMap.worldWidth * 0.5,
      centerY: cityMap.worldHeight * 0.5,
      visibleMinX: 0,
      visibleMaxX: cityMap.worldWidth,
      visibleMinY: 0,
      visibleMaxY: cityMap.worldHeight,
      expanded: true,
    });
  }
}
