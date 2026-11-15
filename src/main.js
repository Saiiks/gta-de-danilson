import { Engine } from './core/engine.js?v=40';
import { HudController } from './ui/hud-controller.js?v=27';
import { CutsceneController } from './ui/cutscene-controller.js?v=14';
import { PauseMenuController } from './ui/pause-menu.js';
import { InventoryController } from './ui/inventory-controller.js?v=18';
import { CityMap } from './world/city-map.js?v=27';
import {
  loadStorySplashHeader,
  loadStoryPackage,
  preloadImageAsset,
  preloadMissionAssets
} from './story/story-loader.js?v=20';

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
    hud.showLoading(15, 'Lendo abertura da história...');
    const splashHeader = await loadStorySplashHeader('./story');

    if (splashHeader.splashUrl) {
      hud.showLoading(60, 'Carregando tela inicial...');
      await preloadImageAsset(splashHeader.splashUrl);
      preloadedUrls.add(splashHeader.splashUrl);
    }

    hud.setStoryHeader({
      title: splashHeader.title,
      pageTitle: splashHeader.pageTitle,
      subtitle: splashHeader.subtitle,
      splashUrl: splashHeader.splashUrl
    });

    hud.showLoading(100, 'Tela inicial pronta!');
    await waitMs(40);
    hud.setStartLoadingProgress(4, 'Gerando cidade-base...', { ready: false });
    hud.showStartScreen();

    // Yield para garantir que o navegador pinte a splash screen antes de gerar o mapa
    await waitMs(16);
    cityMap = new CityMap();

    hud.setStartLoadingProgress(12, 'Carregando dados da história e missões...', { ready: false });
    storyPackage = await loadStoryPackage('./story', cityMap, {
      prefetchedManifest: splashHeader.manifest,
      prefetchedSplashUrl: splashHeader.splashUrl,
      onProgress: ({ ratio, message }) => {
        hud.setStartLoadingProgress(12 + ratio * 53, message, { ready: false });
      }
    });

    hud.setStoryHeader({
      title: storyPackage.title,
      pageTitle: storyPackage.pageTitle,
      subtitle: storyPackage.subtitle,
      splashUrl: storyPackage.splashUrl
    });

    hud.setStartLoadingProgress(65, 'Pré-carregando imagens da Missão 1...', { ready: false });
    await preloadMissionAssets(storyPackage, 0, {
      includeSplash: false,
      preloadedUrls,
      onProgress: ({ loaded, total, ratio, url }) => {
        const assetName = url ? url.split('/').pop() : '';
        const label = total > 0 && assetName
          ? `Missão 1 (${loaded}/${total}): ${assetName}`
          : 'Recursos da Missão 1 prontos.';
        hud.setStartLoadingProgress(65 + ratio * 35, label, { ready: false });
      }
    });

    hud.setStartLoadingProgress(100, 'Recursos da Missão 1 carregados!', { ready: true });
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
