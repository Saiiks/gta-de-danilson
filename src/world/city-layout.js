export const GRID_BLOCKS = 30;
export const BLOCK_SIZE = 320;
export const ROAD_WIDTH = 128;
export const CELL_STRIDE = BLOCK_SIZE + ROAD_WIDTH;
export const SIDEWALK_WIDTH = 28;
export const WORLD_SIZE = GRID_BLOCKS * CELL_STRIDE + ROAD_WIDTH;

export const VEHICLE_VARIANTS = [
  { kind: 'car', model: 'Sedan Urbano', color: '#e63946' },
  { kind: 'car', model: 'Cupê Esportivo', color: '#3a86ff' },
  { kind: 'car', model: 'Compacto Retrô', color: '#ffbe0b' },
  { kind: 'moto', model: 'Moto Street', color: '#fb5607' },
  { kind: 'moto', model: 'Moto Cruiser', color: '#06d6a0' },
  { kind: 'van', model: 'Van de Carga', color: '#f8f9fa' },
  { kind: 'van', model: 'Furgão Azul', color: '#457b9d' }
];

const ROOF_PALETTES = {
  house: ['#8d5b4c', '#7f5539', '#9c6644', '#6d597a'],
  commerce: ['#3d5a80', '#2a9d8f', '#b56576', '#4a4e69']
};

export function formatCode(prefix, number) {
  return `${prefix}-${String(number).padStart(2, '0')}`;
}

export function hashBlock(bx, by) {
  let h = (bx * 73856093) ^ (by * 19349663);
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) >>> 0;
  return h;
}

export function createBuildingWithInterior({
  code,
  type,
  x,
  y,
  w,
  h,
  doorSide,
  seed
}) {
  const wallT = 14;
  const doorW = 48;
  const roofPalette = ROOF_PALETTES[type];
  const roofColor = roofPalette[seed % roofPalette.length];

  const walls = [];
  let entrance;

  if (doorSide === 'south') {
    const doorX = x + (w - doorW) / 2;
    entrance = { x: doorX, y: y + h - wallT - 8, w: doorW, h: wallT + 20 };
    walls.push(
      { x, y, w, h: wallT },
      { x, y, w: wallT, h },
      { x: x + w - wallT, y, w: wallT, h },
      { x, y: y + h - wallT, w: doorX - x, h: wallT },
      { x: doorX + doorW, y: y + h - wallT, w: x + w - (doorX + doorW), h: wallT }
    );
  } else {
    const doorX = x + (w - doorW) / 2;
    entrance = { x: doorX, y: y - 12, w: doorW, h: wallT + 20 };
    walls.push(
      { x, y: y + h - wallT, w, h: wallT },
      { x, y, w: wallT, h },
      { x: x + w - wallT, y, w: wallT, h },
      { x, y, w: doorX - x, h: wallT },
      { x: doorX + doorW, y, w: x + w - (doorX + doorW), h: wallT }
    );
  }

  const props = type === 'commerce'
    ? [
        { x: x + 28, y: y + 34, w: w - 56, h: 24, kind: 'counter' },
        { x: x + 28, y: y + h - 68, w: 38, h: 26, kind: 'shelf' }
      ]
    : [
        { x: x + 28, y: y + 32, w: 48, h: 28, kind: 'table' },
        { x: x + w - 76, y: y + 32, w: 48, h: 28, kind: 'sofa' }
      ];

  return {
    code,
    type,
    bounds: { x, y, w, h },
    roofRect: { x, y, w, h },
    roofColor,
    floorColor: type === 'commerce' ? '#d8cfc0' : '#cbb99d',
    entrance,
    interior: {
      walls,
      props
    },
    spawnPoint: {
      x: entrance.x + entrance.w / 2,
      y: doorSide === 'south' ? y + h + 26 : y - 26
    }
  };
}
