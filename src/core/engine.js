import { CityMap } from '../world/city-map.js?v=20';
import { RoadPathfinder } from '../world/pathfinding.js';
import { TrafficManager } from '../world/traffic-manager.js?v=20';
import { BoatManager } from '../world/boat-manager.js?v=17';
import { InputManager } from '../input/input-manager.js?v=17';
import { WebGLRenderer } from '../render/webgl-renderer.js?v=17';
import { isInWater, resolveCircleStaticObstacle, resolveEntityCollisions, resolveVehiclePairCollision } from '../physics/collision.js?v=11';
import {
  applyPedestrianDamage,
  applyVehicleDamage,
  computeShockwaveDamage,
  computeShockwaveFalloff,
  createTrashBinEntity,
  createVehicleEntity,
  evaluateVehicleImpact,
  findNearestVehicle,
  findSafeExitPosition,
  hitTrashBin,
  isTouchingVehicle,
  updateEjectedPlayer,
  updatePedestrian,
  updateTrashBin,
  updateVehicle,
  updateVehicleCriticalState
} from '../physics/vehicle-physics.js?v=17';
import { Minimap } from '../ui/minimap.js';
import { Inventory } from './inventory.js?v=16';
import { getPendingMissionAssetUrls, preloadMissionAssets } from '../story/story-loader.js';

const PEDESTRIAN_CHAT_LINES = [
  'Opa! Cuidado com o trânsito por aqui!',
  'Você viu onde deixei a chave do meu carro?',
  'Dia bonito para dar uma volta na praça, né?',
  'Dizem que o Empório São Jorge tem as melhores entregas!',
  'Ei, você parece com pressa! Tá fazendo alguma missão?',
  'Se acelerar demais nas curvas vai sair derrapando!',
  'Tô só dando uma caminhada tranquila na calçada.',
  'Hoje a cidade está bem movimentada!',
  'Cuidado para não cair na água nas bordas da ilha!',
  'Se precisar de carona, tem vários carros estacionados por aí.'
];

export class Engine {
  constructor(canvas, minimapCanvas, touchControlsEl, hud, options = {}) {
    this.canvas = canvas;
    this.hud = hud;
    this.renderer = new WebGLRenderer(canvas);
    this.minimap = new Minimap(minimapCanvas);
    this.input = new InputManager(touchControlsEl);

    this.cityMap = options.cityMap || null;
    this.storyPackage = options.storyPackage || null;
    this.locationNames = this.storyPackage?.locationNames || new Map();
    this.cutscene = options.cutscene || null;
    this.pauseMenu = options.pauseMenu || null;
    this.inventoryController = options.inventoryController || null;
    this.preloadedUrls = options.preloadedUrls || new Set();
    this.onExitToTitle = options.onExitToTitle || null;

    this.inventory = new Inventory(5);
    this.awaitingExitTarget = false;
    this.currentMissionIndex = 0;
    this.freeRoamMode = !this.storyPackage;
    this.missionOutTriggered = false;
    this.completedNpcPoints = [];
    this.paused = false;

    this.pathfinder = null;
    this.trafficManager = null;
    this.vehicles = [];
    this.skidMarks = [];
    this.bloodMarks = [];
    this.smokeParticles = [];
    this.explosions = [];
    this.routePoints = [];
    this.objectiveCode = null;
    this.objectivePoint = null;
    this.objectiveNpcPoint = null;
    this.completedNpcPoints = [];
    this.objectiveLocationType = null;
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

    this.hud.onInventoryClick(() => {
      if (!this.running || this.player.isDead || this.deathSequence || this.cutscene?.active || this.hud.isMissionCompleteOpen() || this.paused) {
        return;
      }
      if (this.inventoryController?.isOpen) {
        if (this.inventoryController.mode === 'browse') this.inventoryController.close();
      } else {
        this.openInventory();
      }
    });
    this.#syncInventoryHud();

    this.#onKeyDown = (e) => {
      if (!this.running || this.player.isDead || this.deathSequence || this.hud.isMissionCompleteOpen()) return;
      if (e.key === 'Escape' && this.inventoryController?.isOpen) {
        this.inventoryController.close();
        return;
      }
      if (this.cutscene?.active) return;
      if (e.key === 'i' || e.key === 'I' || e.key === 'Tab') {
        e.preventDefault();
        if (this.inventoryController?.isOpen) {
          if (this.inventoryController.mode === 'browse') this.inventoryController.close();
        } else if (!this.paused) {
          this.openInventory();
        }
        return;
      }
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (this.inventoryController?.isOpen) return;
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

  async startMission(index, { skipIntro = false, preserveState = false } = {}) {
    if (!this.storyPackage || !this.storyPackage.missions?.length) {
      this.freeRoamMode = true;
      this.resetMatch();
      return;
    }

    const clamped = Math.max(0, Math.min(index, this.storyPackage.missions.length - 1));
    const mission = this.storyPackage.missions[clamped];
    const pendingUrls = getPendingMissionAssetUrls(this.storyPackage, clamped, this.preloadedUrls, {
      includeSplash: false
    });

    if (pendingUrls.length > 0) {
      this.paused = true;
      this.hud.showLoading(10, `Carregando ${mission.title}...`);
      await preloadMissionAssets(this.storyPackage, clamped, {
        includeSplash: false,
        preloadedUrls: this.preloadedUrls,
        onProgress: ({ loaded, total, ratio }) => {
          this.hud.showLoading(10 + ratio * 85, `Carregando recursos da missão (${loaded}/${total})...`);
        }
      });
      this.hud.showLoading(100, 'Missão pronta!');
      this.hud.showGameHud();
      this.paused = false;
    }

    this.currentMissionIndex = clamped;
    this.freeRoamMode = false;
    this.missionOutTriggered = false;
    this.completedNpcPoints = [];
    this.awaitingExitTarget = false;
    const needsPickup = Boolean(mission.pickupLocation && mission.giveItem);
    this.itemPickedUp = !needsPickup;
    const initialObjective = needsPickup ? mission.pickupLocation : mission.targetLocation;

    if (preserveState) {
      const currentVehicle = this.player.inVehicleId
        ? this.vehicles.find((v) => v.id === this.player.inVehicleId)
        : null;
      this.player.speed = 0;
      if (currentVehicle) {
        currentVehicle.vx = 0;
        currentVehicle.vy = 0;
        currentVehicle.speed = 0;
      }
      this.setObjective(initialObjective);
      this.trafficManager?.normalizeTrafficAtMissionStart?.(this.vehicles, this.player);
      this.hud.hideGameOver();
      this.missionCheckpoint = {
        missionIndex: clamped,
        x: this.player.x,
        y: this.player.y,
        angle: this.player.angle,
        health: this.player.health,
        inVehicleId: this.player.inVehicleId,
        vehiclePos: currentVehicle ? { x: currentVehicle.x, y: currentVehicle.y, angle: currentVehicle.angle } : null,
        inventorySlots: this.inventory.getSlots()
      };
    } else if (this.missionCheckpoint && this.missionCheckpoint.missionIndex === clamped) {
      const cp = this.missionCheckpoint;
      this.resetMatch(mission.startLocation, initialObjective);
      if (Array.isArray(cp.inventorySlots)) {
        this.inventory.clear();
        for (const item of cp.inventorySlots) {
          if (item) this.inventory.addItem(item);
        }
        this.#syncInventoryHud();
      }
      if (needsPickup && mission.giveItem && this.inventory.hasItem(mission.giveItem)) {
        this.itemPickedUp = true;
        this.setObjective(mission.targetLocation);
      }
      this.player.x = cp.x;
      this.player.y = cp.y;
      this.player.angle = cp.angle;
      this.player.health = cp.health;
      this.player.inVehicleId = cp.inVehicleId;
      if (cp.inVehicleId && cp.vehiclePos) {
        const v = this.vehicles.find((veh) => veh.id === cp.inVehicleId);
        if (v) {
          v.x = cp.vehiclePos.x;
          v.y = cp.vehiclePos.y;
          v.angle = cp.vehiclePos.angle;
          v.driver = 'player';
          v.isParked = false;
        }
      }
      this.camera.x = this.player.x;
      this.camera.y = this.player.y;
    } else {
      this.missionCheckpoint = null;
      this.inventory.clear();
      this.#syncInventoryHud();
      this.resetMatch(mission.startLocation, initialObjective);
    }

    this.pauseMenu?.configure(this.storyPackage.missions, clamped, {
      onPauseChange: (isPaused) => {
        this.paused = isPaused;
      },
      onRestartMission: () => {
        this.startMission(this.currentMissionIndex);
      },
      onSelectMission: (missionIdx) => {
        this.missionCheckpoint = null;
        this.startMission(missionIdx);
      },
      onExitToTitle: () => {
        this.onExitToTitle?.();
      }
    });

    const onMapReady = () => {
      if (!needsPickup && mission.giveItem && !this.inventory.hasItem(mission.giveItem)) {
        this.#grantMissionItem(mission.giveItem);
      }
      const bannerObjective = needsPickup
        ? (mission.pickupObjective || mission.objective)
        : mission.objective;
      this.hud?.showMissionBanner?.(clamped + 1, bannerObjective);
    };

    if (!skipIntro && mission.introCutscene?.steps?.length > 0 && this.cutscene) {
      this.cutscene.play(mission.introCutscene, this.storyPackage.characters, () => {
        onMapReady();
      });
    } else {
      onMapReady();
    }
  }

  #syncInventoryHud() {
    this.hud?.setInventoryCount?.(this.inventory.getCount(), this.inventory.capacity);
  }

  #grantMissionItem(itemId) {
    const itemDef = this.storyPackage?.items?.get(itemId);
    if (!itemDef) return;
    const res = this.inventory.addItem(itemDef);
    if (!res.ok && res.reason === 'inventory_full') {
      console.warn(`[Engine] Inventário cheio (${this.inventory.capacity}/${this.inventory.capacity}); não foi possível adicionar "${itemDef.name}".`);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(`Inventário cheio (${this.inventory.capacity}/${this.inventory.capacity})! Não foi possível guardar "${itemDef.name}".`);
      }
      return;
    }
    this.#syncInventoryHud();
  }

  openInventory() {
    if (!this.inventoryController || this.inventoryController.isOpen) return;
    this.inventoryController.openBrowse(this.inventory, () => {
      this.#syncInventoryHud();
    });
  }

  resetMatch(startCode = 'CASA-01', targetCode = null) {
    this.vehicles = this.cityMap.vehicleSpawns.map(createVehicleEntity);
    this.trashBins = (this.cityMap.trashBinSpawns || []).map(createTrashBinEntity);
    this.trafficManager = new TrafficManager(this.cityMap);
    this.boatManager = new BoatManager(this.cityMap);
    this.skidMarks = [];
    this.bloodMarks = [];
    this.smokeParticles = [];
    this.explosions = [];
    this.pendingGameOver = null;
    this.deathSequence = null;
    this.hud?.setDeathDesaturation?.(0);
    this.missionOutTriggered = false;
    this.completedNpcPoints = [];

    const startLoc = this.cityMap.resolveLocationCode(startCode);
    this.player.x = startLoc.spawnPoint.x;
    this.player.y = startLoc.spawnPoint.y;
    this.player.angle = 0;
    this.player.speed = 0;
    this.player.walkPhase = 0;
    this.player.health = 100;
    this.player.burnCooldown = 0;
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
    this.trafficManager?.normalizeTrafficAtMissionStart?.(this.vehicles, this.player);
    this.hud.hideGameOver();
  }

  applyDamage(amount, fatalReason = 'Você se deu mal!', { bypassResistance = false } = {}) {
    if (this.player.isDead || amount <= 0) return;
    const effectiveDamage = bypassResistance ? amount : Math.max(1, Math.round(amount * 0.55));
    this.player.health = Math.max(0, this.player.health - effectiveDamage);
    this.hud.triggerDamageFlash();
    if (this.player.health <= 0) {
      this.triggerGameOver(fatalReason);
    }
  }

  triggerGameOver(reason) {
    if (this.player.isDead || this.deathSequence) return;
    this.pendingGameOver = null;
    this.player.health = 0;
    this.player.deathReason = reason;
    this.deathSequence = {
      timer: 0,
      duration: 3.0,
      reason
    };
  }

  #finalizeGameOver(reason) {
    this.deathSequence = null;
    this.player.isDead = true;
    this.player.health = 0;
    this.player.deathReason = reason;
    this.hud?.setDeathDesaturation?.(1);
    this.hud.showGameOver(reason);
  }

  getLocationDisplayName(code) {
    if (!code) return '';
    return this.locationNames.get(code) || code;
  }

  setObjective(code) {
    if (!code) {
      this.objectiveCode = null;
      this.objectivePoint = null;
      this.objectiveNpcPoint = null;
      this.objectiveLocationType = null;
      this.routePoints = [];
      return;
    }
    const target = this.cityMap.resolveLocationCode(code);
    this.objectiveCode = target.code;
    this.objectivePoint = target.spawnPoint;
    this.objectiveLocationType = target.type || null;
    if ((target.type === 'commerce' || target.type === 'house') && target.bounds) {
      this.objectiveNpcPoint = {
        x: target.bounds.x + target.bounds.w * 0.5,
        y: target.bounds.y + target.bounds.h * 0.55
      };
    } else {
      this.objectiveNpcPoint = target.spawnPoint;
    }
    this.routePoints = this.pathfinder.findRoute(this.player.x, this.player.y, this.objectiveCode);
  }

  #worldToScreen(worldX, worldY) {
    const zoom = this.renderer?.zoom || 1;
    const viewW = this.renderer?.viewWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
    const viewH = this.renderer?.viewHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);
    return {
      x: (worldX - this.camera.x) * zoom + viewW * 0.5,
      y: (worldY - this.camera.y) * zoom + viewH * 0.5
    };
  }

  #isPickupStageActive() {
    const activeMission = this.storyPackage?.missions?.[this.currentMissionIndex];
    return Boolean(
      !this.itemPickedUp &&
      activeMission?.pickupLocation &&
      activeMission?.giveItem &&
      this.objectivePoint
    );
  }

  #isNearInteriorStoryNpc() {
    if (this.player.inVehicleId || this.#isPickupStageActive() || !this.objectiveNpcPoint) return false;
    const requiresBuildingEntry =
      this.objectiveLocationType === 'commerce' || this.objectiveLocationType === 'house';
    if (!requiresBuildingEntry) return false;
    const activeMission = this.storyPackage?.missions?.[this.currentMissionIndex];
    if (!activeMission || this.player.insideLocationCode !== activeMission.targetLocation) return false;
    return Math.hypot(this.player.x - this.objectiveNpcPoint.x, this.player.y - this.objectiveNpcPoint.y) < 58;
  }

  #resolvePlayerMissionNpcCollision() {
    if (this.player.inVehicleId || this.player.isDead) {
      return;
    }
    const npcs = [...(this.completedNpcPoints || [])];
    if (!this.#isPickupStageActive() && !this.missionOutTriggered && !this.freeRoamMode && this.objectiveNpcPoint) {
      npcs.push(this.objectiveNpcPoint);
    }
    if (npcs.length === 0) return;

    const radius = this.player.radius || 11;
    for (const npc of npcs) {
      const hit = resolveCircleStaticObstacle(this.player.x, this.player.y, radius, npc.x, npc.y, 11);
      if (!hit.collided) continue;
      const env = resolveEntityCollisions(hit.x, hit.y, radius, this.cityMap.getCollidersAround(hit.x, hit.y, 80));
      this.player.x = env.x;
      this.player.y = env.y;
    }
  }

  #findNearestTalkablePedestrian(x, y, maxDist = 52) {
    const peds = this.trafficManager?.pedestrians;
    if (!Array.isArray(peds)) return null;
    let best = null;
    let bestDist = maxDist;
    for (const ped of peds) {
      if (!ped || ped.isDead || ped.knockedDown) continue;
      const d = Math.hypot(x - ped.x, y - ped.y);
      if (d < bestDist) {
        bestDist = d;
        best = ped;
      }
    }
    return best;
  }

  #handleMissionArrival() {
    const mission = this.storyPackage.missions[this.currentMissionIndex];
    if (!mission) return;

    this.player.speed = 0;
    const finishMission = () => {
      if (this.objectiveNpcPoint) {
        const alreadySaved = this.completedNpcPoints.some(
          (pt) => Math.hypot(pt.x - this.objectiveNpcPoint.x, pt.y - this.objectiveNpcPoint.y) < 4
        );
        if (!alreadySaved) {
          this.completedNpcPoints.push({ x: this.objectiveNpcPoint.x, y: this.objectiveNpcPoint.y });
        }
      }
      this.setObjective(null);
      const hasNext = this.currentMissionIndex + 1 < this.storyPackage.missions.length;
      this.paused = true;
      this.hud.showMissionComplete(mission.title, hasNext, () => {
        this.paused = false;
        if (hasNext) {
          this.startMission(this.currentMissionIndex + 1, { preserveState: true });
        } else {
          this.freeRoamMode = true;
          this.setObjective(null);
        }
      });
    };

    const openDeliveryModal = (expectedId, onSuccess, onCancel) => {
      this.inventoryController.openDelivery(this.inventory, {
        prompt: mission.deliveryPrompt || 'Escolha o item correto do seu inventário para entregar:',
        expectedItemId: expectedId || mission.requireItem,
        wrongItemMessage: mission.wrongItemMessage || 'Não é esse item que o personagem espera. Tente outro!',
        onDeliver: () => {
          this.#syncInventoryHud();
          onSuccess?.();
        },
        onCancel
      });
    };

    const hasInlineDelivery = Boolean(
      mission.outroCutscene?.steps?.some((step) => step.type === 'deliver')
    );

    const runOutro = () => {
      if (mission.outroCutscene?.steps?.length > 0 && this.cutscene) {
        this.cutscene.play(
          mission.outroCutscene,
          this.storyPackage.characters,
          (result) => {
            if (result?.outcome === 'gameover') {
              this.triggerGameOver(result.reason || 'Você falhou na missão.');
            } else {
              finishMission();
            }
          },
          {
            onDeliverRequest: (stepItemId, onDelivered, onCancelled) => {
              if (!this.inventoryController) {
                onDelivered?.();
                return;
              }
              openDeliveryModal(stepItemId, onDelivered, onCancelled);
            }
          }
        );
      } else {
        finishMission();
      }
    };

    if (mission.requireItem && !hasInlineDelivery && this.inventoryController) {
      openDeliveryModal(mission.requireItem, runOutro, () => {
        this.missionOutTriggered = false;
        this.awaitingExitTarget = true;
      });
    } else {
      runOutro();
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
    this.elapsedTime += dt;
    const input = this.input.update(dt);

    if (input.pauseJustPressed && !this.player.isDead && !this.deathSequence && !this.cutscene?.active && !this.inventoryController?.isOpen && !this.hud.isMissionCompleteOpen()) {
      if (this.pauseMenu?.isOpen) this.pauseMenu.close();
      else this.pauseMenu?.open();
      return;
    }

    if (this.inventoryController?.isOpen) {
      this.inventoryController.updateInput(input);
      return;
    }

    if (this.paused) {
      if (this.hud.isMissionCompleteOpen()) {
        if (input.actionJustPressed) {
          this.hud.confirmMissionComplete();
        }
      } else {
        this.pauseMenu?.updateInput(input);
      }
      return;
    }

    if (this.cutscene?.active) {
      this.cutscene.updateInput(input);
      return;
    }

    if (this.player.isDead) {
      this.#updateParticles(dt);
      this.#updateExplosions(dt);
      if (input.actionJustPressed) {
        if (this.storyPackage && !this.freeRoamMode) {
          this.startMission(this.currentMissionIndex, { skipIntro: true });
        } else {
          this.resetMatch();
        }
      }
      return;
    }

    if (this.deathSequence) {
      this.input.setDrivingMode(false);
      this.deathSequence.timer += dt;
      const progress = Math.min(1, this.deathSequence.timer / this.deathSequence.duration);
      const timeScale = Math.max(0.03, Math.pow(1 - progress, 1.8));
      const scaledDt = dt * timeScale;

      this.hud?.setDeathDesaturation?.(progress);
      this.trafficManager.update(scaledDt, this.player, this.vehicles, this.trashBins, this.elapsedTime);

      const noInput = { moveX: 0, moveY: 0, actionPressed: false, secondaryPressed: false };
      for (const v of this.vehicles) {
        if (v.driver === 'npc') continue;
        if (Math.abs(v.x - this.player.x) > 1500) continue;
        updateVehicle(v, noInput, scaledDt, this.cityMap);
      }

      const nearbyVehicles = this.vehicles.filter(
        (v) => Math.abs(v.x - this.player.x) < 1200 && Math.abs(v.y - this.player.y) < 1200
      );
      this.#updateTrashBins(scaledDt, nearbyVehicles);
      this.#updateParticles(scaledDt);
      this.#updateExplosions(scaledDt);

      this.hud.updateStatus({
        locationCode: this.getLocationDisplayName(this.cityMap.getLocationAt(this.player.x, this.player.y)?.code || 'CIDADE'),
        vehicle: null,
        isDrifting: false,
        objectiveCode: this.getLocationDisplayName(this.objectiveCode),
        health: 0
      });

      if (this.deathSequence.timer >= this.deathSequence.duration) {
        this.#finalizeGameOver(this.deathSequence.reason);
      }
      return;
    }

    if (this.pendingGameOver) {
      this.pendingGameOver.timer += dt;
      this.#updateParticles(dt);
      this.#updateExplosions(dt);
      this.hud.updateStatus({
        locationCode: this.getLocationDisplayName(this.cityMap.getLocationAt(this.player.x, this.player.y)?.code || 'CIDADE'),
        vehicle: null,
        isDrifting: false,
        objectiveCode: this.getLocationDisplayName(this.objectiveCode),
        health: 0
      });
      if (this.pendingGameOver.timer >= this.pendingGameOver.duration && this.explosions.length === 0) {
        const reason = this.pendingGameOver.reason;
        this.pendingGameOver = null;
    this.deathSequence = null;
    this.hud?.setDeathDesaturation?.(0);
        this.triggerGameOver(reason);
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
        objectiveCode: this.getLocationDisplayName(this.objectiveCode),
        health: this.player.health
      });

      if (progress >= 1) {
        this.player.sinking.active = false;
        this.applyDamage(this.player.health || 100, 'Você caiu na água nos limites da ilha!', { bypassResistance: true });
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
          this.applyDamage(Math.max(1, Math.round(ejRes.extraDamage * 0.75)), 'Você colidiu fortemente após ser ejetado!');
        }
        this.#resolvePlayerMissionNpcCollision();
      } else {
        updatePedestrian(this.player, input, dt, this.cityMap, this.vehicles);
        this.#resolvePlayerMissionNpcCollision();
        if (this.player.speed > 5) {
          this.player.walkPhase += dt * 14;
        } else {
          this.player.walkPhase = 0;
        }
        if (input.actionJustPressed && !this.#isNearInteriorStoryNpc()) {
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
          } else {
            const ped = this.#findNearestTalkablePedestrian(this.player.x, this.player.y);
            if (ped) {
              ped.angle = Math.atan2(this.player.y - ped.y, this.player.x - ped.x);
              const line = PEDESTRIAN_CHAT_LINES[Math.floor(Math.random() * PEDESTRIAN_CHAT_LINES.length)];
              this.hud.showToast(`Morador: "${line}"`, { durationMs: 3000 });
            }
          }
        }
      }
    } else {
      const shouldExit =
        input.exitJustPressed ||
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

    this.input.setDrivingMode(Boolean(activeVehicle));

    this.trafficManager.update(dt, this.player, this.vehicles, this.trashBins, this.elapsedTime);
    this.boatManager?.update(dt);

    let maxPlayerImpact = 0;
    let playerHitBuilding = false;
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
        playerHitBuilding = Boolean(res.collided);
        impactMoveVx = preVx;
        impactMoveVy = preVy;
      }
      if (res.collided && res.impactSpeed > 75) {
        const dmgRes = applyVehicleDamage(v, res.impactSpeed);
        if (dmgRes.exploded) {
          this.#triggerVehicleExplosion(v);
        }
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
        if (pairRes.collided && pairRes.impactSpeed > 75) {
          if (applyVehicleDamage(vA, pairRes.impactSpeed).exploded) {
            this.#triggerVehicleExplosion(vA);
          }
          if (applyVehicleDamage(vB, pairRes.impactSpeed).exploded) {
            this.#triggerVehicleExplosion(vB);
          }
        }
        if (pairRes.collided && (vA.driver === 'player' || vB.driver === 'player')) {
          if (pairRes.impactSpeed > maxPlayerImpact) {
            maxPlayerImpact = pairRes.impactSpeed;
          }
        }
      }
    }

    // Contagem regressiva de 10s para veículos com até 30% de integridade
    for (const v of this.vehicles) {
      if (v.destroyed) continue;
      const crit = updateVehicleCriticalState(v, dt);
      if (crit.shouldExplode) {
        this.#triggerVehicleExplosion(v);
      }
    }

    // Fumaça em veículos com <= 50% de integridade (cinza) e <= 30% (preta + faíscas de fogo)
    for (const v of nearbyVehicles) {
      if (!v.destroyed && (v.health ?? 100) <= 50) {
        const isCritical = (v.health ?? 100) <= 30;
        v.smokeTimer = (v.smokeTimer || 0) - dt;
        const interval = isCritical ? 0.026 : 0.07;
        if (v.smokeTimer <= 0) {
          v.smokeTimer = interval;
          const hoodX = v.x + Math.cos(v.angle) * (v.length * 0.28);
          const hoodY = v.y + Math.sin(v.angle) * (v.length * 0.28);
          this.smokeParticles.push({
            x: hoodX + (Math.random() - 0.5) * 6,
            y: hoodY + (Math.random() - 0.5) * 6,
            vx: -v.vx * 0.08 + (Math.random() - 0.5) * (isCritical ? 22 : 14),
            vy: -v.vy * 0.08 - (isCritical ? 12 : 6) + (Math.random() - 0.5) * 14,
            size: (isCritical ? 14 : 11) + Math.random() * 8,
            alpha: isCritical ? 0.88 : 0.52,
            dark: isCritical ? 0.05 : 0.58,
            life: 0,
            maxLife: isCritical ? 1.9 : 1.6
          });
          if (isCritical && Math.random() < 0.45) {
            const flamePalette = [
              [1, 0.9, 0.22],
              [1, 0.48, 0.06],
              [0.95, 0.16, 0.04]
            ];
            this.smokeParticles.push({
              x: hoodX + (Math.random() - 0.5) * 8,
              y: hoodY + (Math.random() - 0.5) * 8,
              vx: -v.vx * 0.05 + (Math.random() - 0.5) * 26,
              vy: -18 + (Math.random() - 0.5) * 18,
              size: 7 + Math.random() * 5,
              alpha: 0.95,
              color: flamePalette[Math.floor(Math.random() * flamePalette.length)],
              life: 0,
              maxLife: 0.35 + Math.random() * 0.2
            });
          }
          while (this.smokeParticles.length > 320) {
            this.smokeParticles.shift();
          }
        }
      } else if (v.destroyed && v.burning) {
        v.burnSmokeTimer = (v.burnSmokeTimer || 0) - dt;
        if (v.burnSmokeTimer <= 0) {
          v.burnSmokeTimer = 0.055;
          this.smokeParticles.push({
            x: v.x + (Math.random() - 0.5) * 18,
            y: v.y + (Math.random() - 0.5) * 18,
            vx: (Math.random() - 0.5) * 16,
            vy: -16 + (Math.random() - 0.5) * 12,
            size: 16 + Math.random() * 10,
            alpha: 0.86,
            dark: 0.05,
            life: 0,
            maxLife: 1.8
          });
          const flamePalette = [
            [1, 0.9, 0.2],
            [1, 0.46, 0.05],
            [0.96, 0.14, 0.04]
          ];
          this.smokeParticles.push({
            x: v.x + (Math.random() - 0.5) * 20,
            y: v.y + (Math.random() - 0.5) * 14,
            vx: (Math.random() - 0.5) * 18,
            vy: -20 - Math.random() * 14,
            size: 10 + Math.random() * 7,
            alpha: 0.95,
            color: flamePalette[Math.floor(Math.random() * flamePalette.length)],
            life: 0,
            maxLife: 0.4 + Math.random() * 0.25
          });
          while (this.smokeParticles.length > 320) {
            this.smokeParticles.shift();
          }
        }
      }
    }

    // Dano por contato com veículos em chamas na rua
    if (this.player.burnCooldown > 0) {
      this.player.burnCooldown = Math.max(0, this.player.burnCooldown - dt);
    }
    for (const v of nearbyVehicles) {
      if (v.burnCooldown > 0) {
        v.burnCooldown = Math.max(0, v.burnCooldown - dt);
      }
      if (!v.destroyed || !v.burning) continue;

      if (!this.player.inVehicleId && !this.player.isDead && !this.pendingGameOver && this.player.burnCooldown <= 0) {
        if (isTouchingVehicle(this.player.x, this.player.y, this.player.radius, v, 7)) {
          this.player.burnCooldown = 0.45;
          this.applyDamage(14, 'Você se queimou em um veículo em chamas!');
        }
      }

      if (this.trafficManager?.pedestrians) {
        for (const ped of this.trafficManager.pedestrians) {
          if (ped.state !== 'downed' && isTouchingVehicle(ped.x, ped.y, ped.radius || 9, v, 5)) {
            ped.state = 'downed';
            ped.runOver = true;
          }
        }
      }

      for (const other of nearbyVehicles) {
        if (other.id === v.id || other.destroyed || (other.burnCooldown || 0) > 0) continue;
        if (isTouchingVehicle(other.x, other.y, other.radius, v, 4)) {
          other.burnCooldown = 0.5;
          other.health = Math.max(0, (other.health ?? 100) - 8);
          if (other.health <= 0) {
            this.#triggerVehicleExplosion(other);
          }
        }
      }
    }

    this.#updateParticles(dt);
    this.#updateExplosions(dt);
    this.#updateTrashBins(dt, nearbyVehicles);

    // Impacto de veículos em pessoas andando ou fugindo na rua
    const standingPeds = this.trafficManager.pedestrians.filter((p) => p.state !== 'downed');
    for (const v of nearbyVehicles) {
      if (v.speed <= 18) continue;
      for (const ped of standingPeds) {
        if (ped.state === 'downed' || (ped.hitCooldown || 0) > 0) continue;
        if (Math.abs(ped.x - v.x) > 48 || Math.abs(ped.y - v.y) > 48) continue;
        if (isTouchingVehicle(ped.x, ped.y, ped.radius || 10, v, 2)) {
          const dmg = Math.min(100, Math.max(18, Math.round(v.speed * 0.45)));
          const hit = applyPedestrianDamage(ped, dmg, v.vx, v.vy);
          if (hit.damaged) {
            this.bloodMarks.push({
              x: ped.x,
              y: ped.y,
              size: hit.downed ? 16 : 10,
              angle: v.angle,
              alpha: hit.downed ? 0.85 : 0.65
            });
            v.bloodTireTimer = 1.6;
          }
        }
      }
    }

    // Atropelamento de pessoas caídas no chão: desloca o corpo e deixa trilha de sangue
    const downedPeds = this.trafficManager.pedestrians.filter((p) => p.state === 'downed');
    for (const v of nearbyVehicles) {
      if (v.speed > 12) {
        const hitRadius = Math.max(v.width, v.height) * 0.45;
        for (const ped of downedPeds) {
          if (Math.hypot(v.x - ped.x, v.y - ped.y) < hitRadius) {
            const vLen = Math.hypot(v.vx, v.vy) || 1;
            const pushSpeed = Math.max(140, v.speed * 1.15);
            ped.vx = (v.vx / vLen) * pushSpeed;
            ped.vy = (v.vy / vLen) * pushSpeed;
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

    for (const ped of downedPeds) {
      const pSpeed = Math.hypot(ped.vx || 0, ped.vy || 0);
      if (pSpeed > 10) {
        const nextX = ped.x + ped.vx * dt;
        const nextY = ped.y + ped.vy * dt;
        const colliders = this.cityMap.getCollidersAround(nextX, nextY, 80);
        const res = resolveEntityCollisions(nextX, nextY, 10, colliders);
        ped.x = res.x;
        ped.y = res.y;
        const damp = Math.exp(-4.8 * dt);
        ped.vx = res.collided ? -ped.vx * 0.3 : ped.vx * damp;
        ped.vy = res.collided ? -ped.vy * 0.3 : ped.vy * damp;
        this.bloodMarks.push({
          x: ped.x,
          y: ped.y,
          size: 8,
          angle: Math.atan2(ped.vy, ped.vx),
          alpha: 0.72
        });
        while (this.bloodMarks.length > 260) {
          this.bloodMarks.shift();
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
        let dirX = moveLen > 1 ? impactMoveVx / moveLen : Math.cos(activeVehicle.angle);
        let dirY = moveLen > 1 ? impactMoveVy / moveLen : Math.sin(activeVehicle.angle);
        if (playerHitBuilding) {
          dirX = -dirX;
          dirY = -dirY;
        }
        const ejectSpeed = Math.min(460, Math.max(240, maxPlayerImpact * 0.95));

        activeVehicle.driver = null;
        this.player.inVehicleId = null;
        const spawnX = activeVehicle.x + dirX * (activeVehicle.radius + this.player.radius + 4);
        const spawnY = activeVehicle.y + dirY * (activeVehicle.radius + this.player.radius + 4);
        const safeColliders = this.cityMap.getCollidersAround(spawnX, spawnY, 80);
        const safePos = resolveEntityCollisions(spawnX, spawnY, this.player.radius, safeColliders);
        this.player.x = safePos.x;
        this.player.y = safePos.y;
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
        this.applyDamage(Math.max(1, Math.round(impact.damage * 0.7)), 'Você sofreu uma colisão fatal!');
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
    const reachedPickup =
      !this.itemPickedUp &&
      activeMission?.pickupLocation &&
      this.objectivePoint &&
      (Math.hypot(this.player.x - this.objectivePoint.x, this.player.y - this.objectivePoint.y) < 76 ||
        this.player.insideLocationCode === activeMission.pickupLocation);

    if (reachedPickup) {
      this.itemPickedUp = true;
      const itemDef = this.storyPackage?.items?.get(activeMission.giveItem);
      const itemName = itemDef?.name || 'Item';
      if (this.objectivePoint && itemDef?.imageUrl) {
        const screenPos = this.#worldToScreen(this.objectivePoint.x, this.objectivePoint.y);
        this.hud.updateWorldPickupItem(false);
        this.hud.animatePickupToInventory(screenPos.x, screenPos.y, itemDef.imageUrl, itemName);
      }
      if (activeMission.giveItem && !this.inventory.hasItem(activeMission.giveItem)) {
        this.#grantMissionItem(activeMission.giveItem);
      }
      const targetName = this.locationNames.get(activeMission.targetLocation) || activeMission.targetLocation;
      this.hud.showToast(`${itemName} guardada no inventário! Leve até ${targetName}.`, {
        imageUrl: itemDef?.imageUrl || '',
        imageAlt: itemName
      });
      this.setObjective(activeMission.targetLocation);
    } else {
      const requiresBuildingEntry =
        this.objectiveLocationType === 'commerce' || this.objectiveLocationType === 'house';
      const reachedTarget =
        this.objectivePoint &&
        (requiresBuildingEntry
          ? this.#isNearInteriorStoryNpc() && input.actionJustPressed
          : Math.hypot(this.player.x - this.objectivePoint.x, this.player.y - this.objectivePoint.y) < 76 ||
            Boolean(activeMission && this.player.insideLocationCode === activeMission.targetLocation));

      if (this.awaitingExitTarget) {
        if (!reachedTarget || (requiresBuildingEntry && input.actionJustPressed)) {
          this.awaitingExitTarget = false;
        }
      }
      if (!this.awaitingExitTarget && this.objectivePoint && !this.missionOutTriggered && reachedTarget) {
        if (this.storyPackage && !this.freeRoamMode) {
          this.missionOutTriggered = true;
          this.#handleMissionArrival();
        } else {
          this.setObjective(null);
        }
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

    const objectiveHint = this.#isNearInteriorStoryNpc()
      ? 'Aperte Ação para falar'
      : this.getLocationDisplayName(this.objectiveCode);

    this.hud.updateStatus({
      locationCode: this.getLocationDisplayName(this.player.currentLocationCode),
      vehicle: currentVehicle,
      isDrifting: Boolean(currentVehicle?.isDrifting),
      objectiveCode: objectiveHint,
      health: this.player.health
    });
  }

  #updateParticles(dt) {
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.smokeParticles.splice(i, 1);
        continue;
      }
      const damp = Math.exp(-2.0 * dt);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += 12 * dt;
    }
  }

  #updateTrashBins(dt, nearbyVehicles) {
    if (!this.trashBins || this.trashBins.length === 0) return;

    for (const bin of this.trashBins) {
      for (const v of nearbyVehicles) {
        if (v.speed <= 12) continue;
        if (Math.abs(bin.x - v.x) > 48 || Math.abs(bin.y - v.y) > 48) continue;
        if (isTouchingVehicle(bin.x, bin.y, bin.radius, v, 1)) {
          hitTrashBin(bin, v.vx, v.vy, v.x, v.y);
        }
      }

      if (!this.player.inVehicleId && !this.player.isDead && this.player.speed > 10) {
        const d = Math.hypot(bin.x - this.player.x, bin.y - this.player.y);
        if (d < bin.radius + this.player.radius) {
          const pvx = Math.cos(this.player.angle) * this.player.speed * 0.85;
          const pvy = Math.sin(this.player.angle) * this.player.speed * 0.85;
          hitTrashBin(bin, pvx, pvy, this.player.x, this.player.y, 75);
        }
      }

      if (bin.vx !== 0 || bin.vy !== 0 || bin.angVel !== 0) {
        updateTrashBin(bin, dt, this.cityMap);
        const binSpeed = Math.hypot(bin.vx, bin.vy);
        if (binSpeed > 45 && this.trafficManager?.pedestrians) {
          for (const ped of this.trafficManager.pedestrians) {
            if (ped.state === 'downed' || (ped.hitCooldown || 0) > 0) continue;
            if (Math.hypot(ped.x - bin.x, ped.y - bin.y) <= bin.radius + (ped.radius || 10)) {
              const dmg = Math.min(85, Math.max(15, Math.round(binSpeed * 0.22)));
              const hit = applyPedestrianDamage(ped, dmg, bin.vx, bin.vy);
              if (hit.damaged) {
                if (hit.downed || dmg >= 35) {
                  this.bloodMarks.push({
                    x: ped.x,
                    y: ped.y,
                    size: hit.downed ? 14 : 9,
                    angle: Math.atan2(bin.vy, bin.vx),
                    alpha: 0.72
                  });
                }
                bin.vx *= -0.45;
                bin.vy *= -0.45;
              }
            }
          }
        }
      }
    }
  }

  #updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.timer += dt;

      const shockProgress = Math.min(1, ex.timer / ex.shockDuration);
      const shockEase = 1 - Math.pow(1 - shockProgress, 2.2);
      ex.shockRadius = ex.shockMaxRadius * shockEase;

      if (!ex.shockDone) {
        if (!ex.hitIds.has('player') && this.player.inVehicleId == null) {
          const pDist = Math.hypot(this.player.x - ex.x, this.player.y - ex.y);
          if (pDist <= ex.shockRadius) {
            ex.hitIds.add('player');
            const dmg = computeShockwaveDamage(pDist, ex.shockMaxRadius, 95);
            if (dmg > 0) {
              this.applyDamage(dmg, 'Você foi atingido pelo deslocamento de ar da explosão!');
            }
          }
        }

        if (this.trafficManager?.pedestrians) {
          for (const ped of this.trafficManager.pedestrians) {
            const key = `ped:${ped.id}`;
            if (ex.hitIds.has(key)) continue;
            const d = Math.hypot(ped.x - ex.x, ped.y - ex.y);
            if (d <= ex.shockRadius) {
              ex.hitIds.add(key);
              const strength = computeShockwaveFalloff(d, ex.shockMaxRadius);
              if (strength > 0) {
                const ang = Math.atan2(ped.y - ex.y, ped.x - ex.x);
                ped.vx = Math.cos(ang) * 240 * strength;
                ped.vy = Math.sin(ang) * 240 * strength;
                if (strength >= 0.25) {
                  ped.state = 'downed';
                  ped.runOver = true;
                  this.bloodMarks.push({
                    x: ped.x,
                    y: ped.y,
                    size: 14,
                    angle: ang,
                    alpha: 0.82
                  });
                }
              }
            }
          }
        }

        for (const other of this.vehicles) {
          if (other.id === ex.sourceVehicleId || other.destroyed) continue;
          const key = `veh:${other.id}`;
          if (ex.hitIds.has(key)) continue;
          const d = Math.hypot(other.x - ex.x, other.y - ex.y);
          if (d <= ex.shockRadius) {
            ex.hitIds.add(key);
            const strength = computeShockwaveFalloff(d, ex.shockMaxRadius);
            if (strength > 0) {
              const ang = Math.atan2(other.y - ex.y, other.x - ex.x);
              other.vx += Math.cos(ang) * 190 * strength;
              other.vy += Math.sin(ang) * 190 * strength;
              const splashSpeed = Math.round(340 * strength);
              if (applyVehicleDamage(other, splashSpeed, 35).exploded) {
                this.#triggerVehicleExplosion(other);
              }
            }
          }
        }

        if (this.trashBins) {
          for (const bin of this.trashBins) {
            const key = `bin:${bin.id}`;
            if (ex.hitIds.has(key)) continue;
            const d = Math.hypot(bin.x - ex.x, bin.y - ex.y);
            if (d <= ex.shockRadius) {
              ex.hitIds.add(key);
              const strength = computeShockwaveFalloff(d, ex.shockMaxRadius);
              if (strength > 0) {
                const ang = Math.atan2(bin.y - ex.y, bin.x - ex.x);
                hitTrashBin(bin, Math.cos(ang) * 280 * strength, Math.sin(ang) * 280 * strength, ex.x, ex.y, 120 * strength);
              }
            }
          }
        }

        if (shockProgress >= 1) {
          ex.shockDone = true;
        }
      }

      if (ex.timer >= ex.duration) {
        this.explosions.splice(i, 1);
      }
    }
  }

  render() {
    const shakeAmp = this.shakeTimer > 0 ? this.shakeTimer * 18 : 0;
    const renderCam =
      shakeAmp > 0
        ? {
            x: this.camera.x + (Math.random() - 0.5) * shakeAmp,
            y: this.camera.y + (Math.random() - 0.5) * shakeAmp
          }
        : this.camera;
    const isPickupStage = this.#isPickupStageActive();
    const activeMission = this.storyPackage?.missions?.[this.currentMissionIndex];
    const pickupItemDef = isPickupStage ? this.storyPackage?.items?.get(activeMission.giveItem) : null;

    const hideTargetNpc = isPickupStage || this.missionOutTriggered || this.freeRoamMode;
    this.renderer.renderFrame({
      camera: renderCam,
      cityMap: this.cityMap,
      vehicles: this.vehicles,
      boats: this.boatManager ? this.boatManager.boats : [],
      trashBins: this.trashBins || [],
      pedestrians: this.trafficManager ? this.trafficManager.pedestrians : [],
      player: this.player,
      skidMarks: this.skidMarks,
      bloodMarks: this.bloodMarks,
      smokeParticles: this.smokeParticles,
      explosions: this.explosions,
      objectivePoint: hideTargetNpc ? null : this.objectivePoint,
      objectiveNpcPoint: hideTargetNpc ? null : this.objectiveNpcPoint,
      completedNpcPoints: this.completedNpcPoints,
      emitNpcWaves: !hideTargetNpc && Boolean(this.objectiveNpcPoint || this.objectivePoint),
      time: this.elapsedTime
    });
    if (isPickupStage && pickupItemDef?.imageUrl && !this.cutscene?.active && !this.paused && !this.player.isDead) {
      const screenPos = this.#worldToScreen(this.objectivePoint.x, this.objectivePoint.y);
      this.hud.updateWorldPickupItem(true, screenPos.x, screenPos.y, pickupItemDef.imageUrl, pickupItemDef.name);
    } else {
      this.hud.updateWorldPickupItem(false);
    }
    this.minimap.render(this.cityMap, this.player, this.routePoints, this.objectivePoint);
  }

  #triggerVehicleExplosion(vehicle) {
    if (!vehicle || vehicle.destroyed) return;
    vehicle.destroyed = true;
    vehicle.burning = true;
    vehicle.burnSmokeTimer = 0;
    vehicle.health = 0;
    vehicle.criticalTimer = 0;
    vehicle.driver = null;
    vehicle.vx = 0;
    vehicle.vy = 0;
    vehicle.speed = 0;
    vehicle.isDrifting = false;

    const blastRadius = 155;
    const shockMaxRadius = 215;
    const shockDuration = 0.62;
    const lobes = [];
    for (let i = 0; i < 7; i++) {
      lobes.push({
        angle: (Math.PI * 2 * i) / 7 + (Math.random() - 0.5) * 0.45,
        distScale: 0.28 + Math.random() * 0.42,
        sizeScale: 0.62 + Math.random() * 0.42,
        delay: Math.random() * 0.14
      });
    }
    const sparks = [];
    for (let i = 0; i < 18; i++) {
      sparks.push({
        angle: (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.35,
        speed: 0.75 + Math.random() * 0.75,
        size: 5 + Math.random() * 5
      });
    }

    const hitIds = new Set();
    if (this.player.inVehicleId === vehicle.id) {
      this.player.inVehicleId = null;
      this.player.health = 0;
      this.player.sinkAlpha = 0;
      this.hud.triggerDamageFlash();
      hitIds.add('player');
      this.triggerGameOver('Seu veículo explodiu!');
    }

    this.shakeTimer = 0.55;
    this.explosions.push({
      x: vehicle.x,
      y: vehicle.y,
      sourceVehicleId: vehicle.id,
      timer: 0,
      duration: 1.35,
      radius: blastRadius,
      shockMaxRadius,
      shockDuration,
      shockRadius: 0,
      shockDone: false,
      hitIds,
      lobes,
      sparks
    });

    this.skidMarks.push({
      x: vehicle.x,
      y: vehicle.y,
      angle: vehicle.angle,
      alpha: 0.78
    });

    for (let i = 0; i < 18; i++) {
      const a = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.25;
      const spd = 40 + Math.random() * 75;
      this.smokeParticles.push({
        x: vehicle.x,
        y: vehicle.y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 16,
        size: 16 + Math.random() * 14,
        alpha: 0.88,
        dark: 0.12,
        life: 0,
        maxLife: 1.25 + Math.random() * 0.45
      });
    }
  }
}
