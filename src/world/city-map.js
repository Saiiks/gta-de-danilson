import {
  GRID_BLOCKS,
  ROAD_WIDTH,
  SIDEWALK_WIDTH,
  VEHICLE_VARIANTS,
  buildGridMetrics,
  createBuildingWithInterior,
  formatCode,
  hashBlock
} from './city-layout.js';

export class CityMap {
  constructor() {
    this.gridBlocks = GRID_BLOCKS;
    this.roadWidth = ROAD_WIDTH;

    const metrics = buildGridMetrics();
    this.colWidths = metrics.colWidths;
    this.rowHeights = metrics.rowHeights;
    this.roadXOffsets = metrics.roadXOffsets;
    this.blockXOffsets = metrics.blockXOffsets;
    this.roadYOffsets = metrics.roadYOffsets;
    this.blockYOffsets = metrics.blockYOffsets;
    this.worldWidth = metrics.worldWidth;
    this.worldHeight = metrics.worldHeight;
    this.worldSize = Math.max(this.worldWidth, this.worldHeight);

    this.locationsByCode = new Map();
    this.horizontalRoads = [];
    this.verticalRoads = [];
    this.blocks = [];
    this.vehicleSpawns = [];
    this.trashBinSpawns = [];
    this.crosswalks = [];
    this.trafficLights = [];

    this.#buildRoads();
    this.#buildBlocks();
    this.#buildCrosswalksAndLights();
    this.#buildVehicleSpawns();
  }

  #buildRoads() {
    let roadIndex = 1;
    for (let row = 0; row <= this.gridBlocks; row++) {
      const y = this.roadYOffsets[row];
      const code = formatCode('RUA', roadIndex++);
      const road = {
        code,
        type: 'road',
        axis: 'h',
        index: row,
        bounds: { x: 0, y, w: this.worldWidth, h: this.roadWidth },
        spawnPoint: { x: this.worldWidth / 2, y: y + this.roadWidth / 2 }
      };
      this.horizontalRoads.push(road);
      this.locationsByCode.set(code, road);
    }

    for (let col = 0; col <= this.gridBlocks; col++) {
      const x = this.roadXOffsets[col];
      const code = formatCode('RUA', roadIndex++);
      const road = {
        code,
        type: 'road',
        axis: 'v',
        index: col,
        bounds: { x, y: 0, w: this.roadWidth, h: this.worldHeight },
        spawnPoint: { x: x + this.roadWidth / 2, y: this.worldHeight / 2 }
      };
      this.verticalRoads.push(road);
      this.locationsByCode.set(code, road);
    }
  }

  #buildBlocks() {
    let houseIdx = 1;
    let commerceIdx = 1;
    let plazaIdx = 1;

    const nextCode = (type) => (type === 'commerce'
      ? formatCode('COM', commerceIdx++)
      : formatCode('CASA', houseIdx++));

    for (let by = 0; by < this.gridBlocks; by++) {
      const row = [];
      for (let bx = 0; bx < this.gridBlocks; bx++) {
        const blockX = this.blockXOffsets[bx];
        const blockY = this.blockYOffsets[by];
        const bw = this.colWidths[bx];
        const bh = this.rowHeights[by];
        const seed = hashBlock(bx, by);
        const isPlaza = bx % 5 === 2 && by % 5 === 2;

        const block = {
          bx,
          by,
          bounds: { x: blockX, y: blockY, w: bw, h: bh },
          isPlaza,
          buildings: [],
          plaza: null,
          obstacles: []
        };
        this.trashBinSpawns.push(
          { id: `bin-${bx}-${by}-nw`, x: blockX + 13, y: blockY + 13 },
          { id: `bin-${bx}-${by}-se`, x: blockX + bw - 13, y: blockY + bh - 13 }
        );

        if (isPlaza) {
          const code = formatCode('PRACA', plazaIdx++);
          const innerX = blockX + SIDEWALK_WIDTH;
          const innerY = blockY + SIDEWALK_WIDTH;
          const innerW = bw - SIDEWALK_WIDTH * 2;
          const innerH = bh - SIDEWALK_WIDTH * 2;
          const fountainSize = Math.min(68, Math.floor(Math.min(innerW, innerH) * 0.28));
          const plaza = {
            code,
            type: 'plaza',
            bounds: { x: innerX, y: innerY, w: innerW, h: innerH },
            props: [
              {
                x: innerX + innerW / 2 - fountainSize / 2,
                y: innerY + innerH / 2 - fountainSize / 2,
                w: fountainSize,
                h: fountainSize,
                kind: 'fountain'
              },
              { x: innerX + 22, y: innerY + 22, w: 42, h: 14, kind: 'bench' },
              { x: innerX + innerW - 64, y: innerY + innerH - 36, w: 42, h: 14, kind: 'bench' }
            ],
            spawnPoint: { x: innerX + innerW / 2, y: innerY + 46 }
          };
          block.plaza = plaza;
          this.locationsByCode.set(code, plaza);
        } else {
          const pad = SIDEWALK_WIDTH + 6;
          const innerW = bw - pad * 2;
          const innerH = bh - pad * 2;
          const layoutStyle = seed % 4;

          if (layoutStyle === 0 && innerW >= 180 && innerH >= 180) {
            // 1 grande edificação com recuo assimétrico
            const bType = (seed >>> 2) % 2 === 0 ? 'commerce' : 'house';
            const bW = Math.floor(innerW * 0.78);
            const bH = Math.floor(innerH * 0.72);
            const offsetX = (seed % 3 === 0) ? 0 : innerW - bW;
            const b = createBuildingWithInterior({
              code: nextCode(bType),
              type: bType,
              x: blockX + pad + offsetX,
              y: blockY + pad,
              w: bW,
              h: bH,
              doorSide: (seed % 2 === 0) ? 'south' : 'north',
              seed
            });
            block.buildings.push(b);
            this.locationsByCode.set(b.code, b);
          } else if (layoutStyle === 1 && innerW >= 260) {
            // 3 edificações assimétricas: duas menores em cima e uma maior embaixo
            const gap = 16;
            const topH = Math.floor((innerH - gap) * 0.45);
            const botH = innerH - gap - topH;
            const leftW = Math.floor((innerW - gap) * 0.44);
            const rightW = innerW - gap - leftW;

            const b1 = createBuildingWithInterior({
              code: nextCode('house'),
              type: 'house',
              x: blockX + pad,
              y: blockY + pad,
              w: leftW,
              h: topH,
              doorSide: 'north',
              seed
            });
            const b2 = createBuildingWithInterior({
              code: nextCode('commerce'),
              type: 'commerce',
              x: blockX + pad + leftW + gap,
              y: blockY + pad,
              w: rightW,
              h: topH,
              doorSide: 'east',
              seed: seed >>> 3
            });
            const b3 = createBuildingWithInterior({
              code: nextCode((seed >>> 4) % 2 === 0 ? 'commerce' : 'house'),
              type: (seed >>> 4) % 2 === 0 ? 'commerce' : 'house',
              x: blockX + pad,
              y: blockY + pad + topH + gap,
              w: innerW,
              h: botH,
              doorSide: 'south',
              seed: seed >>> 5
            });
            block.buildings.push(b1, b2, b3);
            this.locationsByCode.set(b1.code, b1);
            this.locationsByCode.set(b2.code, b2);
            this.locationsByCode.set(b3.code, b3);
          } else if (layoutStyle === 2) {
            // 2 edificações lado a lado (oeste/leste) com larguras distintas
            const gap = 16;
            const leftW = Math.floor((innerW - gap) * 0.56);
            const rightW = innerW - gap - leftW;
            const b1 = createBuildingWithInterior({
              code: nextCode('commerce'),
              type: 'commerce',
              x: blockX + pad,
              y: blockY + pad,
              w: leftW,
              h: innerH,
              doorSide: 'west',
              seed
            });
            const b2 = createBuildingWithInterior({
              code: nextCode('house'),
              type: 'house',
              x: blockX + pad + leftW + gap,
              y: blockY + pad + 14,
              w: rightW,
              h: innerH - 28,
              doorSide: 'east',
              seed: seed >>> 3
            });
            block.buildings.push(b1, b2);
            this.locationsByCode.set(b1.code, b1);
            this.locationsByCode.set(b2.code, b2);
          } else {
            // 2 edificações norte/sul com alturas e recuos distintos
            const gap = 18;
            const topH = Math.floor((innerH - gap) * 0.44);
            const botH = innerH - gap - topH;
            const topType = seed % 3 === 0 ? 'commerce' : 'house';
            const botType = (seed >>> 2) % 2 === 0 ? 'commerce' : 'house';

            const b1 = createBuildingWithInterior({
              code: nextCode(topType),
              type: topType,
              x: blockX + pad + 12,
              y: blockY + pad,
              w: innerW - 24,
              h: topH,
              doorSide: 'north',
              seed
            });
            const b2 = createBuildingWithInterior({
              code: nextCode(botType),
              type: botType,
              x: blockX + pad,
              y: blockY + pad + topH + gap,
              w: innerW,
              h: botH,
              doorSide: 'south',
              seed: seed >>> 3
            });
            block.buildings.push(b1, b2);
            this.locationsByCode.set(b1.code, b1);
            this.locationsByCode.set(b2.code, b2);
          }
        }

        row.push(block);
      }
      this.blocks.push(row);
    }
  }

  #buildCrosswalksAndLights() {
    const rw = this.roadWidth;
    const cycleDuration = 12;

    for (let row = 1; row < this.gridBlocks; row++) {
      for (let col = 1; col < this.gridBlocks; col++) {
        if ((col + row) % 3 !== 0) continue;

        const ix = this.roadXOffsets[col];
        const iy = this.roadYOffsets[row];
        const phaseOffset = ((col * 3 + row * 5) % 6) * 1.5;
        const baseId = `cw-${col}-${row}`;

        // 4 faixas de pedestre ao redor do cruzamento selecionado
        this.crosswalks.push(
          { id: `${baseId}-n`, col, row, x: ix + 4, y: iy - 24, w: rw - 8, h: 20, axis: 'h', phaseOffset, cycleDuration },
          { id: `${baseId}-s`, col, row, x: ix + 4, y: iy + rw + 4, w: rw - 8, h: 20, axis: 'h', phaseOffset, cycleDuration },
          { id: `${baseId}-w`, col, row, x: ix - 24, y: iy + 4, w: 20, h: rw - 8, axis: 'v', phaseOffset, cycleDuration },
          { id: `${baseId}-e`, col, row, x: ix + rw + 4, y: iy + 4, w: 20, h: rw - 8, axis: 'v', phaseOffset, cycleDuration }
        );

        // 4 semáforos nas quinas do cruzamento, alinhados às faixas
        this.trafficLights.push(
          { id: `tl-${col}-${row}-nw`, col, row, x: ix - 10, y: iy - 10, axis: 'v', phaseOffset, cycleDuration },
          { id: `tl-${col}-${row}-ne`, col, row, x: ix + rw + 10, y: iy - 10, axis: 'h', phaseOffset, cycleDuration },
          { id: `tl-${col}-${row}-se`, col, row, x: ix + rw + 10, y: iy + rw + 10, axis: 'v', phaseOffset, cycleDuration },
          { id: `tl-${col}-${row}-sw`, col, row, x: ix - 10, y: iy + rw + 10, axis: 'h', phaseOffset, cycleDuration }
        );
      }
    }

    // Remove lixeiras das esquinas que possuem semáforos
    this.trashBinSpawns = this.trashBinSpawns.filter((bin) => {
      for (const light of this.trafficLights) {
        if (Math.abs(bin.x - light.x) < 32 && Math.abs(bin.y - light.y) < 32) {
          return false;
        }
      }
      return true;
    });
  }

  getTrafficLightState(item, time = 0) {
    const dur = item.cycleDuration || 12;
    const t = (((time + (item.phaseOffset || 0)) % dur) + dur) % dur;
    const isGreen = item.axis === 'v' ? t < dur * 0.5 : t >= dur * 0.5;
    return isGreen ? 'green' : 'red';
  }

  findNearbyCrosswalk(x, y, axis, maxDist = 58) {
    let best = null;
    let bestDist = Infinity;
    for (const cw of this.crosswalks) {
      if (cw.axis !== axis) continue;
      const cx = Math.max(cw.x, Math.min(cw.x + cw.w, x));
      const cy = Math.max(cw.y, Math.min(cw.y + cw.h, y));
      const d = Math.hypot(x - cx, y - cy);
      if (d <= maxDist && d < bestDist) {
        bestDist = d;
        best = cw;
      }
    }
    return best;
  }

  #buildVehicleSpawns() {
    let idCounter = 1;
    for (let by = 0; by < this.gridBlocks; by += 1) {
      for (let bx = 0; bx < this.gridBlocks; bx += 1) {
        const seed = hashBlock(bx + 7, by + 13);
        const variant = VEHICLE_VARIANTS[seed % VEHICLE_VARIANTS.length];
        const horizontal = seed % 2 === 0;
        const reverseLane = (seed >>> 1) % 2 === 1;
        const laneFactor = reverseLane ? 0.28 : 0.72;

        // Veículo em tráfego na faixa da rua (mão dupla)
        const tx = horizontal
          ? this.blockXOffsets[bx] + this.colWidths[bx] * (0.25 + ((seed >>> 3) % 5) * 0.12)
          : this.roadXOffsets[bx] + this.roadWidth * laneFactor;
        const ty = horizontal
          ? this.roadYOffsets[by] + this.roadWidth * laneFactor
          : this.blockYOffsets[by] + this.rowHeights[by] * (0.25 + ((seed >>> 3) % 5) * 0.12);
        const angle = horizontal
          ? (reverseLane ? Math.PI : 0)
          : (reverseLane ? -Math.PI / 2 : Math.PI / 2);

        this.vehicleSpawns.push({
          id: `VEH-${String(idCounter++).padStart(3, '0')}`,
          kind: variant.kind,
          model: variant.model,
          color: variant.color,
          x: tx,
          y: ty,
          angle,
          isParked: false,
          driver: 'npc'
        });

        // Veículo estacionado junto à calçada para o jogador pegar
        if ((bx + by) % 2 === 0) {
          const pVariant = VEHICLE_VARIANTS[(seed >>> 2) % VEHICLE_VARIANTS.length];
          const parkVertical = (seed >>> 4) % 2 === 1;
          const px = parkVertical
            ? this.blockXOffsets[bx] - 18
            : this.blockXOffsets[bx] + this.colWidths[bx] * 0.35;
          const py = parkVertical
            ? this.blockYOffsets[by] + this.rowHeights[by] * 0.35
            : this.blockYOffsets[by] - 18;
          this.vehicleSpawns.push({
            id: `VEH-${String(idCounter++).padStart(3, '0')}`,
            kind: pVariant.kind,
            model: pVariant.model,
            color: pVariant.color,
            x: px,
            y: py,
            angle: parkVertical ? Math.PI / 2 : 0,
            isParked: true,
            driver: null
          });
        }
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

  #findIndexRange(offsets, sizes, minVal, maxVal) {
    let start = 0;
    while (start < offsets.length && offsets[start] + sizes[start] < minVal) {
      start++;
    }
    let end = start;
    while (end < offsets.length && offsets[end] <= maxVal) {
      end++;
    }
    return [start, Math.min(offsets.length - 1, end)];
  }

  getVisibleBlocks(minX, minY, maxX, maxY) {
    const [startBx, endBx] = this.#findIndexRange(this.blockXOffsets, this.colWidths, minX, maxX);
    const [startBy, endBy] = this.#findIndexRange(this.blockYOffsets, this.rowHeights, minY, maxY);

    const visible = [];
    for (let by = startBy; by <= endBy; by++) {
      for (let bx = startBx; bx <= endBx; bx++) {
        visible.push(this.blocks[by][bx]);
      }
    }
    return visible;
  }

  getBlockAt(x, y) {
    for (let bx = 0; bx < this.gridBlocks; bx++) {
      const rx = this.blockXOffsets[bx];
      if (x >= rx && x <= rx + this.colWidths[bx]) {
        for (let by = 0; by < this.gridBlocks; by++) {
          const ry = this.blockYOffsets[by];
          if (y >= ry && y <= ry + this.rowHeights[by]) {
            return this.blocks[by][bx];
          }
        }
        return null;
      }
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
        if (x >= bb.x && x <= bb.x + bb.w && y >= bb.y && bb.y + bb.h >= y && y >= bb.y) {
          return building;
        }
      }
    }

    for (const road of this.horizontalRoads) {
      if (y >= road.bounds.y && y <= road.bounds.y + road.bounds.h) {
        return road;
      }
    }
    for (const road of this.verticalRoads) {
      if (x >= road.bounds.x && x <= road.bounds.x + road.bounds.w) {
        return road;
      }
    }
    return null;
  }

  getCollidersAround(x, y, margin = 120, forVehicle = false) {
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
        if (forVehicle) {
          colliders.push(building.bounds);
          continue;
        }
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
