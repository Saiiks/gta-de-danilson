export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewRange = 1900;
  }

  render(cityMap, player, routePoints, objectivePoint) {
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
        ctx.fillStyle = building.type === 'commerce' ? '#4f6d9a' : '#7c5c4e';
        ctx.fillRect(toMiniX(bb.x), toMiniY(bb.y), bb.w * scale, bb.h * scale);
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
      let ox = toMiniX(objectivePoint.x);
      let oy = toMiniY(objectivePoint.y);
      const pad = 8;
      ox = Math.max(pad, Math.min(w - pad, ox));
      oy = Math.max(pad, Math.min(h - pad, oy));

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(ox, oy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.5;
      ctx.stroke();
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
