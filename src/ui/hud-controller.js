export class HudController {
  constructor() {
    this.shell = document.getElementById('game-shell');
    this.canvasEl = document.getElementById('game-canvas');
    this.hudLayer = document.getElementById('hud-layer');
    this.startScreen = document.getElementById('start-screen');
    this.startButton = document.getElementById('start-button');
    this.newGameButton = document.getElementById('new-game-button');
    this.startReadyLabel = 'Entrar na Cidade';
    this.startSelectedIndex = 0;
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
    this.minimapContainerEl = document.getElementById('minimap-container');
    this.expandedMapScreen = document.getElementById('expanded-map-screen');
    this.expandedMapCanvas = document.getElementById('expanded-map-canvas');
    this.expandedMapObjectiveEl = document.getElementById('expanded-map-objective');
    this.expandedMapCloseBtn = document.getElementById('expanded-map-close-btn');
    this.expandedMapZoomInBtn = document.getElementById('expanded-map-zoom-in-btn');
    this.expandedMapZoomOutBtn = document.getElementById('expanded-map-zoom-out-btn');
    this.expandedMapZoomResetBtn = document.getElementById('expanded-map-zoom-reset-btn');
    this.minimapClickHandler = null;
    this.expandedMapCloseHandler = null;
    this.expandedMapTransformHandler = null;
    this.expandedMapPointers = new Map();
    this.minimapContainerEl?.addEventListener('click', () => this.minimapClickHandler?.());
    this.expandedMapCloseBtn?.addEventListener('click', () => this.expandedMapCloseHandler?.());
    this.expandedMapZoomInBtn?.addEventListener('click', () => this.expandedMapTransformHandler?.({ type: 'zoom', factor: 1.35 }));
    this.expandedMapZoomOutBtn?.addEventListener('click', () => this.expandedMapTransformHandler?.({ type: 'zoom', factor: 1 / 1.35 }));
    this.expandedMapZoomResetBtn?.addEventListener('click', () => this.expandedMapTransformHandler?.({ type: 'reset' }));
    this.expandedMapScreen?.addEventListener('click', (e) => {
      if (e.target === this.expandedMapScreen) {
        this.expandedMapCloseHandler?.();
      }
    });
    this.#bindExpandedMapGestures();
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
    this.setStartSelection(0);
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

  #getVisibleStartButtons() {
    return [this.startButton, this.newGameButton].filter(
      (btn) => btn && !btn.classList.contains('hidden')
    );
  }

  setStartSelection(index = 0) {
    const buttons = this.#getVisibleStartButtons();
    if (buttons.length === 0) return;
    const len = buttons.length;
    this.startSelectedIndex = ((Math.floor(index) % len) + len) % len;
    buttons.forEach((btn, idx) => {
      btn.classList.toggle('start-action-selected', len > 1 && idx === this.startSelectedIndex);
    });
  }

  moveStartSelection(delta = 1) {
    const buttons = this.#getVisibleStartButtons();
    if (buttons.length <= 1) return;
    this.setStartSelection(this.startSelectedIndex + delta);
  }

  triggerStart() {
    if (!this.isStartScreenOpen()) return;
    const buttons = this.#getVisibleStartButtons();
    const target = buttons[this.startSelectedIndex] || this.startButton;
    if (target && !target.disabled) {
      target.click();
    }
  }

  onStartClick(handler) {
    this.startButton.addEventListener('click', () => {
      this.hasStarted = true;
      this.requestAppFullscreen();
      handler();
    });
  }

  onNewGameClick(handler) {
    if (!this.newGameButton) return;
    this.newGameButton.addEventListener('click', () => {
      this.hasStarted = true;
      this.requestAppFullscreen();
      handler();
    });
  }

  setStartButtonState({ label = 'Entrar na Cidade', hasSave = false } = {}) {
    this.startReadyLabel = label;
    if (this.startButton && !this.startButton.disabled) {
      this.startButton.textContent = label;
    }
    if (this.newGameButton) {
      this.newGameButton.classList.toggle('hidden', !hasSave);
      if (this.startButton) {
        this.newGameButton.disabled = this.startButton.disabled;
      }
    }
    this.setStartSelection(0);
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
      this.startButton.textContent = ready ? (this.startReadyLabel || 'Entrar na Cidade') : 'Carregando...';
    }
    if (this.newGameButton) {
      this.newGameButton.disabled = !ready;
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

  onMinimapClick(handler) {
    this.minimapClickHandler = handler;
  }

  onExpandedMapClose(handler) {
    this.expandedMapCloseHandler = handler;
  }

  onExpandedMapTransform(handler) {
    this.expandedMapTransformHandler = handler;
  }

  setExpandedMapZoomLabel(zoom = 1) {
    if (!this.expandedMapZoomResetBtn) return;
    const rounded = Math.abs(zoom - Math.round(zoom)) < 0.05 ? Math.round(zoom) : zoom.toFixed(1);
    this.expandedMapZoomResetBtn.textContent = `${rounded}×`;
  }

  #toExpandedCanvasPoint(clientX, clientY) {
    const canvas = this.expandedMapCanvas;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  #bindExpandedMapGestures() {
    const canvas = this.expandedMapCanvas;
    if (!canvas) return;

    canvas.addEventListener('wheel', (e) => {
      if (!this.isExpandedMapOpen()) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      const pt = this.#toExpandedCanvasPoint(e.clientX, e.clientY);
      this.expandedMapTransformHandler?.({ type: 'zoom', factor, canvasX: pt.x, canvasY: pt.y });
    }, { passive: false });

    canvas.addEventListener('touchstart', (e) => {
      if (this.isExpandedMapOpen()) e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (this.isExpandedMapOpen()) e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.isExpandedMapOpen()) return;
      canvas.setPointerCapture?.(e.pointerId);
      const pt = this.#toExpandedCanvasPoint(e.clientX, e.clientY);
      this.expandedMapPointers.set(e.pointerId, pt);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.isExpandedMapOpen() || !this.expandedMapPointers.has(e.pointerId)) return;
      const nextPt = this.#toExpandedCanvasPoint(e.clientX, e.clientY);
      if (this.expandedMapPointers.size === 1) {
        const prevPt = this.expandedMapPointers.get(e.pointerId);
        const dx = nextPt.x - prevPt.x;
        const dy = nextPt.y - prevPt.y;
        this.expandedMapPointers.set(e.pointerId, nextPt);
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          this.expandedMapTransformHandler?.({ type: 'pan', dx, dy });
        }
        return;
      }

      if (this.expandedMapPointers.size >= 2) {
        const entries = [...this.expandedMapPointers.entries()];
        const [idA, ptA] = entries[0];
        const [idB, ptB] = entries[1];
        if (e.pointerId !== idA && e.pointerId !== idB) return;

        const prevDist = Math.hypot(ptB.x - ptA.x, ptB.y - ptA.y);
        const prevMidX = (ptA.x + ptB.x) * 0.5;
        const prevMidY = (ptA.y + ptB.y) * 0.5;

        this.expandedMapPointers.set(e.pointerId, nextPt);
        const curA = this.expandedMapPointers.get(idA);
        const curB = this.expandedMapPointers.get(idB);
        const curDist = Math.hypot(curB.x - curA.x, curB.y - curA.y);
        const curMidX = (curA.x + curB.x) * 0.5;
        const curMidY = (curA.y + curB.y) * 0.5;

        const midDx = curMidX - prevMidX;
        const midDy = curMidY - prevMidY;
        if (Math.abs(midDx) > 0.1 || Math.abs(midDy) > 0.1) {
          this.expandedMapTransformHandler?.({ type: 'pan', dx: midDx, dy: midDy });
        }
        if (prevDist > 4 && curDist > 4) {
          const factor = curDist / prevDist;
          if (Math.abs(factor - 1) > 0.002) {
            this.expandedMapTransformHandler?.({ type: 'zoom', factor, canvasX: curMidX, canvasY: curMidY });
          }
        }
      }
    });

    const releasePointer = (e) => {
      this.expandedMapPointers.delete(e.pointerId);
    };
    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);
  }

  isExpandedMapOpen() {
    return Boolean(this.expandedMapScreen && !this.expandedMapScreen.classList.contains('hidden'));
  }

  openExpandedMap(objectiveText = '') {
    if (!this.expandedMapScreen) return;
    if (this.expandedMapObjectiveEl) {
      this.expandedMapObjectiveEl.textContent = objectiveText || this.objectiveHintEl?.textContent || 'Exploração livre';
    }
    this.expandedMapScreen.classList.remove('hidden');
  }

  closeExpandedMap() {
    if (!this.expandedMapScreen) return;
    this.expandedMapPointers.clear();
    this.expandedMapScreen.classList.add('hidden');
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
