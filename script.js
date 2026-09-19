(() => {
  "use strict";

  const app = document.querySelector("#app");
  const homeButton = document.querySelector("#home-button");
  const smallerButton = document.querySelector("#text-smaller");
  const largerButton = document.querySelector("#text-larger");

  const STORAGE_KEY = "franskeOrdProgressV1";
  const SETTINGS_KEY = "franskeOrdSettingsV1";
  const LEVEL_LABELS = ["nytt", "gjenkjent", "på vei", "kan skrives", "behersket"];
  let currentView = { name: "home" };
  let activeQuiz = null;
  let browseState = null;
  let settings = loadSettings();
  let progress = loadProgress();

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }

  function loadSettings() {
    try { return { fontScale: 1, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; }
    catch { return { fontScale: 1 }; }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function applyFontScale() {
    document.documentElement.style.setProperty("--font-scale", settings.fontScale);
    smallerButton.disabled = settings.fontScale <= .9;
    largerButton.disabled = settings.fontScale >= 1.4;
  }

  function getWordProgress(id) {
    return progress[id] || {
      level: 0,
      correct: 0,
      wrong: 0,
      streak: 0,
      byMode: { "fr-no": 0, "no-fr": 0, type: 0 },
      lastSeen: null
    };
  }

  function recordAnswer(word, correct, mode) {
    const state = getWordProgress(word.id);
    state.byMode = { "fr-no": 0, "no-fr": 0, type: 0, ...(state.byMode || {}) };
    state[correct ? "correct" : "wrong"] += 1;
    state.streak = correct ? state.streak + 1 : 0;
    state.lastSeen = new Date().toISOString();

    if (correct) {
      state.byMode[mode] += 1;
      if (mode === "fr-no" && state.level === 0 && state.byMode[mode] >= 2) state.level = 1;
      if (mode === "no-fr" && state.level === 1 && state.byMode[mode] >= 2) state.level = 2;
      if (mode === "type" && state.level === 2 && state.byMode[mode] >= 2) state.level = 3;
      if (mode === "type" && state.level === 3 && state.byMode[mode] >= 5) state.level = 4;
    } else if (state.level > 0) {
      state.level -= 1;
    }

    progress[word.id] = state;
    saveProgress();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function focusMain() {
    app.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setView(name, extra = {}) {
    currentView = { name, ...extra };
    homeButton.classList.toggle("visible", name !== "home");
    render();
    focusMain();
  }

  function categoryWords(categoryId) {
    return VOCABULARY.filter(word => word.category === categoryId);
  }

  function render() {
    if (currentView.name === "home") renderHome();
    if (currentView.name === "category") renderCategory(currentView.categoryId);
    if (currentView.name === "browse") renderBrowse();
    if (currentView.name === "quiz") renderQuestion();
    if (currentView.name === "result") renderResult();
  }

  function renderHome() {
    const cards = CATEGORIES.map(category => {
      const words = categoryWords(category.id);
      const practised = words.filter(word => getWordProgress(word.id).correct > 0).length;
      return `
        <button class="category-card" type="button" data-category="${category.id}">
          <span class="category-icon" aria-hidden="true">${category.icon}</span>
          <span>
            <span class="category-name">${escapeHtml(category.name)}</span>
            <span class="category-progress">${practised} av ${words.length} ord øvd</span>
          </span>
        </button>`;
    }).join("");

    app.innerHTML = `
      <section>
        <div class="center">
          <h1>Franske ord</h1>
          <p class="lead">Frisk opp fransken, ti ord om gangen.</p>
        </div>
        <button class="primary-button hero-action" id="random-quiz" type="button">Øv på 10 tilfeldige ord</button>
        <h2 class="section-title">Velg kategori</h2>
        <div class="category-grid">${cards}</div>
      </section>`;

    document.querySelector("#random-quiz").addEventListener("click", () => startQuiz(VOCABULARY, null));
    document.querySelectorAll("[data-category]").forEach(button => {
      button.addEventListener("click", () => setView("category", { categoryId: button.dataset.category }));
    });
  }

  function renderCategory(categoryId) {
    const category = CATEGORIES.find(item => item.id === categoryId);
    const words = categoryWords(categoryId);
    app.innerHTML = `
      <section class="center">
        <div class="category-icon" aria-hidden="true">${category.icon}</div>
        <h1>${escapeHtml(category.name)}</h1>
        <p class="lead">${words.length} ord</p>
        <div class="category-actions">
          <button id="browse" type="button">Bla gjennom ordene</button>
          <button class="primary-button" id="category-quiz" type="button">Øv på 10 ord</button>
        </div>
      </section>`;
    document.querySelector("#browse").addEventListener("click", () => startBrowse(categoryId));
    document.querySelector("#category-quiz").addEventListener("click", () => startQuiz(words, categoryId));
  }

  function startBrowse(categoryId) {
    browseState = { categoryId, words: categoryWords(categoryId), index: 0 };
    setView("browse", { categoryId });
  }

  function renderBrowse() {
    const { words, index, categoryId } = browseState;
    const word = words[index];
    const category = CATEGORIES.find(item => item.id === categoryId);
    app.innerHTML = `
      <section>
        <h1 class="center">${escapeHtml(category.name)}</h1>
        <p class="browse-counter" aria-live="polite">Ord ${index + 1} av ${words.length}</p>
        <div class="browse-card">
          <div class="browse-french" lang="fr">${escapeHtml(word.fr)}</div>
          <div class="browse-norwegian">${escapeHtml(word.no.join(" / "))}</div>
        </div>
        <div class="browse-nav">
          <button id="previous-word" type="button" ${index === 0 ? "disabled" : ""}>← Forrige</button>
          <button id="next-word" type="button">${index === words.length - 1 ? "Start på nytt" : "Neste →"}</button>
        </div>
      </section>`;
    document.querySelector("#previous-word").addEventListener("click", () => changeBrowse(-1));
    document.querySelector("#next-word").addEventListener("click", () => changeBrowse(1));
  }

  function changeBrowse(amount) {
    const last = browseState.words.length - 1;
    browseState.index = amount > 0 && browseState.index === last ? 0 : Math.max(0, browseState.index + amount);
    renderBrowse();
    focusMain();
  }

  function weightedSelection(pool, count) {
    const scored = pool.map(word => {
      const state = getWordProgress(word.id);
      const unseenBoost = state.correct === 0 ? 5 : 0;
      const difficultBoost = Math.min(state.wrong, 4) * 1.2;
      return { word, score: Math.random() * 6 + unseenBoost + difficultBoost - state.level * .3 };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, Math.min(count, pool.length)).map(item => item.word);
  }

  function startQuiz(pool, categoryId) {
    const selected = weightedSelection(pool, 10);
    activeQuiz = {
      categoryId,
      pool,
      queue: selected.map(word => ({ word, firstAttempt: true })),
      originalWords: selected,
      firstTryCorrect: 0,
      retryWords: new Map(),
      answeredOriginals: 0,
      locked: false,
      currentMode: null
    };
    setView("quiz", { categoryId });
  }

  function chooseMode(word) {
    const level = getWordProgress(word.id).level;
    const roll = Math.random();
    if (level <= 0) return "fr-no";
    if (level === 1) return roll < .35 ? "fr-no" : "no-fr";
    if (level === 2) return roll < .2 ? "fr-no" : roll < .6 ? "no-fr" : "type";
    return roll < .2 ? "no-fr" : "type";
  }

  function renderQuestion() {
    if (!activeQuiz.queue.length) {
      setView("result", { categoryId: activeQuiz.categoryId });
      return;
    }

    const item = activeQuiz.queue[0];
    const word = item.word;
    const mode = item.mode || chooseMode(word);
    item.mode = mode;
    activeQuiz.currentMode = mode;
    activeQuiz.locked = false;
    const completed = Math.min(activeQuiz.answeredOriginals, activeQuiz.originalWords.length);
    const positionLabel = item.firstAttempt
      ? `${Math.min(completed + 1, activeQuiz.originalWords.length)} / ${activeQuiz.originalWords.length}`
      : "Gjenta";
    const category = activeQuiz.categoryId ? CATEGORIES.find(cat => cat.id === activeQuiz.categoryId).name : "Blandet øving";
    const prompt = mode === "fr-no" ? word.fr : word.no[0];
    const label = mode === "fr-no" ? "Hva betyr dette?" : mode === "no-fr" ? "Hva heter dette på fransk?" : "Skriv ordet på fransk";

    app.innerHTML = `
      <section class="quiz-shell">
        <div class="progress-row"><span>${escapeHtml(category)}</span><span>${positionLabel}</span></div>
        <div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${completed / activeQuiz.originalWords.length * 100}%"></div></div>
        <p class="prompt-label">${label}</p>
        <h1 class="question-word" ${mode === "fr-no" ? 'lang="fr"' : ""}>${escapeHtml(prompt)}</h1>
        <div id="answer-area">${mode === "type" ? typingMarkup() : choicesMarkup(word, mode)}</div>
        <div id="feedback" class="feedback" aria-live="assertive"></div>
        <button id="next-question" class="primary-button next-button" type="button" hidden>Neste →</button>
      </section>`;

    if (mode === "type") {
      const form = document.querySelector("#type-form");
      form.addEventListener("submit", event => {
        event.preventDefault();
        checkTypedAnswer(document.querySelector("#typed-answer").value, word, item);
      });
      document.querySelector("#typed-answer").focus();
    } else {
      document.querySelectorAll("[data-answer]").forEach(button => {
        button.addEventListener("click", () => checkChoice(button, word, item, mode));
      });
    }
    document.querySelector("#next-question").addEventListener("click", advanceQuiz);
  }

  function choicesMarkup(word, mode) {
    const correct = mode === "fr-no" ? word.no[0] : word.fr;
    const candidates = [...new Set(activeQuiz.pool
      .filter(item => item.id !== word.id)
      .map(item => mode === "fr-no" ? item.no[0] : item.fr))]
      .filter(answer => answer !== correct);
    const answers = shuffle([correct, ...shuffle(candidates).slice(0, 3)]);
    return `<div class="answers">${answers.map(answer => `
      <button class="answer-button" type="button" data-answer="${escapeHtml(answer)}">${escapeHtml(answer)}</button>`).join("")}</div>`;
  }

  function typingMarkup() {
    return `
      <form id="type-form" class="type-form" autocomplete="off">
        <label class="sr-only" for="typed-answer">Svar på fransk</label>
        <input id="typed-answer" name="answer" type="text" lang="fr" autocapitalize="none" spellcheck="false" aria-describedby="typing-help">
        <div class="typing-help" id="typing-help">Aksenter og apostrofer teller ikke som feil.</div>
        <button class="primary-button" type="submit">Sjekk svaret</button>
      </form>`;
  }

  function normalise(value) {
    return value
      .toLocaleLowerCase("fr")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, " ")
      .replace(/[-–—]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function acceptedFrench(word) {
    return [word.fr, ...(word.accept || [])].map(normalise);
  }

  function checkTypedAnswer(value, word, item) {
    if (activeQuiz.locked || !value.trim()) return;
    const isCorrect = acceptedFrench(word).includes(normalise(value));
    finishAnswer(isCorrect, word, item, "type");
    const input = document.querySelector("#typed-answer");
    input.disabled = true;
    document.querySelector("#type-form button").disabled = true;
  }

  function checkChoice(button, word, item, mode) {
    if (activeQuiz.locked) return;
    const expected = mode === "fr-no" ? word.no[0] : word.fr;
    const isCorrect = button.dataset.answer === expected;
    button.classList.add(isCorrect ? "correct" : "wrong");
    document.querySelectorAll("[data-answer]").forEach(choice => {
      choice.disabled = true;
      if (choice.dataset.answer === expected) choice.classList.add("correct");
    });
    finishAnswer(isCorrect, word, item, mode);
  }

  function finishAnswer(isCorrect, word, item, mode) {
    activeQuiz.locked = true;
    recordAnswer(word, isCorrect, mode);

    if (item.firstAttempt) {
      activeQuiz.answeredOriginals += 1;
      if (isCorrect) activeQuiz.firstTryCorrect += 1;
    }

    if (!isCorrect) {
      activeQuiz.retryWords.set(word.id, word);
      activeQuiz.queue.push({ word, firstAttempt: false });
    }

    const feedback = document.querySelector("#feedback");
    feedback.className = `feedback ${isCorrect ? "correct" : "wrong"}`;
    feedback.textContent = isCorrect ? "✓ Riktig!" : `✗ Ikke helt. Riktig svar er: ${word.fr} – ${word.no[0]}`;
    document.querySelector("#next-question").hidden = false;
    document.querySelector("#next-question").focus();
  }

  function advanceQuiz() {
    activeQuiz.queue.shift();
    renderQuestion();
    focusMain();
  }

  function renderResult() {
    const total = activeQuiz.originalWords.length;
    const retries = [...activeQuiz.retryWords.values()];
    const retryMarkup = retries.length ? `
      <div class="retry-words">
        <strong>Disse ordene måtte du prøve igjen på:</strong>
        <ul>${retries.map(word => `<li><span lang="fr">${escapeHtml(word.fr)}</span> – ${escapeHtml(word.no[0])}</li>`).join("")}</ul>
      </div>` : `<p class="retry-words"><strong>Alle ordene satt på første forsøk!</strong></p>`;

    app.innerHTML = `
      <section class="result-box">
        <h1>Runden er ferdig</h1>
        <p class="score">${activeQuiz.firstTryCorrect} av ${total}</p>
        <p>riktige på første forsøk</p>
        ${retryMarkup}
        <div class="result-actions">
          <button class="primary-button" id="repeat-quiz" type="button">Ny quiz av samme type</button>
          <button id="result-home" type="button">Tilbake til hovedsiden</button>
        </div>
      </section>`;
    document.querySelector("#repeat-quiz").addEventListener("click", () => startQuiz(activeQuiz.pool, activeQuiz.categoryId));
    document.querySelector("#result-home").addEventListener("click", () => setView("home"));
  }

  homeButton.addEventListener("click", () => setView("home"));
  smallerButton.addEventListener("click", () => {
    settings.fontScale = Math.max(.9, +(settings.fontScale - .1).toFixed(1));
    saveSettings();
    applyFontScale();
  });
  largerButton.addEventListener("click", () => {
    settings.fontScale = Math.min(1.4, +(settings.fontScale + .1).toFixed(1));
    saveSettings();
    applyFontScale();
  });

  window.addEventListener("keydown", event => {
    if (currentView.name !== "browse") return;
    if (event.key === "ArrowLeft") changeBrowse(-1);
    if (event.key === "ArrowRight") changeBrowse(1);
  });

  applyFontScale();
  renderHome();
})();
