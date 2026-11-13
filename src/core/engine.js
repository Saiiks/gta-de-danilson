import { CityMap } from '../world/city-map.js';
import { RoadPathfinder } from '../world/pathfinding.js';
import { InputManager } from '../input/input-manager.js';
import { WebGLRenderer } from '../render/webgl-renderer.js';
import {
  createVehicleEntity,
  findNearestVehicle,
  findSafeExitPosition,
  updatePedestrian,
  updateVehicle
} from '../physics/vehicle-physics.js';
import { Minimap } from '../ui/minimap.js';

export class Engine {
  constructor(canvas, minimapCanvas, touchControlsEl, hud) {
    this.canvas = canvas;
    this.hud = hud;
    this.renderer = new WebGLRenderer(canvas);
    this.minimap = new Minimap(minimapCanvas);
    this.input = new InputManager(touchControlsEl);

    this.cityMap = null;
    this.pathfinder = null;
    this.vehicles = [];
    this.skidMarks = [];
    this.routePoints = [];
    this.objectiveCode = null;
    this.objectivePoint = null;
    this.routeTimer = 0;
    this.elapsedTime = 0;
    this.lastTimestamp = 0;
    this.running = false;

    this.player = {
      x: 0,
      y: 0,
      angle: 0,
      speed: 0,
      walkPhase: 0,
      radius: 11,
      inVehicleId: null,
      insideLocationCode: null,
      currentLocationCode: null
    };

    this.camera = { x: 0, y: 0 };
  }

  initWorld() {
    this.hud.showLoading(35, 'Gerando cidade-base 30x30...');
    this.cityMap = new CityMap();
    this.pathfinder = new RoadPathfinder(this.cityMap);

    this.hud.showLoading(70, 'Posicionando veículos...');
    this.vehicles = this.cityMap.vehicleSpawns.map(createVehicleEntity);

    const startLoc = this.cityMap.resolveLocationCode('CASA-01');
    this.player.x = startLoc.spawnPoint.x;
    this.player.y = startLoc.spawnPoint.y;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;

    // Objetivo demonstrativo inicial para validar minimapa e rota sugerida
    this.setObjective('PRACA-01');

    this.#handleResize();
    window.addEventListener('resize', () => this.#handleResize());

    this.hud.showLoading(100, 'Pronto!');
    console.info('[Engine] Cidade-base inicializada com', this.cityMap.locationsByCode.size, 'locais codificados.');
  }

  setObjective(code) {
    if (!code) {
      this.objectiveCode = null;
      this.objectivePoint = null;
      this.routePoints = [];
      return;
    }
    const target = this.cityMap.resolveLocationCode(code);
    this.objectiveCode = target.code;
    this.objectivePoint = target.spawnPoint;
    this.routePoints = this.pathfinder.findRoute(this.player.x, this.player.y, this.objectiveCode);
  }

  #handleResize() {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  start() {
    this.hud.showGameHud();
    this.running = true;
    this.lastTimestamp = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTimestamp) / 1000));
      this.lastTimestamp = now;
      this.update(dt);
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  update(dt) {
    this.elapsedTime += dt;
    const input = this.input.update(dt);
    const activeVehicle = this.player.inVehicleId
      ? this.vehicles.find((v) => v.id === this.player.inVehicleId)
      : null;

    if (!activeVehicle) {
      updatePedestrian(this.player, input, dt, this.cityMap, this.vehicles);
      if (this.player.speed > 5) {
        this.player.walkPhase += dt * 14;
      } else {
        this.player.walkPhase = 0;
      }
      if (input.actionJustPressed) {
        const nearest = findNearestVehicle(this.player.x, this.player.y, this.vehicles);
        if (nearest) {
          nearest.driver = 'player';
          this.player.inVehicleId = nearest.id;
          this.player.insideLocationCode = null;
          this.input.consumeExitTrigger();
        }
      }
    } else {
      const shouldExit =
        input.comboExitJustPressed ||
        (input.canTriggerHoldExit && activeVehicle.speed < 25);

      if (shouldExit) {
        const exitPos = findSafeExitPosition(activeVehicle, this.player.radius, this.cityMap);
        activeVehicle.driver = null;
        this.player.inVehicleId = null;
        this.player.x = exitPos.x;
        this.player.y = exitPos.y;
        this.input.consumeExitTrigger();
      }
    }

    for (const v of this.vehicles) {
      updateVehicle(v, input, dt, this.cityMap);
      if (v.isDrifting && v.driftIntensity > 0.25) {
        this.skidMarks.push({
          x: v.x,
          y: v.y,
          angle: v.angle,
          alpha: Math.min(0.45, v.driftIntensity * 0.4)
        });
        if (this.skidMarks.length > 350) {
          this.skidMarks.shift();
        }
      }
    }

    if (this.player.inVehicleId) {
      const v = this.vehicles.find((item) => item.id === this.player.inVehicleId);
      if (v) {
        this.player.x = v.x;
        this.player.y = v.y;
        this.player.angle = v.angle;
      }
    }

    const loc = this.cityMap.getLocationAt(this.player.x, this.player.y);
    this.player.currentLocationCode = loc ? loc.code : 'CIDADE';
    this.player.insideLocationCode =
      !this.player.inVehicleId && loc && (loc.type === 'house' || loc.type === 'commerce')
        ? loc.code
        : null;

    if (this.objectivePoint && Math.hypot(this.player.x - this.objectivePoint.x, this.player.y - this.objectivePoint.y) < 48) {
      this.setObjective(null);
    }

    this.routeTimer += dt;
    if (this.objectiveCode && this.routeTimer >= 0.25) {
      this.routeTimer = 0;
      this.routePoints = this.pathfinder.findRoute(this.player.x, this.player.y, this.objectiveCode);
    }

    // Atualiza animação de abrir/fechar das portas próximas ao jogador
    const nearbyBlocks = this.cityMap.getVisibleBlocks(
      this.player.x - 400,
      this.player.y - 400,
      this.player.x + 400,
      this.player.y + 400
    );
    for (const block of nearbyBlocks) {
      for (const b of block.buildings) {
        const ex = b.entrance.x + b.entrance.w * 0.5;
        const ey = b.entrance.y + b.entrance.h * 0.5;
        const nearDoor = !this.player.inVehicleId && Math.hypot(this.player.x - ex, this.player.y - ey) < 42;
        const targetOpen = nearDoor ? 1 : 0;
        b.doorOpen = (b.doorOpen || 0) + (targetOpen - (b.doorOpen || 0)) * Math.min(1, dt * 12);
      }
    }

    this.camera.x += (this.player.x - this.camera.x) * Math.min(1, dt * 10);
    this.camera.y += (this.player.y - this.camera.y) * Math.min(1, dt * 10);

    const currentVehicle = this.player.inVehicleId
      ? this.vehicles.find((v) => v.id === this.player.inVehicleId)
      : null;

    this.hud.updateStatus({
      locationCode: this.player.currentLocationCode,
      vehicle: currentVehicle,
      isDrifting: Boolean(currentVehicle?.isDrifting),
      objectiveCode: this.objectiveCode
    });
  }

  render() {
    this.renderer.renderFrame({
      camera: this.camera,
      cityMap: this.cityMap,
      vehicles: this.vehicles,
      player: this.player,
      skidMarks: this.skidMarks,
      objectivePoint: this.objectivePoint,
      time: this.elapsedTime
    });
    this.minimap.render(this.cityMap, this.player, this.routePoints, this.objectivePoint);
  }
}
