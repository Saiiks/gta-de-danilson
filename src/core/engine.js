import { CityMap } from '../world/city-map.js';
import { RoadPathfinder } from '../world/pathfinding.js';
import { TrafficManager } from '../world/traffic-manager.js';
import { InputManager } from '../input/input-manager.js';
import { WebGLRenderer } from '../render/webgl-renderer.js';
import { isInWater, resolveVehiclePairCollision } from '../physics/collision.js';
import {
  createVehicleEntity,
  evaluateVehicleImpact,
  findNearestVehicle,
  findSafeExitPosition,
  updateEjectedPlayer,
  updatePedestrian,
  updateVehicle
} from '../physics/vehicle-physics.js';
import { Minimap } from '../ui/minimap.js';

export class Engine {
  constructor(canvas, minimapCanvas, touchControlsEl, hud, options = {}) {
    this.canvas = canvas;
    this.hud = hud;
    this.renderer = new WebGLRenderer(canvas);
    this.minimap = new Minimap(minimapCanvas);
    this.input = new InputManager(touchControlsEl);

    this.cityMap = options.cityMap || null;
    this.storyPackage = options.storyPackage || null;
    this.cutscene = options.cutscene || null;
    this.pauseMenu = options.pauseMenu || null;
    this.onExitToTitle = options.onExitToTitle || null;

    this.currentMissionIndex = 0;
    this.freeRoamMode = !this.storyPackage;
    this.missionOutTriggered = false;
    this.paused = false;

    this.pathfinder = null;
    this.trafficManager = null;
    this.vehicles = [];
    this.skidMarks = [];
    this.bloodMarks = [];
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
      health: 100,
      isDead: false,
      deathReason: null,
      inVehicleId: null,
      insideLocationCode: null,
      currentLocationCode: null,
      sinkScale: 1,
      sinkAlpha: 1,
      sinkProgress: 0,
      ejected: { active: false, vx: 0, vy: 0, hitCooldown: 0, graceTimer: 0, sourceVehicleId: null },
      sinking: { active: false, timer: 0, duration: 1.35, vehicleId: null, vx: 0, vy: 0 }
    };

    this.camera = { x: 0, y: 0 };
    this.hud.onRestartClick(() => {
      if (this.storyPackage && !this.freeRoamMode) {
        this.startMission(this.currentMissionIndex, { skipIntro: true });
      } else {
        this.resetMatch();
      }
    });

    this.#onKeyDown = (e) => {
      if (!this.running || this.player.isDead || this.cutscene?.active) return;
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (this.pauseMenu?.isOpen) this.pauseMenu.close();
        else this.pauseMenu?.open();
      }
    };
    window.addEventListener('keydown', this.#onKeyDown);
  }

  #onKeyDown = null;

  initWorld() {
    this.hud.showLoading(35, 'Gerando ilha e cidade-base 30x30...');
    if (!this.cityMap) {
      this.cityMap = new CityMap();
    }
    this.pathfinder = new RoadPathfinder(this.cityMap);

    this.hud.showLoading(70, 'Iniciando tráfego e pedestres...');
    this.resetMatch();

    this.#handleResize();
    this.#onResize = () => this.#handleResize();
    window.addEventListener('resize', this.#onResize);

    this.hud.showLoading(100, 'Pronto!');
    console.info('[Engine] Cidade-ilha inicializada com', this.cityMap.locationsByCode.size, 'locais codificados.');
  }

  #onResize = null;

  stop() {
    this.running = false;
    if (this.#onKeyDown) window.removeEventListener('keydown', this.#onKeyDown);
    if (this.#onResize) window.removeEventListener('resize', this.#onResize);
  }

  startMission(index, { skipIntro = false } = {}) {
    if (!this.storyPackage || !this.storyPackage.missions?.length) {
      this.freeRoamMode = true;
      this.resetMatch();
      return;
    }

    const clamped = Math.max(0, Math.min(index, this.storyPackage.missions.length - 1));
    this.currentMissionIndex = clamped;
    this.freeRoamMode = false;
    this.missionOutTriggered = false;
    const mission = this.storyPackage.missions[clamped];

    this.resetMatch(mission.startLocation, mission.targetLocation);

    this.pauseMenu?.configure(this.storyPackage.missions, clamped, {
      onPauseChange: (isPaused) => {
        this.paused = isPaused;
      },
      onRestartMission: () => {
        this.startMission(this.currentMissionIndex);
      },
      onSelectMission: (missionIdx) => {
        this.startMission(missionIdx);
      },
      onExitToTitle: () => {
        this.onExitToTitle?.();
      }
    });

    if (!skipIntro && mission.introCutscene?.steps?.length > 0 && this.cutscene) {
      this.cutscene.play(mission.introCutscene, this.storyPackage.characters, () => {});
    }
  }

  resetMatch(startCode = 'CASA-01', targetCode = null) {
    this.vehicles = this.cityMap.vehicleSpawns.map(createVehicleEntity);
    this.trafficManager = new TrafficManager(this.cityMap);
    this.skidMarks = [];
    this.bloodMarks = [];
    this.missionOutTriggered = false;

    const startLoc = this.cityMap.resolveLocationCode(startCode);
    this.player.x = startLoc.spawnPoint.x;
    this.player.y = startLoc.spawnPoint.y;
    this.player.angle = 0;
    this.player.speed = 0;
    this.player.walkPhase = 0;
    this.player.health = 100;
    this.player.isDead = false;
    this.player.deathReason = null;
    this.player.inVehicleId = null;
    this.player.insideLocationCode = null;
    this.player.sinkScale = 1;
    this.player.sinkAlpha = 1;
    this.player.sinkProgress = 0;
    this.player.ejected = { active: false, vx: 0, vy: 0, hitCooldown: 0, graceTimer: 0, sourceVehicleId: null };
    this.player.sinking = { active: false, timer: 0, duration: 1.35, vehicleId: null, vx: 0, vy: 0 };

    this.camera.x = this.player.x;
    this.camera.y = this.player.y;

    this.setObjective(targetCode);
    this.hud.hideGameOver();
  }

  applyDamage(amount, fatalReason = 'Você se deu mal!') {
    if (this.player.isDead || amount <= 0) return;
    this.player.health = Math.max(0, this.player.health - amount);
    this.hud.triggerDamageFlash();
    if (this.player.health <= 0) {
      this.triggerGameOver(fatalReason);
    }
  }

  triggerGameOver(reason) {
    if (this.player.isDead) return;
    this.player.isDead = true;
    this.player.health = 0;
    this.player.deathReason = reason;
    this.hud.showGameOver(reason);
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

  #handleMissionArrival() {
    const mission = this.storyPackage.missions[this.currentMissionIndex];
    if (!mission) return;

    this.player.speed = 0;
    const finishMission = () => {
      const hasNext = this.currentMissionIndex + 1 < this.storyPackage.missions.length;
      this.paused = true;
      this.hud.showMissionComplete(mission.title, hasNext, () => {
        this.paused = false;
        if (hasNext) {
          this.startMission(this.currentMissionIndex + 1);
        } else {
          this.freeRoamMode = true;
          this.setObjective(null);
        }
      });
    };

    if (mission.outroCutscene?.steps?.length > 0 && this.cutscene) {
      this.cutscene.play(mission.outroCutscene, this.storyPackage.characters, (result) => {
        if (result?.outcome === 'gameover') {
          this.triggerGameOver(result.reason || 'Você falhou na missão.');
        } else {
          finishMission();
        }
      });
    } else {
      finishMission();
    }
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
    if (this.paused) return;

    this.elapsedTime += dt;
    const input = this.input.update(dt);

    if (this.cutscene?.active) {
      this.cutscene.updateInput(input);
      return;
    }

    if (this.player.isDead) {
      if (input.actionJustPressed) {
        if (this.storyPackage && !this.freeRoamMode) {
          this.startMission(this.currentMissionIndex, { skipIntro: true });
        } else {
          this.resetMatch();
        }
      }
      return;
    }

    if (this.player.sinking.active) {
      const s = this.player.sinking;
      s.timer += dt;
      const progress = Math.min(1, s.timer / s.duration);
      const damp = Math.exp(-3.2 * dt);
      s.vx *= damp;
      s.vy *= damp;

      if (s.vehicleId) {
        const sv = this.vehicles.find((v) => v.id === s.vehicleId);
        if (sv) {
          sv.x += s.vx * dt;
          sv.y += s.vy * dt;
          sv.sinkProgress = progress;
          sv.sinkScale = 1 - progress * 0.72;
          sv.sinkAlpha = 1 - progress * 0.88;
          this.player.x = sv.x;
          this.player.y = sv.y;
        }
      } else {
        this.player.x += s.vx * dt;
        this.player.y += s.vy * dt;
        this.player.sinkProgress = progress;
        this.player.sinkScale = 1 - progress * 0.72;
        this.player.sinkAlpha = 1 - progress * 0.88;
      }

      this.hud.updateStatus({
        locationCode: 'ÁGUA',
        vehicle: null,
        isDrifting: false,
        objectiveCode: this.objectiveCode,
        health: this.player.health
      });

      if (progress >= 1) {
        this.player.sinking.active = false;
        this.applyDamage(this.player.health || 100, 'Você caiu na água nos limites da ilha!');
      }
      return;
    }

    let activeVehicle = this.player.inVehicleId
      ? this.vehicles.find((v) => v.id === this.player.inVehicleId)
      : null;

    if (!activeVehicle) {
      if (this.player.ejected.active) {
        const ejRes = updateEjectedPlayer(this.player, dt, this.cityMap, this.vehicles);
        if (this.player.speed > 35) {
          this.bloodMarks.push({
            x: this.player.x,
            y: this.player.y,
            size: 7,
            angle: this.player.angle,
            alpha: 0.72
          });
          if (this.bloodMarks.length > 260) {
            this.bloodMarks.shift();
          }
        }
        if (ejRes.extraDamage > 0) {
          this.bloodMarks.push(
            { x: this.player.x, y: this.player.y, size: 16, angle: this.player.angle, alpha: 0.88 },
            { x: this.player.x + 8, y: this.player.y - 6, size: 8, angle: 0, alpha: 0.78 },
            { x: this.player.x - 7, y: this.player.y + 7, size: 7, angle: 0, alpha: 0.78 }
          );
          this.applyDamage(ejRes.extraDamage, 'Você colidiu fortemente após ser ejetado!');
        }
      } else {
        updatePedestrian(this.player, input, dt, this.cityMap, this.vehicles);
        if (this.player.speed > 5) {
          this.player.walkPhase += dt * 14;
        } else {
          this.player.walkPhase = 0;
        }
        if (input.actionJustPressed) {
          const nearest = findNearestVehicle(this.player.x, this.player.y, this.vehicles);
          if (nearest) {
            if (nearest.driver === 'npc') {
              this.trafficManager.evictDriver(nearest, this.player.radius);
            }
            nearest.driver = 'player';
            nearest.isParked = false;
            this.player.inVehicleId = nearest.id;
            this.player.insideLocationCode = null;
            this.input.consumeExitTrigger();
            activeVehicle = nearest;
          }
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
        activeVehicle = null;
      }
    }

    this.trafficManager.update(dt, this.player, this.vehicles);

    let maxPlayerImpact = 0;
    let impactMoveVx = activeVehicle ? activeVehicle.vx : 0;
    let impactMoveVy = activeVehicle ? activeVehicle.vy : 0;
    for (const v of this.vehicles) {
      if (v.driver === 'npc') continue;
      if (v.driver !== 'player' && Math.abs(v.x - this.player.x) > 1500) continue;
      const preVx = v.vx;
      const preVy = v.vy;
      const res = updateVehicle(v, input, dt, this.cityMap);
      if (v.driver === 'player' && res.impactSpeed > maxPlayerImpact) {
        maxPlayerImpact = res.impactSpeed;
        impactMoveVx = preVx;
        impactMoveVy = preVy;
      }
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

    // Colisão veículo-veículo na área próxima ao jogador
    const nearbyVehicles = this.vehicles.filter(
      (v) => Math.abs(v.x - this.player.x) < 1200 && Math.abs(v.y - this.player.y) < 1200
    );
    for (let i = 0; i < nearbyVehicles.length; i++) {
      for (let j = i + 1; j < nearbyVehicles.length; j++) {
        const vA = nearbyVehicles[i];
        const vB = nearbyVehicles[j];
        const pairRes = resolveVehiclePairCollision(vA, vB);
        if (pairRes.collided && (vA.driver === 'player' || vB.driver === 'player')) {
          if (pairRes.impactSpeed > maxPlayerImpact) {
            maxPlayerImpact = pairRes.impactSpeed;
          }
        }
      }
    }

    // Atropelamento de pessoas caídas no chão: veículo passa por cima e deixa trilha de sangue
    const downedPeds = this.trafficManager.pedestrians.filter((p) => p.state === 'downed');
    for (const v of nearbyVehicles) {
      if (v.speed > 12) {
        const hitRadius = Math.max(v.width, v.height) * 0.45;
        for (const ped of downedPeds) {
          if (Math.hypot(v.x - ped.x, v.y - ped.y) < hitRadius) {
            if (!ped.runOver) {
              ped.runOver = true;
              this.bloodMarks.push({
                x: ped.x,
                y: ped.y,
                size: 16,
                angle: v.angle,
                alpha: 0.85
              });
            }
            v.bloodTireTimer = 1.8;
          }
        }
      }
      if (v.bloodTireTimer > 0) {
        v.bloodTireTimer = Math.max(0, v.bloodTireTimer - dt);
        if (v.speed > 12) {
          this.bloodMarks.push({
            x: v.x,
            y: v.y,
            size: 7,
            angle: v.angle,
            alpha: Math.min(0.75, v.bloodTireTimer * 0.45)
          });
          while (this.bloodMarks.length > 260) {
            this.bloodMarks.shift();
          }
        }
      }
    }

    if (activeVehicle) {
      this.player.x = activeVehicle.x;
      this.player.y = activeVehicle.y;
      this.player.angle = activeVehicle.angle;

      const impact = evaluateVehicleImpact(maxPlayerImpact);
      if (impact.eject) {
        const moveLen = Math.hypot(impactMoveVx, impactMoveVy);
        const dirX = moveLen > 1 ? impactMoveVx / moveLen : Math.cos(activeVehicle.angle);
        const dirY = moveLen > 1 ? impactMoveVy / moveLen : Math.sin(activeVehicle.angle);
        const ejectSpeed = Math.min(460, Math.max(240, maxPlayerImpact * 0.95));

        activeVehicle.driver = null;
        this.player.inVehicleId = null;
        this.player.x = activeVehicle.x + dirX * (activeVehicle.radius + this.player.radius + 4);
        this.player.y = activeVehicle.y + dirY * (activeVehicle.radius + this.player.radius + 4);
        this.player.angle = Math.atan2(dirY, dirX);
        this.player.ejected = {
          active: true,
          vx: dirX * ejectSpeed,
          vy: dirY * ejectSpeed,
          hitCooldown: 0.15,
          graceTimer: 0.25,
          sourceVehicleId: activeVehicle.id
        };
        this.input.consumeExitTrigger();
        this.applyDamage(impact.damage, 'Você sofreu uma colisão fatal!');
      }
    }

    if (isInWater(this.player.x, this.player.y, this.cityMap) && !this.player.sinking.active && !this.player.isDead) {
      const sv = this.player.inVehicleId
        ? this.vehicles.find((v) => v.id === this.player.inVehicleId)
        : null;
      this.hud.triggerDamageFlash();
      this.player.sinking = {
        active: true,
        timer: 0,
        duration: 1.35,
        vehicleId: sv ? sv.id : null,
        vx: sv ? sv.vx * 0.45 : Math.cos(this.player.angle) * 90,
        vy: sv ? sv.vy * 0.45 : Math.sin(this.player.angle) * 90
      };
    }

    const loc = this.cityMap.getLocationAt(this.player.x, this.player.y);
    this.player.currentLocationCode = loc ? loc.code : 'CIDADE';
    this.player.insideLocationCode =
      !this.player.inVehicleId && loc && (loc.type === 'house' || loc.type === 'commerce')
        ? loc.code
        : null;

    const activeMission = this.storyPackage?.missions?.[this.currentMissionIndex];
    const reachedTarget =
      this.objectivePoint &&
      (Math.hypot(this.player.x - this.objectivePoint.x, this.player.y - this.objectivePoint.y) < 76 ||
        (activeMission && this.player.insideLocationCode === activeMission.targetLocation));

    if (this.objectivePoint && !this.missionOutTriggered && reachedTarget) {
      if (this.storyPackage && !this.freeRoamMode) {
        this.missionOutTriggered = true;
        this.#handleMissionArrival();
      } else {
        this.setObjective(null);
      }
    }

    this.routeTimer += dt;
    if (this.objectiveCode && this.routeTimer >= 0.25) {
      this.routeTimer = 0;
      this.routePoints = this.pathfinder.findRoute(this.player.x, this.player.y, this.objectiveCode);
    }

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
      objectiveCode: this.objectiveCode,
      health: this.player.health
    });
  }

  render() {
    this.renderer.renderFrame({
      camera: this.camera,
      cityMap: this.cityMap,
      vehicles: this.vehicles,
      pedestrians: this.trafficManager ? this.trafficManager.pedestrians : [],
      player: this.player,
      skidMarks: this.skidMarks,
      bloodMarks: this.bloodMarks,
      objectivePoint: this.objectivePoint,
      time: this.elapsedTime
    });
    this.minimap.render(this.cityMap, this.player, this.routePoints, this.objectivePoint);
  }
}
