function drawNoiseTile(ctx, x, y, size, baseColor, grainAlpha) {
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, size, size);
  for (let i = 0; i < 180; i++) {
    const px = x + ((i * 73) % size);
    const py = y + ((i * 137) % size);
    ctx.fillStyle = i % 2 === 0 ? `rgba(255,255,255,${grainAlpha})` : `rgba(0,0,0,${grainAlpha})`;
    ctx.fillRect(px, py, 2, 2);
  }
}

export function createTextureAtlas() {
  const size = 512;
  const tile = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const uvs = {};
  const register = (name, col, row, drawFn) => {
    const x = col * tile;
    const y = row * tile;
    drawFn(ctx, x, y, tile);
    const pad = 1 / size;
    uvs[name] = {
      u0: x / size + pad,
      v0: y / size + pad,
      u1: (x + tile) / size - pad,
      v1: (y + tile) / size - pad
    };
  };

  register('solid', 0, 0, (c, x, y, s) => {
    c.fillStyle = '#ffffff';
    c.fillRect(x, y, s, s);
  });

  register('asphalt', 1, 0, (c, x, y, s) => {
    drawNoiseTile(c, x, y, s, '#2d313a', 0.06);
  });

  register('sidewalk', 2, 0, (c, x, y, s) => {
    drawNoiseTile(c, x, y, s, '#8d94a0', 0.05);
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 2;
    c.strokeRect(x + 1, y + 1, s - 2, s - 2);
  });

  register('grass', 3, 0, (c, x, y, s) => {
    drawNoiseTile(c, x, y, s, '#3b7a47', 0.08);
  });

  register('roof', 4, 0, (c, x, y, s) => {
    drawNoiseTile(c, x, y, s, '#c8ccd4', 0.05);
    c.strokeStyle = 'rgba(0,0,0,0.22)';
    c.lineWidth = 2;
    for (let gy = 8; gy < s; gy += 16) {
      c.beginPath();
      c.moveTo(x, y + gy);
      c.lineTo(x + s, y + gy);
      c.stroke();
    }
  });

  register('floor', 5, 0, (c, x, y, s) => {
    drawNoiseTile(c, x, y, s, '#e2d8c5', 0.04);
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.strokeRect(x + 2, y + 2, s / 2 - 2, s / 2 - 2);
    c.strokeRect(x + s / 2, y + s / 2, s / 2 - 2, s / 2 - 2);
  });

  register('car', 0, 1, (c, x, y, s) => {
    c.fillStyle = '#ffffff';
    c.fillRect(x + 4, y + 8, s - 8, s - 16);
    c.fillStyle = '#1f2937';
    c.fillRect(x + 18, y + 14, s - 34, s - 28);
    c.fillStyle = '#fde68a';
    c.fillRect(x + s - 10, y + 12, 4, 10);
    c.fillRect(x + s - 10, y + s - 22, 4, 10);
  });

  register('moto', 1, 1, (c, x, y, s) => {
    c.fillStyle = '#111827';
    c.fillRect(x + 6, y + 24, 14, 16);
    c.fillRect(x + s - 20, y + 24, 14, 16);
    c.fillStyle = '#ffffff';
    c.fillRect(x + 16, y + 18, s - 32, s - 36);
    c.fillStyle = '#fef08a';
    c.fillRect(x + s - 10, y + 26, 4, 12);
  });

  register('van', 2, 1, (c, x, y, s) => {
    c.fillStyle = '#ffffff';
    c.fillRect(x + 3, y + 6, s - 6, s - 12);
    c.fillStyle = '#1f2937';
    c.fillRect(x + s - 20, y + 12, 12, s - 24);
    c.fillStyle = '#fde68a';
    c.fillRect(x + s - 8, y + 10, 4, 10);
    c.fillRect(x + s - 8, y + s - 20, 4, 10);
  });

  register('player', 3, 1, (c, x, y, s) => {
    c.fillStyle = '#1f2937';
    c.beginPath();
    c.arc(x + s / 2, y + s / 2, 22, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f59e0b';
    c.beginPath();
    c.arc(x + s / 2 + 4, y + s / 2, 14, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fde68a';
    c.beginPath();
    c.arc(x + s / 2 + 12, y + s / 2, 6, 0, Math.PI * 2);
    c.fill();
  });

  return { canvas, uvs };
}
