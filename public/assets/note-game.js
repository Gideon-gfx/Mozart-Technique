// A self-contained "name that note" mini-game: draws a real treble-clef
// staff (with correct ledger lines) using inline SVG, asks the player to
// name the highlighted note, and reports a score at the end. No external
// notation library - the note positions are computed directly from music
// theory (each diatonic step is exactly half a line-spacing on the staff),
// which is simple enough not to need one.
(function () {
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  // Diatonic step relative to the bottom line (E4 = step 0). One step =
  // half a line-spacing; even steps sit ON a line, odd steps sit IN a
  // space - this single rule is what places every note correctly without
  // a lookup table.
  function stepFor(letter, octave) {
    const letterIndex = LETTERS.indexOf(letter);
    return (octave * 7 + letterIndex) - (4 * 7 + 2); // E4 = 0
  }
  function noteAtStep(step) {
    const absIndex = step + (4 * 7 + 2);
    const octave = Math.floor(absIndex / 7);
    const letter = LETTERS[((absIndex % 7) + 7) % 7];
    return { letter, octave, step };
  }

  const TIERS = {
    beginner: { label: 'Ages 5-8 · Beginner', minStep: 0, maxStep: 8, optionCount: 4, seconds: 15 },
    intermediate: { label: 'Ages 9-12 · Intermediate', minStep: -2, maxStep: 10, optionCount: 5, seconds: 10 },
    advanced: { label: 'Ages 13+ · Advanced', minStep: -4, maxStep: 12, optionCount: 7, seconds: 6 },
  };

  // A note sitting ON a ledger-line step needs lines drawn all the way out
  // to its own position; a note sitting in the space just past the last
  // ledger line still needs that nearer line drawn as a visual anchor, but
  // no line beyond it. E.g. B3 (one space below middle C's ledger line)
  // shows only the middle-C line; A3 (on the second ledger line) shows two.
  function ledgerSteps(step) {
    const steps = [];
    if (step <= -2) {
      const boundary = step % 2 === 0 ? step : step + 1;
      for (let s = -2; s >= boundary; s -= 2) steps.push(s);
    }
    if (step >= 10) {
      const boundary = step % 2 === 0 ? step : step - 1;
      for (let s = 10; s <= boundary; s += 2) steps.push(s);
    }
    return steps;
  }

  const LINE_SPACING = 18; // px between adjacent staff lines
  const BOTTOM_LINE_Y = 150;
  const STAFF_LEFT = 70;
  const STAFF_RIGHT = 260;
  function yForStep(step) { return BOTTOM_LINE_Y - step * (LINE_SPACING / 2); }

  function staffSvg(note) {
    const lines = [0, 1, 2, 3, 4].map((i) => {
      const y = BOTTOM_LINE_Y - i * LINE_SPACING;
      return `<line x1="${STAFF_LEFT}" y1="${y}" x2="${STAFF_RIGHT}" y2="${y}" stroke="#2b2320" stroke-width="1.5"/>`;
    }).join('');
    const noteY = yForStep(note.step);
    const noteX = 165;
    const ledgers = ledgerSteps(note.step).map((s) => {
      const y = yForStep(s);
      return `<line x1="${noteX - 16}" y1="${y}" x2="${noteX + 16}" y2="${y}" stroke="#2b2320" stroke-width="1.5"/>`;
    }).join('');
    // A hand-drawn treble-clef-style squiggle, not a font glyph - the real
    // G-clef Unicode character lives outside the Basic Multilingual Plane
    // (U+1D11E) and most fonts don't carry a glyph for it, so a font-based
    // approach risks a blank box. Plain SVG paths render identically
    // everywhere.
    const clef = `
      <g transform="translate(${STAFF_LEFT + 6},18)" fill="none" stroke="#2b2320" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17,4 C28,4 30,17 19,21 C7,25 5,38 16,42 C25,45 29,37 24,33" />
        <path d="M17,20 L17,112 C17,128 3,130 3,115 C3,105 13,103 15,111" />
        <circle cx="17" cy="118" r="3.4" fill="#2b2320" stroke="none" />
      </g>
    `;
    return `
      <svg viewBox="0 0 320 190" class="note-game-staff" role="img" aria-label="Musical staff with one note">
        ${clef}
        ${lines}
        ${ledgers}
        <ellipse cx="${noteX}" cy="${noteY}" rx="9" ry="7" fill="#cc0000" transform="rotate(-18 ${noteX} ${noteY})"/>
        <line x1="${noteX + 8.5}" y1="${noteY}" x2="${noteX + 8.5}" y2="${noteY - 38}" stroke="#cc0000" stroke-width="1.8"/>
      </svg>
    `;
  }

  function mount(container, config) {
    const cfg = Object.assign({ questionCount: 10, onComplete: () => {} }, config);
    const tier = TIERS[cfg.tier] || TIERS.beginner;
    let asked = 0;
    let correctCount = 0;
    let score = 0;
    let currentNote = null;
    let timer = null;
    let timeLeft = tier.seconds;
    let locked = false;

    container.innerHTML = `
      <div class="note-game-root">
        <div class="note-game-hud">
          <span class="note-game-progress">Question <span data-q>1</span> / ${cfg.questionCount}</span>
          <span class="note-game-score">Score: <span data-score>0</span></span>
          <span class="note-game-timer" data-timer>${tier.seconds}s</span>
        </div>
        <div class="note-game-board" data-board></div>
        <p class="note-game-prompt">What note is this?</p>
        <div class="note-game-options" data-options></div>
        <p class="note-game-feedback" data-feedback></p>
      </div>
    `;
    const board = container.querySelector('[data-board]');
    const optionsHost = container.querySelector('[data-options]');
    const feedback = container.querySelector('[data-feedback]');
    const qEl = container.querySelector('[data-q]');
    const scoreEl = container.querySelector('[data-score]');
    const timerEl = container.querySelector('[data-timer]');

    function randomNote() {
      const step = tier.minStep + Math.floor(Math.random() * (tier.maxStep - tier.minStep + 1));
      return noteAtStep(step);
    }

    function buildOptions(correct) {
      const pool = new Set([correct.letter]);
      while (pool.size < tier.optionCount) pool.add(LETTERS[Math.floor(Math.random() * LETTERS.length)]);
      return [...pool].sort(() => Math.random() - 0.5);
    }

    function nextQuestion() {
      if (asked >= cfg.questionCount) return finish();
      asked += 1;
      locked = false;
      feedback.textContent = '';
      feedback.className = 'note-game-feedback';
      currentNote = randomNote();
      board.innerHTML = staffSvg(currentNote);
      qEl.textContent = String(asked);
      const options = buildOptions(currentNote);
      optionsHost.innerHTML = options.map((letter) => `<button type="button" class="note-game-option" data-letter="${letter}">${letter}</button>`).join('');
      timeLeft = tier.seconds;
      timerEl.textContent = `${timeLeft}s`;
      clearInterval(timer);
      timer = setInterval(() => {
        timeLeft -= 1;
        timerEl.textContent = `${Math.max(0, timeLeft)}s`;
        if (timeLeft <= 0) { clearInterval(timer); answer(null); }
      }, 1000);
    }

    function answer(letter) {
      if (locked) return;
      locked = true;
      clearInterval(timer);
      const isCorrect = letter === currentNote.letter;
      if (isCorrect) {
        correctCount += 1;
        const speedBonus = Math.max(0, timeLeft);
        score += 10 + speedBonus;
        feedback.textContent = 'Correct!';
        feedback.className = 'note-game-feedback correct';
      } else {
        feedback.textContent = `Not quite - that was ${currentNote.letter}${currentNote.octave}.`;
        feedback.className = 'note-game-feedback wrong';
      }
      scoreEl.textContent = String(score);
      optionsHost.querySelectorAll('.note-game-option').forEach((btn) => {
        btn.disabled = true;
        if (btn.dataset.letter === currentNote.letter) btn.classList.add('correct');
        else if (btn.dataset.letter === letter) btn.classList.add('wrong');
      });
      setTimeout(nextQuestion, 900);
    }

    optionsHost.addEventListener('click', (e) => {
      const btn = e.target.closest('.note-game-option');
      if (btn) answer(btn.dataset.letter);
    });

    function finish() {
      clearInterval(timer);
      container.innerHTML = `
        <div class="note-game-root note-game-done">
          <i class="fa-solid fa-trophy"></i>
          <h3>Round complete!</h3>
          <p>${correctCount} / ${cfg.questionCount} correct - <strong>${score} points</strong></p>
        </div>
      `;
      cfg.onComplete({ score, correctCount, totalCount: cfg.questionCount });
    }

    nextQuestion();
    return { destroy() { clearInterval(timer); } };
  }

  window.NoteGame = { mount, TIERS };
})();
