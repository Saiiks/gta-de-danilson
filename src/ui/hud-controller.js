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
    this.loadingPercent = document.getElementById('loading-percent');
    this.inventoryButton = document.getElementById('inventory-button');
    this.inventoryBadge = document.getElementById('inventory-badge');
    this.worldPickupItemEl = document.getElementById('world-pickup-item');
    this.worldCollectiblesLayer = document.getElementById('world-collectibles-layer');
    this.collectibleNodePool = [];
    this.hudToastEl = document.getElementById('hud-toast');
    this.hudToastImgEl = document.getElementById('hud-toast-img');
    this.hudToastTextEl = document.getElementById('hud-toast-text');
    this.hudToastTimer = null;
    this.missionBannerEl = document.getElementById('mission-banner');
    this.missionBannerTitleEl = document.getElementById('mission-banner-title');
    this.missionBannerObjectiveEl = document.getElementById('mission-banner-objective');
    this.missionBannerTimer = null;
    this.missionBannerHideTimer = null;
    this.inventoryClickHandler = null;
    this.inventoryButton?.addEventListener('click', () => this.inventoryClickHandler?.());
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
    this.startLoadingBar = document.getElementById('start-loading-bar');
    this.startLoadingText = document.getElementById('start-loading-text');
    this.startLoadingPercent = document.getElementById('start-loading-percent');

    this.missionCompleteScreen = document.getElementById('mission-complete-screen');
    this.missionCompleteTitleEl = document.getElementById('mission-complete-title');
    this.missionCompleteSubtitleEl = document.getElementById('mission-complete-subtitle');
    this.missionCompleteBtn = document.getElementById('mission-complete-btn');
    this.iosInstallHint = document.getElementById('ios-install-hint');
    this.hasStarted = false;
    this.missionCompleteHandler = null;
    this.missionCompleteBtn.addEventListener('click', () => {
      this.missionCompleteScreen.classList.add('hidden');
      const cb = this.missionCompleteHandler;
      this.missionCompleteHandler = null;
      cb?.();
    });

    this.#bindFullscreenRestore();
    this.#updateIosInstallHint();
    this.#bindZoomPrevention();
  }

  isTouchDevice() {
    return (
      (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) ||
      (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    );
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

  #bindFullscreenRestore() {
    if (typeof window === 'undefined') return;
    this.shell?.addEventListener('pointerdown', () => {
      if (this.hasStarted && this.isTouchDevice() && !document.fullscreenElement) {
        this.requestAppFullscreen();
      }
    });
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

  setStoryHeader({ title, pageTitle, subtitle, splashUrl }) {
    if (title) this.startTitleEl.textContent = title;
    const browserTitle = pageTitle || title;
    if (browserTitle && typeof document !== 'undefined') {
      document.title = browserTitle;
    }
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
      this.requestAppFullscreen();
      handler();
    });
  }

  showLoading(percent, message) {
    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
    this.startScreen.classList.add('hidden');
    this.errorScreen.classList.add('hidden');
    this.loadingScreen.classList.remove('hidden');
    this.loadingBar.style.width = `${clamped}%`;
    this.loadingText.textContent = message;
    if (this.loadingPercent) {
      this.loadingPercent.textContent = `${Math.round(clamped)}%`;
    }
  }

  setStartLoadingProgress(percent, message, { ready = false } = {}) {
    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
    if (this.startLoadingBar) {
      this.startLoadingBar.style.width = `${clamped}%`;
    }
    if (this.startLoadingText && message) {
      this.startLoadingText.textContent = message;
    }
    if (this.startLoadingPercent) {
      this.startLoadingPercent.textContent = `${Math.round(clamped)}%`;
    }
    if (this.startButton) {
      this.startButton.disabled = !ready;
      this.startButton.textContent = ready ? 'Entrar na Cidade' : 'Carregando...';
    }
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

  onInventoryClick(handler) {
    this.inventoryClickHandler = handler;
  }

  setInventoryCount(count, capacity = 5) {
    if (this.inventoryBadge) {
      this.inventoryBadge.textContent = `${count}/${capacity}`;
    } else if (this.inventoryButton) {
      this.inventoryButton.textContent = `${count}/${capacity}`;
    }
    if (this.inventoryButton) {
      this.inventoryButton.setAttribute('aria-label', `Abrir inventário (${count} de ${capacity})`);
    }
  }

  updateWorldPickupItem(visible, screenX = 0, screenY = 0, imageUrl = '', alt = '') {
    if (!this.worldPickupItemEl) return;
    if (!visible || !imageUrl) {
      this.worldPickupItemEl.classList.add('hidden');
      return;
    }
    if (this.worldPickupItemEl.getAttribute('src') !== imageUrl) {
      this.worldPickupItemEl.src = imageUrl;
    }
    this.worldPickupItemEl.alt = alt || '';
    this.worldPickupItemEl.style.left = `${screenX}px`;
    this.worldPickupItemEl.style.top = `${screenY}px`;
    this.worldPickupItemEl.classList.remove('hidden');
  }

  updateWorldCollectibles(visibleItems = []) {
    if (!this.worldCollectiblesLayer) return;
    while (this.collectibleNodePool.length < visibleItems.length) {
      const img = document.createElement('img');
      img.className = 'world-pickup-item hidden';
      this.worldCollectiblesLayer.appendChild(img);
      this.collectibleNodePool.push(img);
    }
    for (let i = 0; i < this.collectibleNodePool.length; i += 1) {
      const el = this.collectibleNodePool[i];
      const item = visibleItems[i];
      if (!item || !item.imageUrl) {
        el.classList.add('hidden');
        continue;
      }
      if (el.getAttribute('src') !== item.imageUrl) {
        el.src = item.imageUrl;
      }
      el.alt = item.name || '';
      el.style.left = `${item.screenX}px`;
      el.style.top = `${item.screenY}px`;
      el.classList.remove('hidden');
    }
  }

  animatePickupToInventory(startX, startY, imageUrl, alt = '') {
    if (typeof document === 'undefined' || !imageUrl || !this.inventoryButton) return;
    const targetRect = this.inventoryButton.getBoundingClientRect();
    if (!targetRect || targetRect.width === 0) return;

    const targetX = targetRect.left + targetRect.width * 0.5;
    const targetY = targetRect.top + targetRect.height * 0.5;

    const clone = document.createElement('img');
    clone.className = 'flying-item-clone';
    clone.src = imageUrl;
    clone.alt = alt || '';
    clone.style.left = `${startX}px`;
    clone.style.top = `${startY}px`;
    this.shell?.appendChild(clone);

    const dx = targetX - startX;
    const dy = targetY - startY;

    if (typeof clone.animate === 'function') {
      const anim = clone.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.32)`, opacity: 0.9 }
        ],
        { duration: 540, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
      );
      anim.onfinish = () => {
        clone.remove();
        this.inventoryButton.classList.remove('inventory-btn-pulse');
        void this.inventoryButton.offsetWidth;
        this.inventoryButton.classList.add('inventory-btn-pulse');
      };
    } else {
      clone.remove();
    }
  }

  showToast(message, options = 3600) {
    if (!this.hudToastEl) return;
    const opts = typeof options === 'number' ? { durationMs: options } : (options || {});
    const { durationMs = 3600, imageUrl = '', imageAlt = '' } = opts;

    if (this.hudToastImgEl) {
      if (imageUrl) {
        this.hudToastImgEl.src = imageUrl;
        this.hudToastImgEl.alt = imageAlt;
        this.hudToastImgEl.classList.remove('hidden');
      } else {
        this.hudToastImgEl.removeAttribute('src');
        this.hudToastImgEl.classList.add('hidden');
      }
    }

    if (this.hudToastTextEl) {
      this.hudToastTextEl.textContent = String(message || '');
    } else {
      this.hudToastEl.textContent = String(message || '');
    }

    this.hudToastEl.classList.remove('hidden');
    clearTimeout(this.hudToastTimer);
    this.hudToastTimer = setTimeout(() => {
      this.hudToastEl.classList.add('hidden');
    }, durationMs);
  }

  showMissionBanner(missionNumber, objectiveText, durationMs = 3600) {
    if (!this.missionBannerEl) return;
    clearTimeout(this.missionBannerTimer);
    clearTimeout(this.missionBannerHideTimer);

    if (this.missionBannerTitleEl) {
      this.missionBannerTitleEl.textContent = `MISSÃO ${missionNumber}`;
    }
    if (this.missionBannerObjectiveEl) {
      this.missionBannerObjectiveEl.textContent = String(objectiveText || '');
    }

    this.missionBannerEl.classList.remove('hidden', 'visible');
    void this.missionBannerEl.offsetWidth;
    this.missionBannerEl.classList.add('visible');

    this.missionBannerTimer = setTimeout(() => {
      this.missionBannerEl?.classList.remove('visible');
      this.missionBannerHideTimer = setTimeout(() => {
        this.missionBannerEl?.classList.add('hidden');
      }, 650);
    }, durationMs);
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
    this.damageFlashEl.classList.remove('heal');
    this.damageFlashEl.classList.add('active');
    clearTimeout(this.damageFlashTimer);
    this.damageFlashTimer = setTimeout(() => {
      this.damageFlashEl.classList.remove('active');
    }, 90);
  }

  triggerHealFlash() {
    if (!this.damageFlashEl) return;
    this.damageFlashEl.classList.add('heal', 'active');
    clearTimeout(this.damageFlashTimer);
    this.damageFlashTimer = setTimeout(() => {
      this.damageFlashEl.classList.remove('active');
    }, 180);
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
      const valueEl = document.createElement('span');
      valueEl.className = 'hud-speed-value';
      valueEl.textContent = String(kmh);
      const unitEl = document.createElement('span');
      unitEl.className = 'hud-speed-unit';
      unitEl.textContent = ` km/h${driftTag}`;
      this.vehicleStatusEl.replaceChildren(valueEl, unitEl);
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
        this.vehicleHealthBadgeEl.classList.remove('disabled');
        this.vehicleHealthValueEl.textContent = String(vHealth);
        this.vehicleHealthFillEl.style.width = `${vHealth}%`;
        this.vehicleHealthFillEl.style.backgroundColor =
          vHealth > 55 ? '#38bdf8' : vHealth > 25 ? '#f59e0b' : '#ef4444';
      } else {
        this.vehicleHealthBadgeEl.classList.add('disabled');
        this.vehicleHealthValueEl.textContent = '--';
        this.vehicleHealthFillEl.style.width = '0%';
      }
    }
  }
}
