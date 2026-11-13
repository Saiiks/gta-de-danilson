export class InputManager {
  constructor(touchContainer = null) {
    this.keys = new Set();
    this.touchDirs = new Set();
    this.touchButtons = new Set();
    this.pointerBindings = new Map();
    this.touchContainer = touchContainer;

    this.prevAction = false;
    this.prevCombo = false;
    this.secondaryHeldTime = 0;
    this.exitCooldown = 0;

    this.#bindKeyboard();
    if (this.touchContainer) {
      this.#bindTouch();
      this.#updateTouchVisibility();
    }
  }

  #bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touchDirs.clear();
      this.touchButtons.clear();
      this.pointerBindings.clear();
    });
  }

  #updateTouchVisibility() {
    if (!this.touchContainer) {
      return;
    }
    const isTouchCapable =
      (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    if (isTouchCapable) {
      this.touchContainer.classList.remove('hidden');
    }
  }

  #bindTouch() {
    const buttons = this.touchContainer.querySelectorAll('.touch-btn');
    for (const btn of buttons) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.touchContainer.classList.remove('hidden');
        const dir = btn.dataset.dir;
        const actionBtn = btn.dataset.btn;
        if (dir) {
          this.touchDirs.add(dir);
          this.pointerBindings.set(e.pointerId, { kind: 'dir', value: dir, el: btn });
        } else if (actionBtn) {
          this.touchButtons.add(actionBtn);
          this.pointerBindings.set(e.pointerId, { kind: 'btn', value: actionBtn, el: btn });
        }
        btn.classList.add('active');
      });
    }

    const releasePointer = (e) => {
      const binding = this.pointerBindings.get(e.pointerId);
      if (!binding) {
        return;
      }
      this.pointerBindings.delete(e.pointerId);
      binding.el.classList.remove('active');
      if (binding.kind === 'dir') {
        this.touchDirs.delete(binding.value);
      } else {
        this.touchButtons.delete(binding.value);
      }
    };

    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
  }

  #readGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) {
      return { moveX: 0, moveY: 0, action: false, secondary: false };
    }
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (!gp || !gp.connected) {
        continue;
      }
      let moveX = 0;
      let moveY = 0;
      const ax0 = gp.axes[0] ?? 0;
      const ax1 = gp.axes[1] ?? 0;
      if (Math.abs(ax0) > 0.25) moveX = ax0;
      if (Math.abs(ax1) > 0.25) moveY = ax1;

      if (gp.buttons[14]?.pressed) moveX = -1;
      if (gp.buttons[15]?.pressed) moveX = 1;
      if (gp.buttons[12]?.pressed) moveY = -1;
      if (gp.buttons[13]?.pressed) moveY = 1;

      const action = Boolean(gp.buttons[0]?.pressed);
      const secondary = Boolean(gp.buttons[1]?.pressed || gp.buttons[2]?.pressed);
      return { moveX, moveY, action, secondary };
    }
    return { moveX: 0, moveY: 0, action: false, secondary: false };
  }

  update(dt) {
    let moveX = 0;
    let moveY = 0;

    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA') || this.touchDirs.has('left')) moveX -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD') || this.touchDirs.has('right')) moveX += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.touchDirs.has('up')) moveY -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS') || this.touchDirs.has('down')) moveY += 1;

    let actionPressed =
      this.keys.has('Space') ||
      this.keys.has('Enter') ||
      this.keys.has('KeyZ') ||
      this.touchButtons.has('action');

    let secondaryPressed =
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight') ||
      this.keys.has('KeyX') ||
      this.keys.has('Backspace') ||
      this.touchButtons.has('secondary');

    const gp = this.#readGamepad();
    if (Math.abs(gp.moveX) > 0) moveX = gp.moveX;
    if (Math.abs(gp.moveY) > 0) moveY = gp.moveY;
    actionPressed = actionPressed || gp.action;
    secondaryPressed = secondaryPressed || gp.secondary;

    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }

    const actionJustPressed = actionPressed && !this.prevAction;
    const comboNow = actionPressed && secondaryPressed;
    const comboExitJustPressed = comboNow && !this.prevCombo;

    if (secondaryPressed && !actionPressed) {
      this.secondaryHeldTime += dt;
    } else {
      this.secondaryHeldTime = 0;
    }

    if (this.exitCooldown > 0) {
      this.exitCooldown = Math.max(0, this.exitCooldown - dt);
    }

    this.prevAction = actionPressed;
    this.prevCombo = comboNow;

    return {
      moveX,
      moveY,
      actionPressed,
      actionJustPressed,
      secondaryPressed,
      secondaryHeldTime: this.secondaryHeldTime,
      comboExitJustPressed,
      canTriggerHoldExit: this.exitCooldown === 0 && this.secondaryHeldTime >= 0.6
    };
  }

  consumeExitTrigger() {
    this.secondaryHeldTime = 0;
    this.exitCooldown = 0.45;
  }
}
