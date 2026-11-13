import { createTextureAtlas } from './texture-atlas.js';

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  attribute vec4 a_color;

  uniform vec2 u_resolution;
  uniform vec2 u_camera;

  varying vec2 v_texCoord;
  varying vec4 v_color;

  void main() {
    vec2 screenPos = a_position - u_camera + u_resolution * 0.5;
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

  renderFrame({ camera, cityMap, vehicles, player, skidMarks, objectivePoint, time }) {
    const gl = this.gl;
    this.quadCount = 0;

    const halfW = (this.viewWidth || 800) * 0.5 + 140;
    const halfH = (this.viewHeight || 600) * 0.5 + 140;
    const minX = camera.x - halfW;
    const maxX = camera.x + halfW;
    const minY = camera.y - halfH;
    const maxY = camera.y + halfH;

    // Fundo asfalto da área visível
    this.#pushQuad(minX, minY, maxX - minX, maxY - minY, 0, 'asphalt', [1, 1, 1, 1]);

    // Faixas amarelas nas ruas visíveis
    const startCol = Math.max(0, Math.floor(minX / cityMap.cellStride));
    const endCol = Math.min(cityMap.gridBlocks, Math.ceil(maxX / cityMap.cellStride));
    const startRow = Math.max(0, Math.floor(minY / cityMap.cellStride));
    const endRow = Math.min(cityMap.gridBlocks, Math.ceil(maxY / cityMap.cellStride));

    const stripeColor = [0.95, 0.78, 0.22, 0.85];
    for (let row = startRow; row <= endRow; row++) {
      const ry = row * cityMap.cellStride + cityMap.roadWidth * 0.5 - 2;
      for (let sx = Math.floor(minX / 64) * 64; sx < maxX; sx += 64) {
        this.#pushQuad(sx, ry, 34, 4, 0, 'solid', stripeColor);
      }
    }
    for (let col = startCol; col <= endCol; col++) {
      const rx = col * cityMap.cellStride + cityMap.roadWidth * 0.5 - 2;
      for (let sy = Math.floor(minY / 64) * 64; sy < maxY; sy += 64) {
        this.#pushQuad(rx, sy, 4, 34, 0, 'solid', stripeColor);
      }
    }

    // Marcas de drift
    for (const mark of skidMarks) {
      if (mark.x < minX || mark.x > maxX || mark.y < minY || mark.y > maxY) continue;
      this.#pushQuad(mark.x - 4, mark.y - 4, 8, 8, mark.angle, 'solid', [0.06, 0.06, 0.08, mark.alpha]);
    }

    // Quarteirões visíveis
    const visibleBlocks = cityMap.getVisibleBlocks(minX, minY, maxX, maxY);
    for (const block of visibleBlocks) {
      const b = block.bounds;
      this.#pushQuad(b.x, b.y, b.w, b.h, 0, 'sidewalk', [1, 1, 1, 1]);

      if (block.plaza) {
        const pb = block.plaza.bounds;
        this.#pushQuad(pb.x, pb.y, pb.w, pb.h, 0, 'grass', [1, 1, 1, 1]);
        for (const prop of block.plaza.props) {
          const color = prop.kind === 'fountain' ? [0.35, 0.7, 0.9, 1] : [0.55, 0.36, 0.2, 1];
          this.#pushQuad(prop.x, prop.y, prop.w, prop.h, 0, 'solid', color);
        }
      }

      for (const obs of block.obstacles) {
        this.#pushQuad(obs.x, obs.y, obs.w, obs.h, 0, 'solid', [0.22, 0.24, 0.28, 1]);
      }

      for (const building of block.buildings) {
        const bb = building.bounds;
        const isInside = player.insideLocationCode === building.code;

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
      }
    }

    // Veículos visíveis
    for (const v of vehicles) {
      if (v.x < minX || v.x > maxX || v.y < minY || v.y > maxY) continue;
      this.#pushQuad(
        v.x - v.length * 0.5,
        v.y - v.width * 0.5,
        v.length,
        v.width,
        v.angle,
        v.kind,
        hexToRgba(v.color)
      );
    }

    // Jogador a pé
    if (!player.inVehicleId) {
      this.#pushQuad(player.x - 14, player.y - 14, 28, 28, player.angle, 'player', [1, 1, 1, 1]);
    }

    // Marcador de objetivo ativo no mundo
    if (objectivePoint) {
      const pulse = 1 + Math.sin(time * 5) * 0.18;
      const size = 28 * pulse;
      this.#pushQuad(
        objectivePoint.x - size * 0.5,
        objectivePoint.y - size * 0.5,
        size,
        size,
        0,
        'solid',
        [0.98, 0.75, 0.14, 0.65]
      );
    }

    gl.clearColor(0.08, 0.09, 0.12, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(this.locResolution, this.viewWidth || 800, this.viewHeight || 600);
    gl.uniform2f(this.locCamera, camera.x, camera.y);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData.subarray(0, this.quadCount * 6 * this.floatsPerVertex));
    gl.drawArrays(gl.TRIANGLES, 0, this.quadCount * 6);
  }
}
