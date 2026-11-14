import { Engine } from './core/engine.js?v=8';
import { HudController } from './ui/hud-controller.js';
import { CutsceneController } from './ui/cutscene-controller.js';
import { PauseMenuController } from './ui/pause-menu.js';
import { InventoryController } from './ui/inventory-controller.js';
import { CityMap } from './world/city-map.js';
import { loadStoryPackage, preloadMissionAssets } from './story/story-loader.js';

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function boot() {
  window.__gameBooted = true;
  const hud = new HudController();
  const cutscene = new CutsceneController();
  const pauseMenu = new PauseMenuController();
  const inventoryController = new InventoryController();
  const canvas = document.getElementById('game-canvas');
  const minimapCanvas = document.getElementById('minimap-canvas');
  const touchControls = document.getElementById('touch-controls');

  let storyPackage = null;
  let cityMap = null;
  let activeEngine = null;
  const preloadedUrls = new Set();

  try {
    hud.showLoading(5, 'Preparando cidade-base...');
    cityMap = new CityMap();

    hud.showLoading(15, 'Carregando história e missões...');
    storyPackage = await loadStoryPackage('./story', cityMap, {
      onProgress: ({ ratio, message }) => {
        hud.showLoading(15 + ratio * 40, message);
      }
    });

    await preloadMissionAssets(storyPackage, 0, {
      includeSplash: true,
      preloadedUrls,
      onProgress: ({ loaded, total, ratio }) => {
        const msg = total > 0
          ? `Carregando recursos da 1ª missão (${loaded}/${total})...`
          : 'Verificando recursos iniciais...';
        hud.showLoading(55 + ratio * 40, msg);
      }
    });

    hud.setStoryHeader({
      title: storyPackage.title,
      subtitle: storyPackage.subtitle,
      splashUrl: storyPackage.splashUrl
    });

    hud.showLoading(100, 'Tudo pronto!');
    await waitMs(160);
    hud.showStartScreen();
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
        inventoryController,
        preloadedUrls,
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

  window.addEventListener('keydown', (e) => {
    if (hud.isStartScreenOpen() && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      hud.triggerStart();
    }
  });

  let prevGpAction = false;
  const pollStartGamepad = () => {
    if (hud.isStartScreenOpen() && navigator.getGamepads) {
      const gps = navigator.getGamepads();
      let gpAction = false;
      for (const gp of gps) {
        if (gp?.connected && gp.buttons[0]?.pressed) {
          gpAction = true;
          break;
        }
      }
      if (gpAction && !prevGpAction) {
        hud.triggerStart();
      }
      prevGpAction = gpAction;
    } else {
      prevGpAction = true;
    }
    requestAnimationFrame(pollStartGamepad);
  };
  requestAnimationFrame(pollStartGamepad);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
