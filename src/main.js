import { Engine } from './core/engine.js?v=41';
import { HudController } from './ui/hud-controller.js?v=29';
import { CutsceneController } from './ui/cutscene-controller.js?v=14';
import { PauseMenuController } from './ui/pause-menu.js';
import { InventoryController } from './ui/inventory-controller.js?v=19';
import { CityMap } from './world/city-map.js?v=27';
import {
  loadGameState,
  clearGameState,
  formatContinueLabel
} from './core/save-state.js?v=1';
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
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
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
  let savedState = null;
  const preloadedUrls = new Set();

  const refreshStartButtons = () => {
    const storyKey = storyPackage?.title || 'default';
    savedState = loadGameState(storyKey);
    hud.setStartButtonState({
      label: formatContinueLabel(savedState),
      hasSave: Boolean(savedState)
    });
  };

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

    refreshStartButtons();
    const targetMissionIndex = savedState
      ? Math.max(0, Math.min(savedState.currentMissionIndex || 0, Math.max(0, (storyPackage.missions?.length || 1) - 1)))
      : 0;
    const missionLabel = `Missão ${targetMissionIndex + 1}`;

    hud.setStartLoadingProgress(65, `Pré-carregando imagens da ${missionLabel}...`, { ready: false });
    await preloadMissionAssets(storyPackage, targetMissionIndex, {
      includeSplash: false,
      preloadedUrls,
      onProgress: ({ loaded, total, ratio, url }) => {
        const assetName = url ? url.split('/').pop() : '';
        const label = total > 0 && assetName
          ? `${missionLabel} (${loaded}/${total}): ${assetName}`
          : `Recursos da ${missionLabel} prontos.`;
        hud.setStartLoadingProgress(65 + ratio * 35, label, { ready: false });
      }
    });

    hud.setStartLoadingProgress(100, `Recursos da ${missionLabel} carregados!`, { ready: true });
  } catch (error) {
    console.error('[StoryLoader] Erro ao carregar história:', error);
    hud.showError(error?.message || 'Erro ao carregar o pacote de história.');
    return;
  }

  const launchGame = ({ useSaved = true } = {}) => {
    try {
      if (activeEngine) {
        activeEngine.stop();
      }
      if (!useSaved) {
        clearGameState();
        savedState = null;
      } else {
        savedState = loadGameState(storyPackage?.title || 'default');
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
          refreshStartButtons();
          hud.showStartScreen();
        }
      });
      activeEngine.initWorld();
      activeEngine.start();
      if (useSaved && savedState) {
        activeEngine.restoreSavedSession(savedState);
      } else {
        activeEngine.startMission(0);
      }
    } catch (error) {
      console.error('[Engine] Erro fatal ao iniciar:', error);
      hud.showError(error?.message || 'Erro inesperado ao inicializar o motor do jogo.');
    }
  };

  hud.onStartClick(() => launchGame({ useSaved: true }));
  hud.onNewGameClick(() => launchGame({ useSaved: false }));

  window.addEventListener('keydown', (e) => {
    if (!hud.isStartScreenOpen()) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA' || e.code === 'KeyW') {
      e.preventDefault();
      hud.moveStartSelection(-1);
    } else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD' || e.code === 'KeyS') {
      e.preventDefault();
      hud.moveStartSelection(1);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      hud.triggerStart();
    }
  });

  let prevGpAction = false;
  let prevGpPrev = false;
  let prevGpNext = false;
  const pollStartGamepad = () => {
    if (hud.isStartScreenOpen() && navigator.getGamepads) {
      const gps = navigator.getGamepads();
      let gpAction = false;
      let gpPrev = false;
      let gpNext = false;
      for (const gp of gps) {
        if (!gp?.connected) continue;
        if (gp.buttons[0]?.pressed) gpAction = true;
        const ax0 = gp.axes[0] ?? 0;
        const ax1 = gp.axes[1] ?? 0;
        if (gp.buttons[14]?.pressed || gp.buttons[12]?.pressed || ax0 < -0.5 || ax1 < -0.5) gpPrev = true;
        if (gp.buttons[15]?.pressed || gp.buttons[13]?.pressed || ax0 > 0.5 || ax1 > 0.5) gpNext = true;
      }
      if (gpPrev && !prevGpPrev) hud.moveStartSelection(-1);
      if (gpNext && !prevGpNext) hud.moveStartSelection(1);
      if (gpAction && !prevGpAction) hud.triggerStart();
      prevGpAction = gpAction;
      prevGpPrev = gpPrev;
      prevGpNext = gpNext;
    } else {
      prevGpAction = true;
      prevGpPrev = true;
      prevGpNext = true;
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
