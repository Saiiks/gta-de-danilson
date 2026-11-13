export class HudController {
  constructor() {
    this.shell = document.getElementById('game-shell');
    this.canvasEl = document.getElementById('game-canvas');
    this.hudLayer = document.getElementById('hud-layer');
    this.startScreen = document.getElementById('start-screen');
    this.startButton = document.getElementById('start-button');
    this.loadingScreen = document.getElementById('loading-screen');
    this.loadingBar = document.getElementById('loading-bar');
    this.loadingText = document.getElementById('loading-text');
    this.errorScreen = document.getElementById('error-screen');
    this.errorMessage = document.getElementById('error-message');

    this.locationCodeEl = document.getElementById('location-code');
    this.vehicleStatusEl = document.getElementById('vehicle-status');
    this.objectiveHintEl = document.getElementById('objective-hint');
    this.healthFillEl = document.getElementById('health-fill');
    this.healthValueEl = document.getElementById('health-value');
    this.vehicleHealthBadgeEl = document.getElementById('vehicle-health-badge');
    this.vehicleHealthFillEl = document.getElementById('vehicle-health-fill');
    this.vehicleHealthValueEl = document.getElementById('vehicle-health-value');
    this.gameoverScreen = document.getElementById('gameover-screen');
    this.gameoverReasonEl = document.getElementById('gameover-reason');
    this.restartButton = document.getElementById('restart-button');
    this.damageFlashEl = document.getElementById('damage-flash');
    this.damageFlashTimer = null;

    this.startTitleEl = document.getElementById('start-title');
    this.startSubtitleEl = document.getElementById('start-subtitle');
    this.startSplashEl = document.getElementById('start-splash');

    this.missionCompleteScreen = document.getElementById('mission-complete-screen');
    this.missionCompleteTitleEl = document.getElementById('mission-complete-title');
    this.missionCompleteSubtitleEl = document.getElementById('mission-complete-subtitle');
    this.missionCompleteBtn = document.getElementById('mission-complete-btn');
    this.portraitWarning = document.getElementById('portrait-warning');
    this.iosInstallHint = document.getElementById('ios-install-hint');
    this.hasStarted = false;
    this.missionCompleteHandler = null;
    this.missionCompleteBtn.addEventListener('click', () => {
      this.missionCompleteScreen.classList.add('hidden');
      const cb = this.missionCompleteHandler;
      this.missionCompleteHandler = null;
      cb?.();
    });

    this.#bindOrientationAndFullscreen();
  }

  isTouchDevice() {
    return (
      (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) ||
      (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    );
  }

  isPortraitOrientation() {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia && window.matchMedia('(orientation: portrait)').matches) {
      return true;
    }
    return window.innerHeight > window.innerWidth;
  }

  isPortraitBlocked() {
    return Boolean(this.portraitWarning && !this.portraitWarning.classList.contains('hidden'));
  }

  requestAppFullscreen() {
    try {
      if (this.shell?.requestFullscreen && !document.fullscreenElement) {
        Promise.resolve(this.shell.requestFullscreen()).catch(() => {});
      }
    } catch {
      // Navegador pode restringir fullscreen; mantém 100vw/100dvh
    }
  }

  exitAppFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        Promise.resolve(document.exitFullscreen()).catch(() => {});
      }
    } catch {
      // Ignora erro ao sair do fullscreen
    }
  }

  syncOrientationAndFullscreen() {
    const blocked = this.isTouchDevice() && this.isPortraitOrientation();
    if (blocked) {
      this.portraitWarning?.classList.remove('hidden');
      this.exitAppFullscreen();
    } else {
      this.portraitWarning?.classList.add('hidden');
    }
    return !blocked;
  }

  #bindOrientationAndFullscreen() {
    if (typeof window === 'undefined') return;
    const onOrientationCheck = () => {
      this.syncOrientationAndFullscreen();
    };
    window.addEventListener('resize', onOrientationCheck);
    window.addEventListener('orientationchange', onOrientationCheck);
    if (window.matchMedia) {
      const mq = window.matchMedia('(orientation: portrait)');
      mq.addEventListener?.('change', onOrientationCheck);
    }
    this.shell?.addEventListener('pointerdown', () => {
      if (this.hasStarted && this.isTouchDevice() && !this.isPortraitOrientation() && !document.fullscreenElement) {
        this.requestAppFullscreen();
      }
    });
    this.syncOrientationAndFullscreen();
    this.#updateIosInstallHint();
    this.#bindZoomPrevention();
  }

  #bindZoomPrevention() {
    if (typeof document === 'undefined') return;
    const prevent = (e) => {
      e.preventDefault();
    };
    document.addEventListener('gesturestart', prevent, { passive: false });
    document.addEventListener('gesturechange', prevent, { passive: false });
    document.addEventListener('gestureend', prevent, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  #updateIosInstallHint() {
    if (!this.iosInstallHint || typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }
    const ua = navigator.userAgent || '';
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isStandalone =
      Boolean(navigator.standalone) ||
      Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches) ||
      Boolean(window.matchMedia?.('(display-mode: fullscreen)')?.matches);
    if (isIos && !isStandalone) {
      this.iosInstallHint.classList.remove('hidden');
    } else {
      this.iosInstallHint.classList.add('hidden');
    }
  }

  setStoryHeader({ title, subtitle, splashUrl }) {
    if (title) this.startTitleEl.textContent = title;
    if (subtitle) this.startSubtitleEl.textContent = subtitle;
    if (splashUrl) {
      this.startSplashEl.src = splashUrl;
      this.startSplashEl.classList.remove('hidden');
    } else {
      this.startSplashEl.classList.add('hidden');
    }
  }

  showStartScreen() {
    this.hudLayer.classList.add('hidden');
    this.gameoverScreen.classList.add('hidden');
    this.missionCompleteScreen.classList.add('hidden');
    this.loadingScreen.classList.add('hidden');
    this.errorScreen.classList.add('hidden');
    this.startScreen.classList.remove('hidden');
  }

  showMissionComplete(missionTitle, hasNextMission, onContinue) {
    this.missionCompleteTitleEl.textContent = hasNextMission ? 'MISSÃO CONCLUÍDA' : 'HISTÓRIA CONCLUÍDA';
    this.missionCompleteSubtitleEl.textContent = hasNextMission
      ? `${missionTitle} finalizada. Prepare-se para a próxima missão.`
      : `${missionTitle} finalizada! Todas as missões foram concluídas. Modo exploração livre ativado.`;
    this.missionCompleteBtn.textContent = hasNextMission ? 'Próxima Missão' : 'Explorar Livremente';
    this.missionCompleteHandler = onContinue;
    this.missionCompleteScreen.classList.remove('hidden');
  }

  isMissionCompleteOpen() {
    return !this.missionCompleteScreen.classList.contains('hidden');
  }

  confirmMissionComplete() {
    if (this.isMissionCompleteOpen()) {
      this.missionCompleteBtn.click();
    }
  }

  isStartScreenOpen() {
    return !this.startScreen.classList.contains('hidden');
  }

  triggerStart() {
    if (this.isStartScreenOpen()) {
      this.startButton.click();
    }
  }

  onStartClick(handler) {
    this.startButton.addEventListener('click', () => {
      this.hasStarted = true;
      if (!this.isPortraitOrientation()) {
        this.requestAppFullscreen();
      }
      handler();
    });
  }

  showLoading(percent, message) {
    this.startScreen.classList.add('hidden');
    this.errorScreen.classList.add('hidden');
    this.loadingScreen.classList.remove('hidden');
    this.loadingBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    this.loadingText.textContent = message;
  }

  showGameHud() {
    this.startScreen.classList.add('hidden');
    this.loadingScreen.classList.add('hidden');
    this.errorScreen.classList.add('hidden');
    this.gameoverScreen.classList.add('hidden');
    this.setDeathDesaturation(0);
    this.hudLayer.classList.remove('hidden');
  }

  onRestartClick(handler) {
    this.restartButton.addEventListener('click', handler);
  }

  setDeathDesaturation(progress = 0) {
    const p = Math.max(0, Math.min(1, progress));
    const filterVal = p > 0
      ? `grayscale(${p.toFixed(3)}) contrast(${(1 + p * 0.14).toFixed(3)}) brightness(${(1 - p * 0.14).toFixed(3)})`
      : '';
    if (this.canvasEl) this.canvasEl.style.filter = filterVal;
    if (this.hudLayer) this.hudLayer.style.filter = filterVal;
  }

  showGameOver(reason) {
    this.gameoverReasonEl.textContent = String(reason || 'Você se deu mal.');
    this.gameoverScreen.classList.remove('hidden');
  }

  hideGameOver() {
    this.gameoverScreen.classList.add('hidden');
    this.setDeathDesaturation(0);
  }

  triggerDamageFlash() {
    if (!this.damageFlashEl) return;
    this.damageFlashEl.classList.add('active');
    clearTimeout(this.damageFlashTimer);
    this.damageFlashTimer = setTimeout(() => {
      this.damageFlashEl.classList.remove('active');
    }, 90);
  }

  showError(message) {
    this.startScreen.classList.add('hidden');
    this.loadingScreen.classList.add('hidden');
    this.hudLayer.classList.add('hidden');
    this.gameoverScreen.classList.add('hidden');
    this.errorMessage.textContent = String(message || 'Erro desconhecido.');
    this.errorScreen.classList.remove('hidden');
  }

  updateStatus({ locationCode, vehicle, isDrifting, objectiveCode, health = 100 }) {
    this.locationCodeEl.textContent = locationCode || 'CIDADE';
    if (vehicle) {
      const kmh = Math.round(vehicle.speed * 0.25);
      const driftTag = isDrifting ? ' · DRIFT!' : '';
      this.vehicleStatusEl.textContent = `${vehicle.model} · ${kmh} km/h${driftTag}`;
    } else {
      this.vehicleStatusEl.textContent = 'A pé';
    }
    this.objectiveHintEl.textContent = objectiveCode ? `Destino: ${objectiveCode}` : 'Exploração livre';

    const clampedHealth = Math.max(0, Math.min(100, Math.round(health)));
    this.healthValueEl.textContent = String(clampedHealth);
    this.healthFillEl.style.width = `${clampedHealth}%`;
    this.healthFillEl.style.backgroundColor =
      clampedHealth > 50 ? '#22c55e' : clampedHealth > 25 ? '#f59e0b' : '#ef4444';

    if (this.vehicleHealthBadgeEl) {
      if (vehicle) {
        const vHealth = Math.max(0, Math.min(100, Math.round(vehicle.health ?? 100)));
        this.vehicleHealthBadgeEl.classList.remove('hidden');
        this.vehicleHealthValueEl.textContent = String(vHealth);
        this.vehicleHealthFillEl.style.width = `${vHealth}%`;
        this.vehicleHealthFillEl.style.backgroundColor =
          vHealth > 55 ? '#38bdf8' : vHealth > 25 ? '#f59e0b' : '#ef4444';
      } else {
        this.vehicleHealthBadgeEl.classList.add('hidden');
      }
    }
  }
}
