export class HudController {
  constructor() {
    this.shell = document.getElementById('game-shell');
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
  }

  onStartClick(handler) {
    this.startButton.addEventListener('click', () => {
      try {
        if (this.shell.requestFullscreen && !document.fullscreenElement) {
          Promise.resolve(this.shell.requestFullscreen()).catch(() => {});
        }
      } catch {
        // Navegador pode restringir fullscreen; mantém 100vw/100dvh
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
    this.hudLayer.classList.remove('hidden');
  }

  showError(message) {
    this.startScreen.classList.add('hidden');
    this.loadingScreen.classList.add('hidden');
    this.hudLayer.classList.add('hidden');
    this.errorMessage.textContent = String(message || 'Erro desconhecido.');
    this.errorScreen.classList.remove('hidden');
  }

  updateStatus({ locationCode, vehicle, isDrifting, objectiveCode }) {
    this.locationCodeEl.textContent = locationCode || 'CIDADE';
    if (vehicle) {
      const kmh = Math.round(vehicle.speed * 0.25);
      const driftTag = isDrifting ? ' · DRIFT!' : '';
      this.vehicleStatusEl.textContent = `${vehicle.model} · ${kmh} km/h${driftTag}`;
    } else {
      this.vehicleStatusEl.textContent = 'A pé';
    }
    this.objectiveHintEl.textContent = objectiveCode ? `Destino: ${objectiveCode}` : 'Exploração livre';
  }
}
