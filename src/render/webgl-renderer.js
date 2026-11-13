import { createTextureAtlas } from './texture-atlas.js';

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  attribute vec4 a_color;

  uniform vec2 u_resolution;
  uniform vec2 u_camera;
  uniform float u_zoom;

  varying vec2 v_texCoord;
  varying vec4 v_color;

  void main() {
    vec2 screenPos = (a_position - u_camera) * u_zoom + u_resolution * 0.5;
    vec2 clipSpace = (screenPos / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
    v_texCoord = a_texCoord;
    v_color = a_color;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_image;
  varying vec2 v_texCoord;
  varying vec4 v_color;

  void main() {
    gl_FragColor = texture2D(u_image, v_texCoord) * v_color;
  }
`;

function hexToRgba(hex = '#ffffff', alpha = 1) {
  const clean = String(hex || '#ffffff').replace('#', '');
  const num = parseInt(clean, 16) || 0;
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
    alpha
  ];
}

export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false }) ||
               canvas.getContext('experimental-webgl', { alpha: false, antialias: false });

    if (!gl) {
      throw new Error('[WebGL] WebGL não está disponível neste navegador ou dispositivo.');
    }

    this.gl = gl;
    this.maxQuads = 12000;
    this.floatsPerVertex = 8;
    this.vertexData = new Float32Array(this.maxQuads * 6 * this.floatsPerVertex);
    this.quadCount = 0;

    this.#initShaders();
    this.#initBuffers();
    this.#initAtlas();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  #compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`[WebGL] Falha ao compilar shader: ${info}`);
    }
    return shader;
  }

  #initShaders() {
    const gl = this.gl;
    const vs = this.#compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.#compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`[WebGL] Falha ao linkar programa: ${gl.getProgramInfoLog(program)}`);
    }

    gl.useProgram(program);
    this.program = program;
    this.locPos = gl.getAttribLocation(program, 'a_position');
    this.locTex = gl.getAttribLocation(program, 'a_texCoord');
    this.locCol = gl.getAttribLocation(program, 'a_color');
    this.locResolution = gl.getUniformLocation(program, 'u_resolution');
    this.locCamera = gl.getUniformLocation(program, 'u_camera');
    this.locZoom = gl.getUniformLocation(program, 'u_zoom');
    this.zoom = 1.22;
  }

  #initBuffers() {
    const gl = this.gl;
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);

    const stride = this.floatsPerVertex * 4;
    gl.enableVertexAttribArray(this.locPos);
    gl.vertexAttribPointer(this.locPos, 2, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(this.locTex);
    gl.vertexAttribPointer(this.locTex, 2, gl.FLOAT, false, stride, 8);

    gl.enableVertexAttribArray(this.locCol);
    gl.vertexAttribPointer(this.locCol, 4, gl.FLOAT, false, stride, 16);
  }

  #initAtlas() {
    const gl = this.gl;
    const atlas = createTextureAtlas();
    this.uvs = atlas.uvs;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
  }

  resize(width, height) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    this.viewWidth = width;
    this.viewHeight = height;
  }

  #pushQuad(x, y, w, h, angle, uvName, rgba) {
    if (this.quadCount >= this.maxQuads) {
      return;
    }
    const uv = this.uvs[uvName] || this.uvs.solid;
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    const hw = w * 0.5;
    const hh = h * 0.5;
    const cos = angle ? Math.cos(angle) : 1;
    const sin = angle ? Math.sin(angle) : 0;

    const p0x = cx + (-hw * cos - -hh * sin);
    const p0y = cy + (-hw * sin + -hh * cos);
    const p1x = cx + (hw * cos - -hh * sin);
    const p1y = cy + (hw * sin + -hh * cos);
    const p2x = cx + (hw * cos - hh * sin);
    const p2y = cy + (hw * sin + hh * cos);
    const p3x = cx + (-hw * cos - hh * sin);
    const p3y = cy + (-hw * sin + hh * cos);

    const [r, g, b, a] = rgba;
    const d = this.vertexData;
    let i = this.quadCount * 6 * this.floatsPerVertex;

    const writeVert = (vx, vy, u, v) => {
      d[i++] = vx; d[i++] = vy;
      d[i++] = u; d[i++] = v;
      d[i++] = r; d[i++] = g; d[i++] = b; d[i++] = a;
    };

    writeVert(p0x, p0y, uv.u0, uv.v0);
    writeVert(p1x, p1y, uv.u1, uv.v0);
    writeVert(p2x, p2y, uv.u1, uv.v1);

    writeVert(p0x, p0y, uv.u0, uv.v0);
    writeVert(p2x, p2y, uv.u1, uv.v1);
    writeVert(p3x, p3y, uv.u0, uv.v1);

    this.quadCount++;
  }

  renderFrame({ camera, cityMap, vehicles, pedestrians = [], player, skidMarks, bloodMarks = [], smokeParticles = [], explosions = [], objectivePoint, time }) {
    const gl = this.gl;
    this.quadCount = 0;

    const halfW = ((this.viewWidth || 800) * 0.5) / this.zoom + 140;
    const halfH = ((this.viewHeight || 600) * 0.5) / this.zoom + 140;
    const minX = camera.x - halfW;
    const maxX = camera.x + halfW;
    const minY = camera.y - halfH;
    const maxY = camera.y + halfH;

    // Mar ao redor da ilha e asfalto apenas dentro dos limites da cidade
    const tileStep = 128;
    const tx0 = Math.floor(minX / tileStep) * tileStep;
    const ty0 = Math.floor(minY / tileStep) * tileStep;
    for (let ty = ty0; ty < maxY; ty += tileStep) {
      for (let tx = tx0; tx < maxX; tx += tileStep) {
        const insideIsland =
          tx + tileStep > 0 &&
          ty + tileStep > 0 &&
          tx < cityMap.worldWidth &&
          ty < cityMap.worldHeight;
        this.#pushQuad(tx, ty, tileStep, tileStep, 0, insideIsland ? 'asphalt' : 'water', [1, 1, 1, 1]);
      }
    }

    // Borda costeira (areia/cais) ao redor da ilha quando visível
    const shore = 18;
    if (minX < shore) {
      this.#pushQuad(-shore, Math.max(0, minY), shore, Math.min(cityMap.worldHeight, maxY) - Math.max(0, minY), 0, 'sidewalk', [0.85, 0.8, 0.65, 1]);
    }
    if (maxX > cityMap.worldWidth - shore) {
      this.#pushQuad(cityMap.worldWidth, Math.max(0, minY), shore, Math.min(cityMap.worldHeight, maxY) - Math.max(0, minY), 0, 'sidewalk', [0.85, 0.8, 0.65, 1]);
    }
    if (minY < shore) {
      this.#pushQuad(Math.max(-shore, minX), -shore, Math.min(cityMap.worldWidth + shore, maxX) - Math.max(-shore, minX), shore, 0, 'sidewalk', [0.85, 0.8, 0.65, 1]);
    }
    if (maxY > cityMap.worldHeight - shore) {
      this.#pushQuad(Math.max(-shore, minX), cityMap.worldHeight, Math.min(cityMap.worldWidth + shore, maxX) - Math.max(-shore, minX), shore, 0, 'sidewalk', [0.85, 0.8, 0.65, 1]);
    }

    // Faixas amarelas nas ruas visíveis dentro da ilha
    const stripeColor = [0.95, 0.78, 0.22, 0.85];
    const clampMinX = Math.max(0, Math.floor(minX / 64) * 64);
    const clampMaxX = Math.min(cityMap.worldWidth - 34, maxX);
    for (const roadY of cityMap.roadYOffsets) {
      if (roadY + cityMap.roadWidth < minY || roadY > maxY) continue;
      const ry = roadY + cityMap.roadWidth * 0.5 - 2;
      for (let sx = clampMinX; sx < clampMaxX; sx += 64) {
        this.#pushQuad(sx, ry, 34, 4, 0, 'solid', stripeColor);
      }
    }
    const clampMinY = Math.max(0, Math.floor(minY / 64) * 64);
    const clampMaxY = Math.min(cityMap.worldHeight - 34, maxY);
    for (const roadX of cityMap.roadXOffsets) {
      if (roadX + cityMap.roadWidth < minX || roadX > maxX) continue;
      const rx = roadX + cityMap.roadWidth * 0.5 - 2;
      for (let sy = clampMinY; sy < clampMaxY; sy += 64) {
        this.#pushQuad(rx, sy, 4, 34, 0, 'solid', stripeColor);
      }
    }

    // Quarteirões visíveis: primeiro o piso (calçadas e gramado das praças)
    const visibleBlocks = cityMap.getVisibleBlocks(minX, minY, maxX, maxY);
    for (const block of visibleBlocks) {
      const b = block.bounds;
      // Sombra de meio-fio e calçada
      this.#pushQuad(b.x - 4, b.y - 4, b.w + 8, b.h + 8, 0, 'solid', [0.16, 0.18, 0.22, 1]);
      this.#pushQuad(b.x, b.y, b.w, b.h, 0, 'sidewalk', [1, 1, 1, 1]);

      if (block.plaza) {
        const pb = block.plaza.bounds;
        this.#pushQuad(pb.x, pb.y, pb.w, pb.h, 0, 'grass', [1, 1, 1, 1]);
      }
    }

    // Marcas de drift (sobre asfalto, calçada e gramado)
    for (const mark of skidMarks) {
      if (mark.x < minX || mark.x > maxX || mark.y < minY || mark.y > maxY) continue;
      this.#pushQuad(mark.x - 4, mark.y - 4, 8, 8, mark.angle, 'solid', [0.06, 0.06, 0.08, mark.alpha]);
    }

    // Marcas de sangue de arrasto e impacto (sobre asfalto, calçada e gramado)
    for (const mark of bloodMarks) {
      if (mark.x < minX || mark.x > maxX || mark.y < minY || mark.y > maxY) continue;
      const s = mark.size || 8;
      this.#pushQuad(mark.x - s * 0.5, mark.y - s * 0.5, s, s, mark.angle || 0, 'solid', [0.58, 0.04, 0.05, mark.alpha]);
    }

    // Mobiliário de praça, obstáculos e edificações
    for (const block of visibleBlocks) {
      if (block.plaza) {
        for (const prop of block.plaza.props) {
          if (prop.kind === 'fountain') {
            this.#pushQuad(prop.x - 4, prop.y - 4, prop.w + 8, prop.h + 8, 0, 'solid', [0.75, 0.77, 0.8, 1]);
            this.#pushQuad(prop.x, prop.y, prop.w, prop.h, 0, 'water', [1, 1, 1, 1]);
          } else {
            this.#pushQuad(prop.x, prop.y, prop.w, prop.h, 0, 'solid', [0.55, 0.36, 0.2, 1]);
          }
        }
      }

      for (const obs of block.obstacles) {
        this.#pushQuad(obs.x, obs.y, obs.w, obs.h, 0, 'solid', [0.22, 0.24, 0.28, 1]);
      }

      for (const building of block.buildings) {
        const bb = building.bounds;
        const isInside = player.insideLocationCode === building.code;

        // Sombra suave da edificação
        this.#pushQuad(bb.x + 6, bb.y + 6, bb.w, bb.h, 0, 'solid', [0, 0, 0, 0.28]);

        // Interior sempre desenhado por baixo
        this.#pushQuad(bb.x, bb.y, bb.w, bb.h, 0, 'floor', hexToRgba(building.floorColor));
        for (const wall of building.interior.walls) {
          this.#pushQuad(wall.x, wall.y, wall.w, wall.h, 0, 'solid', [0.2, 0.22, 0.26, 1]);
        }
        for (const prop of building.interior.props) {
          const pCol = prop.kind === 'counter' ? [0.45, 0.28, 0.16, 1] : [0.6, 0.45, 0.3, 1];
          this.#pushQuad(prop.x, prop.y, prop.w, prop.h, 0, 'solid', pCol);
        }

        // Cobertura superior oculta quando o jogador está dentro
        if (!isInside) {
          this.#pushQuad(bb.x, bb.y, bb.w, bb.h, 0, 'roof', hexToRgba(building.roofColor));
        }

        // Indicação discreta da porta de entrada (soleira) e folha da porta animada
        if (building.doormat) {
          const dm = building.doormat;
          this.#pushQuad(dm.x, dm.y, dm.w, dm.h, 0, 'doormat', [1, 1, 1, 0.75]);
        }

        const ent = building.entrance;
        const openAmt = building.doorOpen || 0;
        const doorLen = 42;
        const doorThick = 6;
        let baseAngle = 0;
        let hingeX = ent.x;
        let hingeY = ent.y;
        let swingDir = 1;

        if (building.doorSide === 'south') {
          hingeX = ent.x + 2;
          hingeY = bb.y + bb.h - 7;
          baseAngle = 0;
          swingDir = -1;
        } else if (building.doorSide === 'north') {
          hingeX = ent.x + 2;
          hingeY = bb.y + 7;
          baseAngle = 0;
          swingDir = 1;
        } else if (building.doorSide === 'west') {
          hingeX = bb.x + 7;
          hingeY = ent.y + 2;
          baseAngle = Math.PI * 0.5;
          swingDir = -1;
        } else {
          hingeX = bb.x + bb.w - 7;
          hingeY = ent.y + 2;
          baseAngle = Math.PI * 0.5;
          swingDir = 1;
        }

        const doorAngle = baseAngle + swingDir * openAmt * 1.45;
        const doorCenterX = hingeX + Math.cos(doorAngle) * (doorLen * 0.5);
        const doorCenterY = hingeY + Math.sin(doorAngle) * (doorLen * 0.5);
        this.#pushQuad(
          doorCenterX - doorLen * 0.5,
          doorCenterY - doorThick * 0.5,
          doorLen,
          doorThick,
          doorAngle,
          'solid',
          [0.45, 0.28, 0.14, 1]
        );
      }
    }

    // Veículos visíveis (com escala/transparência ao afundar na água)
    for (const v of vehicles) {
      if (v.x < minX || v.x > maxX || v.y < minY || v.y > maxY) continue;
      const sinkScale = v.sinkScale ?? 1;
      const vHealth = v.health ?? 100;
      const baseRgba = hexToRgba(v.color, v.sinkAlpha ?? 1);
      const shade = v.destroyed ? 0.22 : 0.45 + 0.55 * (vHealth / 100);
      const rgba = [baseRgba[0] * shade, baseRgba[1] * shade, baseRgba[2] * shade, baseRgba[3]];
      if (v.sinkProgress > 0) {
        const ring = 24 + v.sinkProgress * 34;
        this.#pushQuad(v.x - ring * 0.5, v.y - ring * 0.5, ring, ring, 0, 'solid', [0.75, 0.92, 1, (1 - v.sinkProgress) * 0.45]);
      }
      const dentWidth = vHealth < 75 ? v.width * (0.9 + 0.1 * (vHealth / 100)) : v.width;
      const dentLength = vHealth < 75 ? v.length * (0.93 + 0.07 * (vHealth / 100)) : v.length;
      this.#pushQuad(
        v.x - dentLength * 0.5 * sinkScale,
        v.y - dentWidth * 0.5 * sinkScale,
        dentLength * sinkScale,
        dentWidth * sinkScale,
        v.angle,
        v.kind,
        rgba
      );
      if (vHealth < 75 && !v.destroyed) {
        const cos = Math.cos(v.angle);
        const sin = Math.sin(v.angle);
        const fx = v.x + cos * (v.length * 0.26);
        const fy = v.y + sin * (v.length * 0.26);
        this.#pushQuad(fx - 6, fy - 4, 12, 8, v.angle + 0.25, 'solid', [0.1, 0.1, 0.12, 0.55]);
        if (vHealth < 40) {
          const rx = v.x - cos * (v.length * 0.22);
          const ry = v.y - sin * (v.length * 0.22);
          this.#pushQuad(rx - 7, ry - 4, 14, 8, v.angle - 0.3, 'solid', [0.08, 0.08, 0.1, 0.65]);
        }
      }
      if (v.destroyed && v.burning) {
        const cos = Math.cos(v.angle);
        const sin = Math.sin(v.angle);
        const glowSize = Math.max(v.length, v.width) * (1.28 + Math.sin(time * 11 + v.x) * 0.1);
        this.#pushQuad(
          v.x - glowSize * 0.5,
          v.y - glowSize * 0.5,
          glowSize,
          glowSize,
          0,
          'circle',
          [1, 0.34, 0.04, 0.44]
        );
        const offsets = [-0.26, 0.0, 0.25];
        for (let fi = 0; fi < offsets.length; fi++) {
          const dist = v.length * offsets[fi];
          const wobble = Math.sin(time * 15 + fi * 2.1 + v.y) * 3.5;
          const fx = v.x + cos * dist - sin * wobble;
          const fy = v.y + sin * dist + cos * wobble;
          const fSize = (18 + Math.sin(time * 18 + fi * 1.7) * 5) * sinkScale;
          this.#pushQuad(fx - fSize * 0.5, fy - fSize * 0.5, fSize, fSize, 0, 'circle', [1, 0.5, 0.08, 0.88]);
          const core = fSize * 0.55;
          this.#pushQuad(fx - core * 0.5, fy - core * 0.5, core, core, 0, 'circle', [1, 0.9, 0.35, 0.92]);
        }
      }
      if (v.kind === 'moto' && v.driver === 'npc') {
        const riderScale = sinkScale;
        const riderAlpha = v.sinkAlpha ?? 1;
        this.#pushQuad(v.x - 10 * riderScale, v.y - 10 * riderScale, 20 * riderScale, 20 * riderScale, v.angle, 'solid', [0.22, 0.45, 0.72, riderAlpha]);
        this.#pushQuad(v.x + Math.cos(v.angle) * 3 * riderScale - 5 * riderScale, v.y + Math.sin(v.angle) * 3 * riderScale - 5 * riderScale, 10 * riderScale, 10 * riderScale, v.angle, 'solid', [0.92, 0.72, 0.52, riderAlpha]);
      }
    }

    // Pedestres NPC (caminhando na calçada ou caídos no chão)
    for (const ped of pedestrians) {
      if (ped.x < minX || ped.x > maxX || ped.y < minY || ped.y > maxY) continue;
      if (ped.state === 'downed') {
        this.#pushQuad(ped.x - 14, ped.y - 6, 28, 12, ped.angle, 'solid', ped.color);
        this.#pushQuad(ped.x + Math.cos(ped.angle) * 11 - 5, ped.y + Math.sin(ped.angle) * 11 - 5, 10, 10, ped.angle, 'solid', [0.92, 0.72, 0.52, 1]);
      } else {
        const swing = Math.sin(ped.walkPhase || 0) * 5;
        const cos = Math.cos(ped.angle);
        const sin = Math.sin(ped.angle);
        this.#pushQuad(ped.x + cos * swing - sin * -4 - 4, ped.y + sin * swing + cos * -4 - 3, 8, 6, ped.angle, 'solid', [0.15, 0.2, 0.3, 1]);
        this.#pushQuad(ped.x - cos * swing - sin * 4 - 4, ped.y - sin * swing + cos * 4 - 3, 8, 6, ped.angle, 'solid', [0.15, 0.2, 0.3, 1]);
        this.#pushQuad(ped.x - 10, ped.y - 10, 20, 20, ped.angle, 'solid', ped.color);
        this.#pushQuad(ped.x + cos * 6 - 5, ped.y + sin * 6 - 5, 10, 10, ped.angle, 'solid', [0.92, 0.72, 0.52, 1]);
      }
    }

    // Jogador a pé ou montado em moto (que não possui teto)
    const playerVehicle = player.inVehicleId ? vehicles.find((v) => v.id === player.inVehicleId) : null;
    const ridingMoto = Boolean(playerVehicle && playerVehicle.kind === 'moto');

    if (!player.inVehicleId || ridingMoto) {
      const pScale = ridingMoto ? (playerVehicle.sinkScale ?? 1) : (player.sinkScale ?? 1);
      const pAlpha = ridingMoto ? (playerVehicle.sinkAlpha ?? 1) : (player.sinkAlpha ?? 1);
      if (!ridingMoto && player.sinkProgress > 0) {
        const ring = 20 + player.sinkProgress * 28;
        this.#pushQuad(player.x - ring * 0.5, player.y - ring * 0.5, ring, ring, 0, 'solid', [0.75, 0.92, 1, (1 - player.sinkProgress) * 0.5]);
      }
      const swing = !ridingMoto && player.speed > 5 && !player.ejected?.active ? Math.sin(player.walkPhase || 0) * 6 : 0;
      const cos = Math.cos(player.angle);
      const sin = Math.sin(player.angle);
      const drawLimb = (forwardOffset, sideOffset, w, h, color) => {
        const lx = player.x + (cos * forwardOffset - sin * sideOffset) * pScale;
        const ly = player.y + (sin * forwardOffset + cos * sideOffset) * pScale;
        this.#pushQuad(lx - w * 0.5 * pScale, ly - h * 0.5 * pScale, w * pScale, h * pScale, player.angle, 'solid', [color[0], color[1], color[2], pAlpha]);
      };

      if (ridingMoto) {
        // Braços estendidos segurando o guidão
        drawLimb(8, -7, 9, 4, [0.92, 0.72, 0.52]);
        drawLimb(8, 7, 9, 4, [0.92, 0.72, 0.52]);
      } else {
        // Pernas alternadas
        drawLimb(swing, -5, 9, 6, [0.15, 0.22, 0.35]);
        drawLimb(-swing, 5, 9, 6, [0.15, 0.22, 0.35]);
        // Braços alternados (opostos às pernas)
        drawLimb(-swing * 0.85 + 2, -11, 8, 5, [0.92, 0.72, 0.52]);
        drawLimb(swing * 0.85 + 2, 11, 8, 5, [0.92, 0.72, 0.52]);
      }

      this.#pushQuad(player.x - 14 * pScale, player.y - 14 * pScale, 28 * pScale, 28 * pScale, player.angle, 'player', [1, 1, 1, pAlpha]);
    }

    // Fumaça de veículos danificados e explosões
    for (const p of smokeParticles) {
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      const fade = 1 - p.life / p.maxLife;
      this.#pushQuad(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size, p.life * 2, 'circle', [p.dark, p.dark, p.dark, p.alpha * fade]);
    }

    for (const ex of explosions) {
      const progress = Math.min(1, ex.timer / ex.duration);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const alpha = 1 - progress;

      // Círculo de deslocamento de ar (onda de choque que se expande e se desfaz)
      const shockDuration = ex.shockDuration || ex.duration * 0.65;
      const shockProgress = Math.min(1, ex.timer / shockDuration);
      if (shockProgress < 1) {
        const shockRadius = ex.shockRadius || (ex.shockMaxRadius || ex.radius * 1.6) * (1 - Math.pow(1 - shockProgress, 2.2));
        const shockDiameter = shockRadius * 2;
        const shockAlpha = Math.pow(1 - shockProgress, 1.35) * 0.88;
        this.#pushQuad(
          ex.x - shockRadius,
          ex.y - shockRadius,
          shockDiameter,
          shockDiameter,
          0,
          'shockwave',
          [1, 0.92, 0.78, shockAlpha]
        );
        // Anel interno de pressão secundário
        if (shockProgress > 0.08) {
          const innerR = shockRadius * 0.74;
          this.#pushQuad(
            ex.x - innerR,
            ex.y - innerR,
            innerR * 2,
            innerR * 2,
            0,
            'shockwave',
            [1, 0.68, 0.3, shockAlpha * 0.52]
          );
        }
      }

      // Clarão inicial quente
      if (progress < 0.32) {
        const flashAlpha = (1 - progress / 0.32) * 0.78;
        const flashSize = ex.radius * (0.9 + progress * 2.2);
        this.#pushQuad(
          ex.x - flashSize * 0.5,
          ex.y - flashSize * 0.5,
          flashSize,
          flashSize,
          0,
          'circle',
          [1, 0.88, 0.45, flashAlpha]
        );
      }

      // Bolas de fogo dinâmicas que se expandem e esfriam para fumaça escura
      const lobes = ex.lobes || [
        { angle: 0.2, distScale: 0.35, sizeScale: 0.85, delay: 0 },
        { angle: 1.7, distScale: 0.38, sizeScale: 0.8, delay: 0.04 },
        { angle: 3.3, distScale: 0.34, sizeScale: 0.85, delay: 0.08 },
        { angle: 4.9, distScale: 0.4, sizeScale: 0.75, delay: 0.03 }
      ];
      for (const lobe of lobes) {
        const lp = Math.max(0, Math.min(1, (progress - lobe.delay) / (1 - lobe.delay)));
        if (lp <= 0 || lp >= 1) continue;
        const lEase = 1 - Math.pow(1 - lp, 2.4);
        const offset = ex.radius * lobe.distScale * lEase;
        const fx = ex.x + Math.cos(lobe.angle) * offset;
        const fy = ex.y + Math.sin(lobe.angle) * offset;
        const lobeSize = ex.radius * lobe.sizeScale * Math.sin(lp * Math.PI);
        if (lobeSize > 2) {
          const cool = Math.min(1, lp * 1.25);
          const rCol = 0.98 * (1 - cool * 0.72);
          const gCol = 0.55 * (1 - cool * 0.85);
          const bCol = 0.1 * (1 - cool * 0.4);
          this.#pushQuad(
            fx - lobeSize * 0.5,
            fy - lobeSize * 0.5,
            lobeSize,
            lobeSize,
            lobe.angle,
            'circle',
            [rCol, gCol, bCol, (1 - lp) * 0.88]
          );
        }
      }

      // Núcleo branco-amarelado brilhante
      const coreSize = ex.radius * 0.92 * Math.sin(Math.min(1, progress * 1.55) * Math.PI);
      if (coreSize > 2 && progress < 0.65) {
        const coreAlpha = (1 - progress / 0.65) * 0.95;
        this.#pushQuad(ex.x - coreSize * 0.5, ex.y - coreSize * 0.5, coreSize, coreSize, 0, 'circle', [1, 0.95, 0.58, coreAlpha]);
      }

      // Faíscas radiantes de alta velocidade
      if (progress < 0.78) {
        const sparks = ex.sparks || [];
        const spAlpha = (1 - progress / 0.78) * 0.95;
        for (const sp of sparks) {
          const dist = ex.radius * (0.14 + easeOut * 1.35 * sp.speed);
          const sx = ex.x + Math.cos(sp.angle) * dist;
          const sy = ex.y + Math.sin(sp.angle) * dist;
          const sz = sp.size * (1 - progress * 0.65);
          this.#pushQuad(sx - sz * 0.5, sy - sz * 0.5, sz, sz, sp.angle, 'circle', [1, 0.84, 0.25, spAlpha]);
        }
      }
    }

    // Marcador de objetivo ativo no mundo + personagem do ponto de encontro
    if (objectivePoint) {
      const pulse = 1 + Math.sin(time * 5) * 0.18;
      const size = 34 * pulse;
      this.#pushQuad(
        objectivePoint.x - size * 0.5,
        objectivePoint.y - size * 0.5,
        size,
        size,
        0,
        'solid',
        [0.98, 0.75, 0.14, 0.55]
      );
      this.#pushQuad(
        objectivePoint.x - 12,
        objectivePoint.y - 12,
        24,
        24,
        Math.PI * 0.5,
        'pedestrian',
        [0.92, 0.25, 0.25, 1]
      );
    }

    gl.clearColor(0.08, 0.09, 0.12, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(this.locResolution, this.viewWidth || 800, this.viewHeight || 600);
    gl.uniform2f(this.locCamera, camera.x, camera.y);
    gl.uniform1f(this.locZoom, this.zoom);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData.subarray(0, this.quadCount * 6 * this.floatsPerVertex));
    gl.drawArrays(gl.TRIANGLES, 0, this.quadCount * 6);
  }
}
