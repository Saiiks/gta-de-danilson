export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewRange = 1900;
  }

  render(cityMap, player, routePoints, objectivePoint, worldCollectibles = []) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const scale = w / (this.viewRange * 2);

    ctx.fillStyle = '#144970';
    ctx.fillRect(0, 0, w, h);

    const toMiniX = (wx) => w * 0.5 + (wx - player.x) * scale;
    const toMiniY = (wy) => h * 0.5 + (wy - player.y) * scale;

    ctx.fillStyle = '#1b202b';
    ctx.fillRect(
      toMiniX(0),
      toMiniY(0),
      cityMap.worldWidth * scale,
      cityMap.worldHeight * scale
    );

    const minX = player.x - this.viewRange;
    const maxX = player.x + this.viewRange;
    const minY = player.y - this.viewRange;
    const maxY = player.y + this.viewRange;

    const blocks = cityMap.getVisibleBlocks(minX, minY, maxX, maxY);
    for (const block of blocks) {
      const b = block.bounds;
      const mx = toMiniX(b.x);
      const my = toMiniY(b.y);
      const mw = b.w * scale;
      const mh = b.h * scale;

      ctx.fillStyle = block.isPlaza ? '#2d6a4f' : '#3a4254';
      ctx.fillRect(mx, my, mw, mh);

      for (const building of block.buildings) {
        const bb = building.bounds;
        const mx = toMiniX(bb.x);
        const my = toMiniY(bb.y);
        const mw = bb.w * scale;
        const mh = bb.h * scale;
        if (building.type === 'hospital') {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(mx, my, mw, mh);
          const cx = mx + mw * 0.5;
          const cy = my + mh * 0.5;
          const arm = Math.max(6, Math.min(mw, mh) * 0.85);
          const thick = Math.max(2, arm * 0.32);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(cx - thick * 0.5, cy - arm * 0.5, thick, arm);
          ctx.fillRect(cx - arm * 0.5, cy - thick * 0.5, arm, thick);
        } else {
          ctx.fillStyle = building.type === 'commerce' ? '#4f6d9a' : '#7c5c4e';
          ctx.fillRect(mx, my, mw, mh);
        }
      }
    }

    if (routePoints && routePoints.length > 1) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(toMiniX(routePoints[0].x), toMiniY(routePoints[0].y));
      for (let i = 1; i < routePoints.length; i++) {
        ctx.lineTo(toMiniX(routePoints[i].x), toMiniY(routePoints[i].y));
      }
      ctx.stroke();
    }

    if (objectivePoint) {
      const rawOx = toMiniX(objectivePoint.x);
      const rawOy = toMiniY(objectivePoint.y);
      const pad = 8;
      const isOutOfView =
        rawOx < pad || rawOx > w - pad || rawOy < pad || rawOy > h - pad;

      if (isOutOfView) {
        const cx = w * 0.5;
        const cy = h * 0.5;
        const dx = rawOx - cx;
        const dy = rawOy - cy;
        const angle = Math.atan2(dy, dx);
        const halfW = Math.max(1, cx - pad);
        const halfH = Math.max(1, cy - pad);
        const scale = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH, 1);
        const bx = cx + dx / scale;
        const by = cy + dy / scale;

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
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(rawOx, rawOy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (worldCollectibles && worldCollectibles.length > 0) {
      ctx.save();
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 2.5;
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

    // Seta do jogador no centro
    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -4.5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
