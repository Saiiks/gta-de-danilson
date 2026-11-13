import test from 'node:test';
import assert from 'node:assert/strict';

function createMockElement(tag = 'div') {
  const classes = new Set();
  const listeners = new Map();
  return {
    tagName: tag.toUpperCase(),
    dataset: {},
    style: {},
    textContent: '',
    children: [],
    rect: { left: 0, top: 0, width: 100, height: 100 },
    classList: {
      add(...names) { names.forEach((n) => classes.add(n)); },
      remove(...names) { names.forEach((n) => classes.delete(n)); },
      contains(n) { return classes.has(n); },
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatchEvent(type, event = {}) {
      const ev = { preventDefault() {}, ...event };
      for (const fn of listeners.get(type) || []) {
        fn(ev);
      }
    },
    click() {
      this.dispatchEvent('click');
    },
    getBoundingClientRect() {
      return this.rect;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function setupGlobals({ width = 844, height = 390, portrait = false, maxTouchPoints = 5 } = {}) {
  const windowListeners = new Map();
  const elements = new Map();
  let fullscreenEl = null;
  let requestFullscreenCount = 0;
  let exitFullscreenCount = 0;

  const makeEl = (id) => {
    const el = createMockElement('div');
    el.id = id;
    elements.set(id, el);
    return el;
  };

  const shell = makeEl('game-shell');
  shell.requestFullscreen = async () => {
    requestFullscreenCount += 1;
    fullscreenEl = shell;
  };

  const ids = [
    'game-canvas', 'hud-layer', 'start-screen', 'start-button', 'loading-screen',
    'loading-bar', 'loading-text', 'error-screen', 'error-message', 'location-code',
    'vehicle-status', 'objective-hint', 'health-fill', 'health-value',
    'vehicle-health-badge', 'vehicle-health-fill', 'vehicle-health-value',
    'gameover-screen', 'gameover-reason', 'restart-button', 'damage-flash',
    'start-title', 'start-subtitle', 'start-splash', 'mission-complete-screen',
    'mission-complete-title', 'mission-complete-subtitle', 'mission-complete-btn',
    'portrait-warning',
  ];
  for (const id of ids) makeEl(id);
  elements.get('portrait-warning').classList.add('hidden');

  const state = { width, height, portrait };

  globalThis.window = {
    innerWidth: width,
    innerHeight: height,
    ontouchstart: {},
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    dispatchEvent(type, event = {}) {
      const ev = { preventDefault() {}, ...event };
      for (const fn of windowListeners.get(type) || []) {
        fn(ev);
      }
    },
    matchMedia(query) {
      if (query === '(orientation: portrait)') {
        return { matches: state.portrait, addEventListener() {} };
      }
      if (query === '(pointer: coarse)') {
        return { matches: maxTouchPoints > 0, addEventListener() {} };
      }
      return { matches: false, addEventListener() {} };
    },
  };

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { maxTouchPoints, getGamepads: () => [] },
  });

  globalThis.document = {
    getElementById: (id) => elements.get(id) || null,
    addEventListener() {},
    get fullscreenElement() { return fullscreenEl; },
    exitFullscreen: async () => {
      exitFullscreenCount += 1;
      fullscreenEl = null;
    },
  };

  return {
    elements,
    state,
    getStats: () => ({
      fullscreenEl,
      requestFullscreenCount,
      exitFullscreenCount,
    }),
  };
}

test('direcional analógico virtual produz vetor contínuo com deadzone, multi-toque com A/B e retorno ao centro', async () => {
  setupGlobals();
  const { InputManager } = await import('../src/input/input-manager.js');

  const touchContainer = createMockElement('div');
  touchContainer.classList.add('hidden');

  const analog = createMockElement('div');
  analog.rect = { left: 20, top: 200, width: 120, height: 120 }; // centro (80, 260), maxRadius = 45.6
  const knob = createMockElement('div');

  const btnAction = createMockElement('button');
  btnAction.dataset.btn = 'action';
  const btnSecondary = createMockElement('button');
  btnSecondary.dataset.btn = 'secondary';

  touchContainer.querySelector = (sel) => {
    if (sel === '#touch-analog') return analog;
    if (sel === '#touch-analog-knob') return knob;
    return null;
  };
  touchContainer.querySelectorAll = (sel) => (sel === '.touch-btn' ? [btnAction, btnSecondary] : []);

  const input = new InputManager(touchContainer);
  assert.equal(touchContainer.classList.contains('hidden'), false);

  // Dentro da deadzone: movimento deve ser zero
  analog.dispatchEvent('pointerdown', { pointerId: 1, clientX: 82, clientY: 260 });
  let snap = input.update(0.016);
  assert.equal(snap.moveX, 0);
  assert.equal(snap.moveY, 0);

  // Arrastando para direita-baixo enquanto pressiona botão A (multi-toque)
  window.dispatchEvent('pointermove', { pointerId: 1, clientX: 120, clientY: 280 });
  btnAction.dispatchEvent('pointerdown', { pointerId: 2 });
  snap = input.update(0.016);
  assert.ok(snap.moveX > 0.6, `esperado moveX > 0.6, recebido ${snap.moveX}`);
  assert.ok(snap.moveY > 0.25, `esperado moveY > 0.25, recebido ${snap.moveY}`);
  assert.equal(snap.actionPressed, true);
  assert.equal(snap.actionJustPressed, true);
  assert.equal(snap.secondaryPressed, false);

  // Pressionando B também
  btnSecondary.dispatchEvent('pointerdown', { pointerId: 3 });
  snap = input.update(0.016);
  assert.equal(snap.secondaryPressed, true);
  assert.equal(snap.secondaryJustPressed, true);

  // Soltando analógico e botões: volta ao centro
  window.dispatchEvent('pointerup', { pointerId: 1 });
  window.dispatchEvent('pointerup', { pointerId: 2 });
  window.dispatchEvent('pointerup', { pointerId: 3 });
  snap = input.update(0.016);
  assert.equal(snap.moveX, 0);
  assert.equal(snap.moveY, 0);
  assert.equal(snap.actionPressed, false);
  assert.equal(snap.secondaryPressed, false);
  assert.equal(knob.style.transform, 'translate(0px, 0px)');
});

test('inicia em fullscreen na horizontal e sai do fullscreen exibindo erro ao girar para retrato', async () => {
  const env = setupGlobals({ width: 844, height: 390, portrait: false, maxTouchPoints: 5 });
  const { HudController } = await import('../src/ui/hud-controller.js');

  const hud = new HudController();
  let started = false;
  hud.onStartClick(() => {
    started = true;
  });

  // No início em paisagem, aviso de retrato oculto
  assert.equal(hud.isPortraitBlocked(), false);

  // Ao clicar em iniciar, entra em fullscreen
  env.elements.get('start-button').click();
  assert.equal(started, true);
  assert.equal(env.getStats().requestFullscreenCount, 1);
  assert.ok(env.getStats().fullscreenEl !== null);

  // Ao girar o celular para retrato (vertical), sai do fullscreen e exibe mensagem de erro
  env.state.portrait = true;
  window.innerWidth = 390;
  window.innerHeight = 844;
  window.dispatchEvent('resize');

  assert.equal(hud.isPortraitBlocked(), true);
  assert.equal(env.elements.get('portrait-warning').classList.contains('hidden'), false);
  assert.equal(env.getStats().exitFullscreenCount, 1);
  assert.equal(env.getStats().fullscreenEl, null);

  // Ao deitar o celular novamente (paisagem), oculta o aviso
  env.state.portrait = false;
  window.innerWidth = 844;
  window.innerHeight = 390;
  window.dispatchEvent('resize');

  assert.equal(hud.isPortraitBlocked(), false);
  assert.equal(env.elements.get('portrait-warning').classList.contains('hidden'), true);
});
