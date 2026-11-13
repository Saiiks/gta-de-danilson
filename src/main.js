import { Engine } from './core/engine.js';
import { HudController } from './ui/hud-controller.js';
import { CutsceneController } from './ui/cutscene-controller.js';
import { PauseMenuController } from './ui/pause-menu.js';
import { CityMap } from './world/city-map.js';
import { loadStoryPackage } from './story/story-loader.js';

async function boot() {
  const hud = new HudController();
  const cutscene = new CutsceneController();
  const pauseMenu = new PauseMenuController();
  const canvas = document.getElementById('game-canvas');
  const minimapCanvas = document.getElementById('minimap-canvas');
  const touchControls = document.getElementById('touch-controls');

  let storyPackage = null;
  let cityMap = null;
  let activeEngine = null;

  try {
    cityMap = new CityMap();
    storyPackage = await loadStoryPackage('./story', cityMap);
    hud.setStoryHeader({
      title: storyPackage.title,
      subtitle: storyPackage.subtitle,
      splashUrl: storyPackage.splashUrl
    });
  } catch (error) {
    console.error('[StoryLoader] Erro ao carregar história:', error);
    hud.showError(error?.message || 'Erro ao carregar o pacote de história.');
    return;
  }

  hud.onStartClick(() => {
    try {
      if (activeEngine) {
        activeEngine.stop();
      }
      activeEngine = new Engine(canvas, minimapCanvas, touchControls, hud, {
        cityMap,
        storyPackage,
        cutscene,
        pauseMenu,
        onExitToTitle: () => {
          activeEngine?.stop();
          activeEngine = null;
          hud.showStartScreen();
        }
      });
      activeEngine.initWorld();
      activeEngine.start();
      activeEngine.startMission(0);
    } catch (error) {
      console.error('[Engine] Erro fatal ao iniciar:', error);
      hud.showError(error?.message || 'Erro inesperado ao inicializar o motor do jogo.');
    }
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
