import { Engine } from './core/engine.js';
import { HudController } from './ui/hud-controller.js';

function boot() {
  const hud = new HudController();
  const canvas = document.getElementById('game-canvas');
  const minimapCanvas = document.getElementById('minimap-canvas');
  const touchControls = document.getElementById('touch-controls');

  hud.onStartClick(() => {
    try {
      const engine = new Engine(canvas, minimapCanvas, touchControls, hud);
      engine.initWorld();
      engine.start();
    } catch (error) {
      console.error('[Engine] Erro fatal ao iniciar:', error);
      hud.showError(error?.message || 'Erro inesperado ao inicializar o motor do jogo.');
    }
  });
}

window.addEventListener('DOMContentLoaded', boot);
