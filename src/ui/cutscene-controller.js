export class CutsceneController {
  constructor() {
    this.screen = document.getElementById('cutscene-screen');
    this.stageEl = this.screen.querySelector('.cutscene-stage');
    this.bgLabel = document.getElementById('cutscene-bg-label');
    this.leftImg = document.getElementById('cutscene-left-img');
    this.leftName = document.getElementById('cutscene-left-name');
    this.leftSlot = document.getElementById('cutscene-left-slot');
    this.rightImg = document.getElementById('cutscene-right-img');
    this.rightName = document.getElementById('cutscene-right-name');
    this.rightSlot = document.getElementById('cutscene-right-slot');
    this.speakerEl = document.getElementById('cutscene-speaker');
    this.textEl = document.getElementById('cutscene-text');
    this.choicesEl = document.getElementById('cutscene-choices');
    this.nextBtn = document.getElementById('cutscene-next-btn');

    this.active = false;
    this.cutscene = null;
    this.characters = null;
    this.stepIndex = 0;
    this.selectedChoiceIndex = 0;
    this.onFinish = null;
    this.prevAction = false;
    this.prevUp = false;
    this.prevDown = false;

    this.nextBtn.addEventListener('click', () => this.advance());
  }

  play(cutscene, characters, onFinish) {
    if (!cutscene || !cutscene.steps || cutscene.steps.length === 0) {
      onFinish?.({ outcome: 'complete', reason: '' });
      return;
    }

    this.active = true;
    this.cutscene = cutscene;
    this.characters = characters;
    this.stepIndex = 0;
    this.selectedChoiceIndex = 0;
    this.onFinish = onFinish;
    this.prevAction = true;
    this.prevUp = false;
    this.prevDown = false;

    this.bgLabel.textContent = cutscene.background || 'Cena Lateral';
    if (this.stageEl) {
      if (cutscene.backgroundImage) {
        this.stageEl.style.backgroundImage = `linear-gradient(180deg, rgba(15, 23, 42, 0.16) 0%, rgba(15, 23, 42, 0.32) 62%, rgba(10, 14, 22, 0.78) 100%), url("${cutscene.backgroundImage}")`;
        this.stageEl.classList.add('has-bg-image');
      } else {
        this.stageEl.style.backgroundImage = '';
        this.stageEl.classList.remove('has-bg-image');
      }
    }

    const leftChar = characters?.get(cutscene.leftChar);
    const rightChar = characters?.get(cutscene.rightChar);

    this.leftSlot.classList.remove('speaking');
    this.rightSlot.classList.remove('speaking');
    this.applyCharacterSlot(this.leftSlot, this.leftImg, this.leftName, leftChar, 'right');
    this.applyCharacterSlot(this.rightSlot, this.rightImg, this.rightName, rightChar, 'left');

    this.screen.classList.remove('hidden');
    // Garante reflow antes de aplicar .speaking para disparar a animação no 1º frame
    void this.screen.offsetWidth;
    this.renderStep();
  }

  applyCharacterSlot(slotEl, imgEl, nameEl, charDef, facingView) {
    if (!charDef) {
      slotEl.classList.add('hidden');
      return;
    }
    slotEl.classList.remove('hidden');
    nameEl.textContent = charDef.name;
    const src = charDef.sprites?.[facingView] || charDef.sprites?.front || '';
    if (src) {
      imgEl.src = src;
      imgEl.alt = charDef.name;
      imgEl.classList.remove('hidden');
    } else {
      imgEl.removeAttribute('src');
      imgEl.classList.add('hidden');
    }
  }

  renderStep() {
    const step = this.cutscene.steps[this.stepIndex];
    if (!step) {
      this.finish({ outcome: 'complete', reason: '' });
      return;
    }

    this.speakerEl.textContent = step.speaker || '';
    this.textEl.textContent = step.text || '';

    const speakerLower = (step.speaker || '').toLowerCase();
    const leftNameLower = (this.leftName.textContent || '').toLowerCase();
    const rightNameLower = (this.rightName.textContent || '').toLowerCase();
    this.leftSlot.classList.toggle('speaking', Boolean(leftNameLower && speakerLower === leftNameLower));
    this.rightSlot.classList.toggle('speaking', Boolean(rightNameLower && speakerLower === rightNameLower));

    this.choicesEl.replaceChildren();
    if (step.choices && step.choices.length > 0) {
      this.nextBtn.classList.add('hidden');
      this.choicesEl.classList.remove('hidden');
      this.selectedChoiceIndex = Math.min(this.selectedChoiceIndex, step.choices.length - 1);

      step.choices.forEach((choice, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cutscene-choice-btn';
        if (idx === this.selectedChoiceIndex) btn.classList.add('selected');
        btn.textContent = choice.label;
        btn.addEventListener('click', () => {
          this.finish({ outcome: choice.outcome, reason: choice.reason || '' });
        });
        this.choicesEl.appendChild(btn);
      });
    } else {
      this.choicesEl.classList.add('hidden');
      this.nextBtn.classList.remove('hidden');
      this.nextBtn.textContent =
        this.stepIndex >= this.cutscene.steps.length - 1 ? 'Concluir cena' : 'Continuar';
    }
  }

  updateInput(inputState) {
    if (!this.active) return;
    const step = this.cutscene?.steps?.[this.stepIndex];
    if (!step) return;

    const up = Boolean(inputState.moveY < -0.5);
    const down = Boolean(inputState.moveY > 0.5);
    const action = Boolean(inputState.actionPressed ?? inputState.action);

    if (step.choices && step.choices.length > 0) {
      if (up && !this.prevUp) {
        this.selectedChoiceIndex =
          (this.selectedChoiceIndex - 1 + step.choices.length) % step.choices.length;
        this.renderStep();
      }
      if (down && !this.prevDown) {
        this.selectedChoiceIndex = (this.selectedChoiceIndex + 1) % step.choices.length;
        this.renderStep();
      }
      if (action && !this.prevAction) {
        const chosen = step.choices[this.selectedChoiceIndex];
        this.finish({ outcome: chosen.outcome, reason: chosen.reason || '' });
      }
    } else if (action && !this.prevAction) {
      this.advance();
    }

    this.prevAction = action;
    this.prevUp = up;
    this.prevDown = down;
  }

  advance() {
    if (!this.active) return;
    const step = this.cutscene.steps[this.stepIndex];
    if (step?.choices && step.choices.length > 0) return;

    if (this.stepIndex < this.cutscene.steps.length - 1) {
      this.stepIndex += 1;
      this.selectedChoiceIndex = 0;
      this.renderStep();
    } else {
      this.finish({ outcome: 'complete', reason: '' });
    }
  }

  finish(result) {
    this.active = false;
    this.screen.classList.add('hidden');
    const cb = this.onFinish;
    this.onFinish = null;
    cb?.(result);
  }
}
