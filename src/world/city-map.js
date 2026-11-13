import {
  BLOCK_SIZE,
  CELL_STRIDE,
  GRID_BLOCKS,
  ROAD_WIDTH,
  SIDEWALK_WIDTH,
  VEHICLE_VARIANTS,
  WORLD_SIZE,
  createBuildingWithInterior,
  formatCode,
  hashBlock
} from './city-layout.js';

export class CityMap {
  constructor() {
    this.gridBlocks = GRID_BLOCKS;
    this.blockSize = BLOCK_SIZE;
    this.roadWidth = ROAD_WIDTH;
    this.cellStride = CELL_STRIDE;
    this.worldSize = WORLD_SIZE;

    this.locationsByCode = new Map();
    this.horizontalRoads = [];
    this.verticalRoads = [];
    this.blocks = [];
    this.vehicleSpawns = [];

    this.#buildRoads();
    this.#buildBlocks();
    this.#buildVehicleSpawns();
  }

  #buildRoads() {
    let roadIndex = 1;
    for (let row = 0; row <= this.gridBlocks; row++) {
      const y = row * this.cellStride;
      const code = formatCode('RUA', roadIndex++);
      const road = {
        code,
        type: 'road',
        axis: 'h',
        index: row,
        bounds: { x: 0, y, w: this.worldSize, h: this.roadWidth },
        spawnPoint: { x: this.worldSize / 2, y: y + this.roadWidth / 2 }
      };
      this.horizontalRoads.push(road);
      this.locationsByCode.set(code, road);
    }

    for (let col = 0; col <= this.gridBlocks; col++) {
      const x = col * this.cellStride;
      const code = formatCode('RUA', roadIndex++);
      const road = {
        code,
        type: 'road',
        axis: 'v',
        index: col,
        bounds: { x, y: 0, w: this.roadWidth, h: this.worldSize },
        spawnPoint: { x: x + this.roadWidth / 2, y: this.worldSize / 2 }
      };
      this.verticalRoads.push(road);
      this.locationsByCode.set(code, road);
    }
  }

  #buildBlocks() {
    let houseIdx = 1;
    let commerceIdx = 1;
    let plazaIdx = 1;

    for (let by = 0; by < this.gridBlocks; by++) {
      const row = [];
      for (let bx = 0; bx < this.gridBlocks; bx++) {
        const blockX = ROAD_WIDTH + bx * this.cellStride;
        const blockY = ROAD_WIDTH + by * this.cellStride;
        const seed = hashBlock(bx, by);
        const isPlaza = bx % 5 === 2 && by % 5 === 2;

        const block = {
          bx,
          by,
          bounds: { x: blockX, y: blockY, w: this.blockSize, h: this.blockSize },
          isPlaza,
          buildings: [],
          plaza: null,
          obstacles: [
            { x: blockX + 10, y: blockY + 10, w: 12, h: 12, kind: 'lamp' },
            { x: blockX + this.blockSize - 22, y: blockY + this.blockSize - 22, w: 12, h: 12, kind: 'lamp' }
          ]
        };

        if (isPlaza) {
          const code = formatCode('PRACA', plazaIdx++);
          const innerX = blockX + SIDEWALK_WIDTH;
          const innerY = blockY + SIDEWALK_WIDTH;
          const innerSize = this.blockSize - SIDEWALK_WIDTH * 2;
          const plaza = {
            code,
            type: 'plaza',
            bounds: { x: innerX, y: innerY, w: innerSize, h: innerSize },
            props: [
              { x: innerX + innerSize / 2 - 28, y: innerY + innerSize / 2 - 28, w: 56, h: 56, kind: 'fountain' },
              { x: innerX + 24, y: innerY + 24, w: 40, h: 14, kind: 'bench' },
              { x: innerX + innerSize - 64, y: innerY + innerSize - 38, w: 40, h: 14, kind: 'bench' }
            ],
            spawnPoint: { x: innerX + innerSize / 2, y: innerY + 56 }
          };
          block.plaza = plaza;
          this.locationsByCode.set(code, plaza);
        } else {
          const pad = SIDEWALK_WIDTH + 6;
          const bW = this.blockSize - pad * 2;
          const bH = 110;

          const topType = seed % 3 === 0 ? 'commerce' : 'house';
          const topCode = topType === 'commerce'
            ? formatCode('COM', commerceIdx++)
            : formatCode('CASA', houseIdx++);
          const topBuilding = createBuildingWithInterior({
            code: topCode,
            type: topType,
            x: blockX + pad,
            y: blockY + pad,
            w: bW,
            h: bH,
            doorSide: 'north',
            seed
          });

          const botType = (seed >> 2) % 2 === 0 ? 'commerce' : 'house';
          const botCode = botType === 'commerce'
            ? formatCode('COM', commerceIdx++)
            : formatCode('CASA', houseIdx++);
          const botBuilding = createBuildingWithInterior({
            code: botCode,
            type: botType,
            x: blockX + pad,
            y: blockY + this.blockSize - pad - bH,
            w: bW,
            h: bH,
            doorSide: 'south',
            seed: seed >> 3
          });

          block.buildings.push(topBuilding, botBuilding);
          this.locationsByCode.set(topCode, topBuilding);
          this.locationsByCode.set(botCode, botBuilding);
        }

        row.push(block);
      }
      this.blocks.push(row);
    }
  }

  #buildVehicleSpawns() {
    let idCounter = 1;
    for (let by = 0; by < this.gridBlocks; by += 2) {
      for (let bx = 0; bx < this.gridBlocks; bx += 2) {
        const seed = hashBlock(bx + 7, by + 13);
        const variant = VEHICLE_VARIANTS[seed % VEHICLE_VARIANTS.length];
        const horizontal = seed % 2 === 0;
        const x = horizontal
          ? ROAD_WIDTH + bx * this.cellStride + this.blockSize * 0.5
          : bx * this.cellStride + ROAD_WIDTH * 0.72;
        const y = horizontal
          ? by * this.cellStride + ROAD_WIDTH * 0.72
          : ROAD_WIDTH + by * this.cellStride + this.blockSize * 0.5;

        this.vehicleSpawns.push({
          id: `VEH-${String(idCounter++).padStart(3, '0')}`,
          kind: variant.kind,
          model: variant.model,
          color: variant.color,
          x,
          y,
          angle: horizontal ? 0 : Math.PI / 2
        });
      }
    }
  }

  resolveLocationCode(code) {
    if (typeof code !== 'string' || !code.trim()) {
      throw new Error(`[CityMap] Código de local inválido: "${String(code)}"`);
    }
    const normalized = code.trim().toUpperCase();
    const location = this.locationsByCode.get(normalized);
    if (!location) {
      throw new Error(`[CityMap] Código de local inexistente: "${normalized}"`);
    }
    return location;
  }

  getVisibleBlocks(minX, minY, maxX, maxY) {
    const startBx = Math.max(0, Math.floor((minX - ROAD_WIDTH) / this.cellStride));
    const endBx = Math.min(this.gridBlocks - 1, Math.floor((maxX - ROAD_WIDTH) / this.cellStride));
    const startBy = Math.max(0, Math.floor((minY - ROAD_WIDTH) / this.cellStride));
    const endBy = Math.min(this.gridBlocks - 1, Math.floor((maxY - ROAD_WIDTH) / this.cellStride));

    const visible = [];
    for (let by = startBy; by <= endBy; by++) {
      for (let bx = startBx; bx <= endBx; bx++) {
        visible.push(this.blocks[by][bx]);
      }
    }
    return visible;
  }

  getBlockAt(x, y) {
    const bx = Math.floor((x - ROAD_WIDTH) / this.cellStride);
    const by = Math.floor((y - ROAD_WIDTH) / this.cellStride);
    if (bx < 0 || by < 0 || bx >= this.gridBlocks || by >= this.gridBlocks) {
      return null;
    }
    const block = this.blocks[by][bx];
    const b = block.bounds;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      return block;
    }
    return null;
  }

  getLocationAt(x, y) {
    const block = this.getBlockAt(x, y);
    if (block) {
      if (block.plaza) {
        const pb = block.plaza.bounds;
        if (x >= pb.x && x <= pb.x + pb.w && y >= pb.y && y <= pb.y + pb.h) {
          return block.plaza;
        }
      }
      for (const building of block.buildings) {
        const bb = building.bounds;
        if (x >= bb.x && x <= bb.x + bb.w && y >= bb.y && y <= bb.y + bb.h) {
          return building;
        }
      }
    }

    const modY = ((y % this.cellStride) + this.cellStride) % this.cellStride;
    if (modY >= 0 && modY <= this.roadWidth) {
      const row = Math.floor(y / this.cellStride);
      if (row >= 0 && row < this.horizontalRoads.length) {
        return this.horizontalRoads[row];
      }
    }

    const modX = ((x % this.cellStride) + this.cellStride) % this.cellStride;
    if (modX >= 0 && modX <= this.roadWidth) {
      const col = Math.floor(x / this.cellStride);
      if (col >= 0 && col < this.verticalRoads.length) {
        return this.verticalRoads[col];
      }
    }

    return null;
  }

  getCollidersAround(x, y, margin = 120) {
    const blocks = this.getVisibleBlocks(x - margin, y - margin, x + margin, y + margin);
    const colliders = [];
    for (const block of blocks) {
      for (const obs of block.obstacles) {
        colliders.push(obs);
      }
      if (block.plaza) {
        for (const prop of block.plaza.props) {
          colliders.push(prop);
        }
      }
      for (const building of block.buildings) {
        for (const wall of building.interior.walls) {
          colliders.push(wall);
        }
        for (const prop of building.interior.props) {
          colliders.push(prop);
        }
      }
    }
    return colliders;
  }
}
