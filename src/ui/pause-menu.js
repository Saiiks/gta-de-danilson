export class PauseMenuController {
  constructor() {
    this.pauseButton = document.getElementById('pause-button');
    this.screen = document.getElementById('pause-screen');
    this.resumeBtn = document.getElementById('pause-resume-btn');
    this.restartMissionBtn = document.getElementById('pause-restart-btn');
    this.chooseMissionBtn = document.getElementById('pause-choose-btn');
    this.missionListEl = document.getElementById('pause-mission-list');
    this.exitBtn = document.getElementById('pause-exit-btn');

    this.isOpen = false;
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

    this.chooseMissionBtn.addEventListener('click', () => {
      this.missionListEl.classList.toggle('hidden');
    });

    this.exitBtn.addEventListener('click', () => {
      this.close();
      this.callbacks.onExitToTitle?.();
    });
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
    this.missionListEl.classList.add('hidden');
    this.screen.classList.remove('hidden');
    this.callbacks.onPauseChange?.(true);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.missionListEl.classList.add('hidden');
    this.screen.classList.add('hidden');
    this.callbacks.onPauseChange?.(false);
  }
}
