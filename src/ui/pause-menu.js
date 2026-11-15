export class PauseMenuController {
  constructor(confirmDialog = null) {
    this.confirmDialog = confirmDialog;
    this.pauseButton = document.getElementById('pause-button');
    this.screen = document.getElementById('pause-screen');
    this.missionSelectScreen = document.getElementById('mission-select-screen');
    this.resumeBtn = document.getElementById('pause-resume-btn');
    this.restartMissionBtn = document.getElementById('pause-restart-btn');
    this.chooseMissionBtn = document.getElementById('pause-choose-btn');
    this.missionListEl = document.getElementById('pause-mission-list');
    this.missionSelectBackBtn = document.getElementById('mission-select-back-btn');
    this.newGameBtn = document.getElementById('pause-new-game-btn');
    this.exitBtn = document.getElementById('pause-exit-btn');

    this.isOpen = false;
    this.inMissionSelect = false;
    this.selectedIndex = 0;
    this.prevUp = false;
    this.prevDown = false;
    this.callbacks = {};

    this.pauseButton.addEventListener('click', () => {
      if (this.isOpen) this.close();
      else this.open();
    });

    this.resumeBtn.addEventListener('click', () => this.close());

    this.restartMissionBtn.addEventListener('click', () => {
      this.close();
      this.callbacks.onRestartMission?.();
    });

    this.chooseMissionBtn.addEventListener('click', () => this.openMissionSelect());

    this.missionSelectBackBtn.addEventListener('click', () => this.closeMissionSelect());

    this.newGameBtn?.addEventListener('click', () => {
      this.callbacks.onNewGame?.();
    });

    this.exitBtn.addEventListener('click', () => {
      this.close();
      this.callbacks.onExitToTitle?.();
    });
  }

  getActiveButtons() {
    if (this.inMissionSelect) {
      return [...this.missionListEl.querySelectorAll('button'), this.missionSelectBackBtn];
    }
    return [this.resumeBtn, this.restartMissionBtn, this.chooseMissionBtn, this.newGameBtn, this.exitBtn].filter(Boolean);
  }

  highlightSelection() {
    const allButtons = [
      this.resumeBtn,
      this.restartMissionBtn,
      this.chooseMissionBtn,
      this.newGameBtn,
      this.exitBtn,
      this.missionSelectBackBtn,
      ...this.missionListEl.querySelectorAll('button')
    ].filter(Boolean);
    allButtons.forEach((b) => b.classList.remove('menu-selected'));

    const active = this.getActiveButtons();
    if (active.length === 0) return;
    this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, active.length - 1));
    const current = active[this.selectedIndex];
    current.classList.add('menu-selected');
    current.scrollIntoView?.({ block: 'nearest' });
  }

  openMissionSelect() {
    this.inMissionSelect = true;
    this.selectedIndex = 0;
    this.screen.classList.add('hidden');
    this.missionSelectScreen.classList.remove('hidden');
    this.highlightSelection();
  }

  closeMissionSelect() {
    this.inMissionSelect = false;
    this.selectedIndex = 0;
    this.missionSelectScreen.classList.add('hidden');
    this.screen.classList.remove('hidden');
    this.highlightSelection();
  }

  updateInput(input) {
    if (!this.isOpen) return;
    if (this.confirmDialog?.isOpen) {
      this.confirmDialog.updateInput(input);
      return;
    }
    const active = this.getActiveButtons();
    if (active.length === 0) return;

    const up = Boolean(input.moveY < -0.5);
    const down = Boolean(input.moveY > 0.5);

    if (up && !this.prevUp) {
      this.selectedIndex = (this.selectedIndex - 1 + active.length) % active.length;
      this.highlightSelection();
    }
    if (down && !this.prevDown) {
      this.selectedIndex = (this.selectedIndex + 1) % active.length;
      this.highlightSelection();
    }

    if (input.actionJustPressed) {
      active[this.selectedIndex]?.click();
    } else if (input.secondaryJustPressed) {
      if (this.inMissionSelect) this.closeMissionSelect();
      else this.close();
    }

    this.prevUp = up;
    this.prevDown = down;
  }

  configure(missions, currentMissionIndex, callbacks) {
    this.callbacks = callbacks || {};
    this.missionListEl.replaceChildren();

    (missions || []).forEach((mission, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pause-mission-item';
      if (idx === currentMissionIndex) btn.classList.add('current');
      btn.textContent = mission.title;
      btn.addEventListener('click', () => {
        this.close();
        this.callbacks.onSelectMission?.(idx);
      });
      this.missionListEl.appendChild(btn);
    });
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.inMissionSelect = false;
    this.selectedIndex = 0;
    this.prevUp = false;
    this.prevDown = false;
    this.missionSelectScreen.classList.add('hidden');
    this.screen.classList.remove('hidden');
    this.highlightSelection();
    this.callbacks.onPauseChange?.(true);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.inMissionSelect = false;
    this.missionSelectScreen.classList.add('hidden');
    this.screen.classList.add('hidden');
    this.callbacks.onPauseChange?.(false);
  }
}
