// ========================
// PACMAN GAME - game.js
// ========================

// ----- Canvas -----
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// ----- Level config (provided by level-config/*.js on each level page) -----
window.LEVEL_CONFIG = window.LEVEL_CONFIG || {
  levelNumber: 1,
  ghostsEnabled: 4   // default to all 4 viruses
};

const WIX_HOME_URL = "https://shadasalah29.wixsite.com/covid19-interactive";

// ----- Level gate: don't allow skipping levels -----
(function enforceLevelProgression() {
  const currentLevel = Number(window.LEVEL_CONFIG.levelNumber || 1);
  const highestCompleted = Number(localStorage.getItem("levelCompleted") || 0);

  console.log("Gate check:", { currentLevel, highestCompleted });

  // To play level N (>1), you must have completed at least level N-1
  if (currentLevel > 1 && highestCompleted < currentLevel - 1) {
    if (WIX_HOME_URL) {
      window.location.href = WIX_HOME_URL;
    } else {
      window.location.href = "level1.html"; // fallback
    }
  }
})();

// Logical tile size
const TILE_SIZE = 24;

// ----- Classic-style Maze -----
// # = wall, . = pellet, o = power pellet, ' ' = empty path
const MAZE_TEMPLATE = [
  "############################", // 0
  "#..........................#", // 1
  "#.##########.##.##########.#", // 2
  "#......##....##....##......#", // 3
  "###.##.##.########.##.##.###", // 4
  "#o..##................##..o#", // 5
  "#.####.##.##    ##.##.####.#", // 6  // virus room row
  "#.####.##.########.##.####.#", // 7
  "#.####.##.########.##.####.#", // 8
  "#..........................#", // 9
  "#.####.##.########.##.####.#", // 10
  "#.####.##.########.##.####.#", // 11
  "#.####.##.##....##.##.####.#", // 12
  "#o..##................##..o#", // 13
  "###.##.##.########.##.##.###", // 14
  "#......##....##....##......#", // 15
  "#.##########.##.##########.#", // 16
  "#..........................#", // 17
  "############################"  // 18
];

const ROWS = MAZE_TEMPLATE.length;
const COLS = MAZE_TEMPLATE[0].length;
canvas.width = COLS * TILE_SIZE;
canvas.height = ROWS * TILE_SIZE;

// ----- Maze grid (mutable pellets) -----
const maze = MAZE_TEMPLATE.map(row => row.split(""));

// 🔹 Count how many power pellets ("o") exist in the original template
const ORIGINAL_POWER_PELLET_COUNT = (function () {
  let count = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (MAZE_TEMPLATE[r][c] === "o") {
        count++;
      }
    }
  }
  return count;
})();

// 🔹 Minimum distance between power pellets (in tiles)
const MIN_POWER_PELLET_DISTANCE_TILES = 10;

// 🔹 Pac-Man start tile + minimum distance from start (in tiles)
const PACMAN_START_TILE = { row: 17, col: 13 }; // x=13.5, y=17.5
const MIN_PELLET_FROM_PACMAN_START_TILES = 10;

// ----- Tile helpers -----
function isGhostHouseTile(row, col) {
  return row === 6 && col >= 12 && col <= 15;
}

function isWall(row, col) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
  return maze[row][col] === "#" || isGhostHouseTile(row, col);
}

function isWalkable(row, col) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
  return maze[row][col] !== "#" && !isGhostHouseTile(row, col);
}

function tileAt(x, y) {
  return {
    row: Math.floor(y),
    col: Math.floor(x)
  };
}

// ----- Assets -----
function loadImage(path) {
  const img = new Image();
  img.src = path;
  return img;
}

// Pellets
const pelletImg = loadImage("img/pellet.png");
const powerPelletImg = loadImage("img/power_pellet2.png");

// 🔹 Syringe (level 4 objective)
const SYRINGE_LEVEL = 4;
const syringeImg = loadImage("img/syringe.png");
let syringeActive = false;
let syringeRow = null;
let syringeCol = null;

// ----- Per-level facts & questions -----
const FACTS_BY_LEVEL = {
  1: [
    "Viruses cannot survive on their own.",
    "COVID-19 was caused by a virus.",
    "Some viruses have special features on their surface that make them different from our cells.",
    "COVID-19 needs our cells to multiply."
  ],
  2: [
    "COVID-19 can affect different parts of your body, including your organs.",
    "COVID-19 can affect how cells create energy, which can make you feel weak.",
    "Your lungs help you breathe in oxygen your body needs.",
    "Your brain controls your thoughts, movements, and everything your body does."
  ],
  3: [
    "Special helpers in the body, called immune cells, protect you when you’re sick.",
    "Some immune cells act like messengers to warn the rest of the body about an invader.",
    "COVID-19 can enter through your nose, mouth, or eyes and make you sick.",
    "Some cells have special locks called receptors, and only certain molecules can fit them like a key."
  ],
  4: [
    "COVID-19 symptoms can be mild or strong.",
    "COVID-19 can sometimes make breathing harder.",
    "Wearing a mask and washing your hands can help slow the spread of COVID-19.",
    "A vaccine teaches your body what a germ looks like so it can fight it faster."
  ]
};

const QUESTIONS_BY_LEVEL = {
  1: [
    { text: "Can a virus survive on its own?", correctYes: false },
    { text: "Do viruses replicate using our cells?", correctYes: true },
    { text: "Was COVID-19 caused by a virus?", correctYes: true },
    {
      text: "Do some viruses have special features on their surface that make them different from our cells?",
      correctYes: true
    }
  ],
  2: [
    { text: "Can COVID-19 affect different organs in your body?", correctYes: true },
    { text: "Do cells stop making enough energy when infected by COVID-19?", correctYes: true },
    { text: "Does COVID-19 only affect the lungs and nothing else?", correctYes: false },
    { text: "Does damage to the brain affect how your body works?", correctYes: true }
  ],
  3: [
    { text: "Do immune cells help your body fight infections?", correctYes: true },
    { text: "Do immune cells work together?", correctYes: true },
    { text: "Can COVID-19 infect someone without entering their body?", correctYes: false },
    { text: "Can any molecule fit into a cell’s receptor lock?", correctYes: false }
  ],
  4: [
    { text: "Does COVID-19 only cause one symptom?", correctYes: false },
    { text: "Can COVID-19 sometimes make it harder to breathe?", correctYes: true },
    { text: "Does washing your hands make it harder for COVID-19 to spread?", correctYes: true },
    { text: "Do vaccines reduce illnesses?", correctYes: true }
  ]
};

// ----- Fact & question state -----
let factsShownThisLevel = 0;
let currentFactText = "";
let pendingQuestionAfterFact = false;

let currentQuestion = null;
let questionAttempts = 0;   // max 2
let questionFeedback = "";

// ----- HTML overlay elements -----
let factOverlay, factTextEl, factOkBtn;
let questionOverlay, questionTitleEl, questionTextEl, questionHintEl, questionFeedbackEl, questionYesBtn, questionNoBtn;
let questionResultOverlay, questionResultTextEl, questionResultContinueBtn;

// Pac-Man sprites
const pacmanSprites = {
  right: [1, 2, 3].map(i => loadImage(`img/pacman/pacman-right/${i}.png`)),
  left:  [1, 2, 3].map(i => loadImage(`img/pacman/pacman-left/${i}.png`)),
  up:    [1, 2, 3].map(i => loadImage(`img/pacman/pacman-up/${i}.png`)),
  down:  [1, 2, 3].map(i => loadImage(`img/pacman/pacman-down/${i}.png`))
};

// Virus sprites (ghosts)
const ghostSprites = {
  red:        loadImage("img/ghosts/virus1.png"),
  pink:       loadImage("img/ghosts/virus2.png"),
  teal:       loadImage("img/ghosts/virus3.png"),
  orange:     loadImage("img/ghosts/virus4.png"),
  frightened: loadImage("img/ghosts/freightened2.png")
};

// Sounds
const sndBegin        = new Audio("sounds/pacman_beginning.wav");
const sndChomp        = new Audio("sounds/pacman_chomp.wav");
const sndDeath        = new Audio("sounds/pacman_death.wav");
const sndEatFruit     = new Audio("sounds/pacman_eatfruit.wav");
const sndEatGhost     = new Audio("sounds/pacman_eatghost.wav");
const sndIntermission = new Audio("sounds/pacman_intermission.wav");

// 🎉 Cheer sound for level win (before questions)
const sndCheer        = new Audio("sounds/cheer.mp3");
sndCheer.loop = false;

sndChomp.loop = true;
let chompPlaying = false;

// ----- Game State -----
// gameState can be: "intro", "playing", "dead", "gameover", "win", "paused",
//                   "fact", "question", "questionResult"
let score = 0;
let lives = 3;
let gameState = "playing";
const PACMAN_SPEED = 7;
const GHOST_SPEED_BASE = 4;
const GHOST_SPEED =
  GHOST_SPEED_BASE * (window.LEVEL_CONFIG.ghostSpeedMultiplier || 1);
const POWER_DURATION = 7;

// Pac-Man object
const pacman = {
  x: 13.5,
  y: 17.5,
  dirX: 0,
  dirY: 0,
  nextDirX: 0,
  nextDirY: 0,
  speed: PACMAN_SPEED,
  facing: "right",
  animFrame: 0,
  animTimer: 0,
  power: false,
  powerTimer: 0
};

// ----- Syringe helpers -----
function resetSyringe() {
  syringeActive = false;
  syringeRow = null;
  syringeCol = null;
}

function spawnSyringe() {
  const currentLevel = window.LEVEL_CONFIG.levelNumber || 1;
  if (currentLevel !== SYRINGE_LEVEL) return;
  if (syringeActive) return;

  const candidates = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isWalkable(r, c)) continue;
      if (isGhostHouseTile(r, c)) continue;
      candidates.push({ r, c });
    }
  }
  if (!candidates.length) return;

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  syringeRow = pick.r;
  syringeCol = pick.c;
  syringeActive = true;
}

// 🔧 Utility: shuffle an array in-place (Fisher–Yates)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
}

// 🔹 Randomize power pellet ("big pill") positions
function randomizePowerPellets() {
  // Remove any existing 'o' from the maze
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (maze[r][c] === "o") {
        maze[r][c] = ".";
      }
    }
  }

  const candidates = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isWalkable(r, c)) continue;
      if (isGhostHouseTile(r, c)) continue;
      candidates.push({ r, c });
    }
  }

  shuffleArray(candidates);

  const minDistSq =
    MIN_POWER_PELLET_DISTANCE_TILES * MIN_POWER_PELLET_DISTANCE_TILES;
  const minFromStartSq =
    MIN_PELLET_FROM_PACMAN_START_TILES * MIN_PELLET_FROM_PACMAN_START_TILES;

  let remaining = Math.min(ORIGINAL_POWER_PELLET_COUNT, candidates.length);
  const placed = [];

  // First pass: enforce spacing + distance from Pac-Man start
  for (let i = 0; i < candidates.length && remaining > 0; i++) {
    const { r, c } = candidates[i];

    const dsr = r - PACMAN_START_TILE.row;
    const dsc = c - PACMAN_START_TILE.col;
    if (dsr * dsr + dsc * dsc < minFromStartSq) continue;

    let ok = true;
    for (const p of placed) {
      const dr = r - p.r;
      const dc = c - p.c;
      if (dr * dr + dc * dc < minDistSq) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    maze[r][c] = "o";
    placed.push({ r, c });
    remaining--;
  }

  // Fallback: still keep them away from Pac-Man start, ignore spacing
  if (remaining > 0) {
    for (let i = 0; i < candidates.length && remaining > 0; i++) {
      const { r, c } = candidates[i];
      if (maze[r][c] === "o") continue;

      const dsr = r - PACMAN_START_TILE.row;
      const dsc = c - PACMAN_START_TILE.col;
      if (dsr * dsr + dsc * dsc < minFromStartSq) continue;

      maze[r][c] = "o";
      remaining--;
    }
  }
}

// ----- Level intro text helper -----
function getLevelIntroLines() {
  const lvl = window.LEVEL_CONFIG.levelNumber || 1;

  return [
    `Level ${lvl}`,
    "Eat pellets for points.",
    "Eat the big pills to reveal COVID-19 facts.",
    ...(lvl === SYRINGE_LEVEL
      ? ["After all 4 facts, a syringe appears.", "Grab it to unlock your quiz question."]
      : ["After all 4 facts, answer a Yes/No question."]),
    "Press Space / Enter / P to start"
  ];
}

// ----- Virus room (ghost house) geometry -----
const GHOST_DOOR_X = 13.5;
const GHOST_DOOR_Y = 5.5;

const HOME_TILES = [
  { x: 12.5, y: 6.5 },
  { x: 13.5, y: 6.5 },
  { x: 14.5, y: 6.5 },
  { x: 15.5, y: 6.5 }
];

function makeGhost(type, spawnX, spawnY, homeX = spawnX, homeY = spawnY) {
  return {
    type,
    x: spawnX,
    y: spawnY,
    spawnX,
    spawnY,
    homeX,
    homeY,
    dirX: 0,
    dirY: 0,
    speed: GHOST_SPEED,
    frightened: false,
    eaten: false,
    released: false,
    releaseTimer: 0
  };
}

const ALL_GHOSTS = [
  makeGhost("red",    HOME_TILES[0].x, HOME_TILES[0].y, HOME_TILES[0].x, HOME_TILES[0].y),
  makeGhost("pink",   HOME_TILES[1].x, HOME_TILES[1].y, HOME_TILES[1].x, HOME_TILES[1].y),
  makeGhost("teal",   HOME_TILES[2].x, HOME_TILES[2].y, HOME_TILES[2].x, HOME_TILES[2].y),
  makeGhost("orange", HOME_TILES[3].x, HOME_TILES[3].y, HOME_TILES[3].x, HOME_TILES[3].y)
];

const GHOST_RELEASE_DELAYS_BASE = [0, 2, 4, 6];

const ghosts = ALL_GHOSTS.slice(0, window.LEVEL_CONFIG.ghostsEnabled);
const ghostReleaseDelays = GHOST_RELEASE_DELAYS_BASE.slice(0, ghosts.length);

ghosts.forEach((g, i) => {
  g.releaseTimer = ghostReleaseDelays[i];
  if (i === 0) {
    g.released = true;
    g.x = GHOST_DOOR_X;
    g.y = GHOST_DOOR_Y;
    g.dirX = 0;
    g.dirY = 1;
  } else {
    g.released = false;
  }
});

// ----- Fact & Question helpers -----
function handlePowerPelletFact() {
  const currentLevel = window.LEVEL_CONFIG.levelNumber || 1;
  const facts = FACTS_BY_LEVEL[currentLevel] || [];
  if (!facts.length) return;

  if (factsShownThisLevel < facts.length) {
    currentFactText = facts[factsShownThisLevel];
    factsShownThisLevel++;
    pendingQuestionAfterFact = (factsShownThisLevel === facts.length);
    gameState = "fact";
    showFactOverlay(currentFactText);
  }
}

function startQuestionPhase() {
  const currentLevel = window.LEVEL_CONFIG.levelNumber || 1;
  const questions = QUESTIONS_BY_LEVEL[currentLevel] || [];

  if (!questions.length) {
    triggerWin();
    return;
  }

  const idx = Math.floor(Math.random() * questions.length);
  currentQuestion = questions[idx];
  questionAttempts = 0;
  questionFeedback = "";
  gameState = "question";
  showQuestionOverlay();
}

function handleQuestionAnswer(answerYes) {
  if (!currentQuestion) return;

  const correct = currentQuestion.correctYes === answerYes;
  if (correct) {
    questionFeedback = "Correct! Let's learn more!";
    gameState = "questionResult";
  } else {
    questionAttempts++;
    if (questionAttempts < 2) {
      questionFeedback = "Incorrect. Try once more!";
      gameState = "question";
    } else {
      questionFeedback = "Incorrect. Let's learn why.";
      gameState = "questionResult";
    }
  }
}

// 🔹 Cheer + YOU WIN banner, then questions
function beginWinCheerThenQuestion() {
  sndChomp.pause();  sndChomp.currentTime = 0;
  sndDeath.pause();  sndDeath.currentTime = 0;
  sndEatFruit.pause(); sndEatFruit.currentTime = 0;
  sndEatGhost.pause(); sndEatGhost.currentTime = 0;

  // Show YOU WIN text while cheer plays
  gameState = "win";

  sndCheer.onended = () => {
    sndCheer.onended = null;
    if (gameState === "win") {
      startQuestionPhase();
    }
  };

  try {
    sndCheer.currentTime = 0;
    sndCheer.play().catch(() => {
      sndCheer.onended = null;
      startQuestionPhase();
    });
  } catch (e) {
    sndCheer.onended = null;
    startQuestionPhase();
  }
}

// ----- UI overlay creation & controls -----
function createUIOverlays() {
  // FACT OVERLAY
  factOverlay = document.createElement("div");
  factOverlay.id = "factOverlay";
  Object.assign(factOverlay.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.5)",
    zIndex: "9999"
  });

  const factPanel = document.createElement("div");
  Object.assign(factPanel.style, {
    background: "rgba(0,0,0,0.9)",
    border: "2px solid #FF10F0",
    borderRadius: "16px",
    padding: "20px 30px",
    maxWidth: "600px",
    color: "#ffffff",
    textAlign: "center",
    boxShadow: "0 0 20px rgba(255, 16, 240,0.6)"
  });

  const factTitle = document.createElement("h2");
  factTitle.textContent = "Did you know?";
  Object.assign(factTitle.style, {
    color: "#FF10F0",
    marginTop: "0",
    marginBottom: "12px"
  });

  factTextEl = document.createElement("p");
  Object.assign(factTextEl.style, {
    fontSize: "18px",
    margin: "0 0 18px 0"
  });

  factOkBtn = document.createElement("button");
  factOkBtn.textContent = "OK";
  Object.assign(factOkBtn.style, {
    background: "#111133",
    border: "2px solid #ffcc00",
    borderRadius: "12px",
    padding: "8px 24px",
    color: "#ffcc00",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer"
  });

  factOkBtn.addEventListener("click", () => {
    confirmFactAdvance();
  });

  factPanel.appendChild(factTitle);
  factPanel.appendChild(factTextEl);
  factPanel.appendChild(factOkBtn);
  factOverlay.appendChild(factPanel);
  document.body.appendChild(factOverlay);

  // QUESTION OVERLAY
  questionOverlay = document.createElement("div");
  Object.assign(questionOverlay.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.5)",
    zIndex: "9999"
  });

  const qPanel = document.createElement("div");
  Object.assign(qPanel.style, {
    background: "rgba(0,0,0,0.9)",
    border: "2px solid #FF10F0",
    borderRadius: "16px",
    padding: "20px 30px",
    maxWidth: "650px",
    color: "#ffffff",
    textAlign: "center",
    boxShadow: "0 0 20px rgba(255, 16, 240,0.6)"
  });

  questionTitleEl = document.createElement("h2");
  questionTitleEl.textContent = "Quick Check";
  Object.assign(questionTitleEl.style, {
    color: "#FF10F0",
    marginTop: "0",
    marginBottom: "10px"
  });

  questionFeedbackEl = document.createElement("p");
  Object.assign(questionFeedbackEl.style, {
    fontSize: "16px",
    minHeight: "20px",
    margin: "0 0 10px 0"
  });

  questionTextEl = document.createElement("p");
  Object.assign(questionTextEl.style, {
    fontSize: "18px",
    margin: "0 0 14px 0"
  });

  questionHintEl = document.createElement("p");
  Object.assign(questionHintEl.style, {
    fontSize: "14px",
    margin: "0 0 16px 0",
    color: "#cccccc"
  });

  const qButtonsRow = document.createElement("div");
  Object.assign(qButtonsRow.style, {
    display: "flex",
    justifyContent: "center",
    gap: "20px"
  });

  questionYesBtn = document.createElement("button");
  questionYesBtn.textContent = "Yes";
  Object.assign(questionYesBtn.style, {
    background: "#113311",
    border: "2px solid #44ff44",
    borderRadius: "10px",
    padding: "8px 24px",
    color: "#44ff44",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer"
  });

  questionNoBtn = document.createElement("button");
  questionNoBtn.textContent = "No";
  Object.assign(questionNoBtn.style, {
    background: "#331111",
    border: "2px solid #ff4444",
    borderRadius: "10px",
    padding: "8px 24px",
    color: "#ff4444",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer"
  });

  questionYesBtn.addEventListener("click", () => {
    if (gameState !== "question") return;
    handleQuestionAnswer(true);
    if (gameState === "question") {
      showQuestionOverlay();
    } else if (gameState === "questionResult") {
      hideQuestionOverlay();
      showQuestionResultOverlay();
    }
  });

  questionNoBtn.addEventListener("click", () => {
    if (gameState !== "question") return;
    handleQuestionAnswer(false);
    if (gameState === "question") {
      showQuestionOverlay();
    } else if (gameState === "questionResult") {
      hideQuestionOverlay();
      showQuestionResultOverlay();
    }
  });

  qButtonsRow.appendChild(questionYesBtn);
  qButtonsRow.appendChild(questionNoBtn);

  qPanel.appendChild(questionTitleEl);
  qPanel.appendChild(questionFeedbackEl);
  qPanel.appendChild(questionTextEl);
  qPanel.appendChild(questionHintEl);
  qPanel.appendChild(qButtonsRow);
  questionOverlay.appendChild(qPanel);
  document.body.appendChild(questionOverlay);

  // QUESTION RESULT OVERLAY
  questionResultOverlay = document.createElement("div");
  Object.assign(questionResultOverlay.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.5)",
    zIndex: "9999"
  });

  const qrPanel = document.createElement("div");
  Object.assign(qrPanel.style, {
    background: "rgba(0,0,0,0.9)",
    border: "2px solid #FF10F0",
    borderRadius: "16px",
    padding: "20px 30px",
    maxWidth: "600px",
    color: "#ffffff",
    textAlign: "center",
    boxShadow: "0 0 20px rgba(255, 16, 240,0.6)"
  });

  const qrTitle = document.createElement("h2");
  qrTitle.textContent = "Result";
  Object.assign(qrTitle.style, {
    color: "#FF10F0",
    marginTop: "0",
    marginBottom: "12px"
  });

  questionResultTextEl = document.createElement("p");
  Object.assign(questionResultTextEl.style, {
    fontSize: "18px",
    margin: "0 0 16px 0"
  });

  const qrHint = document.createElement("p");
  qrHint.textContent = "Click Continue to view the info page.";
  Object.assign(qrHint.style, {
    fontSize: "14px",
    margin: "0 0 16px 0",
    color: "#cccccc"
  });

  questionResultContinueBtn = document.createElement("button");
  questionResultContinueBtn.textContent = "Continue";
  Object.assign(questionResultContinueBtn.style, {
    background: "#111133",
    border: "2px solid #ffcc00",
    borderRadius: "12px",
    padding: "8px 24px",
    color: "#ffcc00",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer"
  });

  questionResultContinueBtn.addEventListener("click", () => {
    if (gameState !== "questionResult") return;
    hideQuestionResultOverlay();
    triggerWin();
  });

  qrPanel.appendChild(qrTitle);
  qrPanel.appendChild(questionResultTextEl);
  qrPanel.appendChild(qrHint);
  qrPanel.appendChild(questionResultContinueBtn);
  questionResultOverlay.appendChild(qrPanel);
  document.body.appendChild(questionResultOverlay);
}

function showFactOverlay(text) {
  if (!factOverlay) return;
  factTextEl.textContent = text || "";
  factOverlay.style.display = "flex";
}

function hideFactOverlay() {
  if (!factOverlay) return;
  factOverlay.style.display = "none";
}

// 🔹 Fact close logic:
// Levels 1–3: after last fact → cheer + YOU WIN → then question
// Level 4: after 4th fact → spawn syringe → play continues;
//          later, syringe pickup → cheer + YOU WIN → then question
function confirmFactAdvance() {
  if (gameState !== "fact") return;
  hideFactOverlay();

  const lvl = window.LEVEL_CONFIG.levelNumber || 1;

  if (pendingQuestionAfterFact) {
    pendingQuestionAfterFact = false;
    if (lvl === SYRINGE_LEVEL) {
      // Level 4: just spawn syringe now, question happens on syringe pickup
      spawnSyringe();
      gameState = "playing";
    } else {
      // Levels 1–3: go straight into cheer + YOU WIN, then question
      beginWinCheerThenQuestion();
    }
  } else {
    gameState = "playing";
  }
}

function showQuestionOverlay() {
  if (!questionOverlay) return;
  if (currentQuestion) {
    questionTextEl.textContent = currentQuestion.text;
  } else {
    questionTextEl.textContent = "";
  }
  questionFeedbackEl.textContent = questionFeedback || "";
  const attemptsLeft = Math.max(0, 2 - questionAttempts);
  questionHintEl.textContent = `Attempts left: ${attemptsLeft}. Click Yes or No (or press Y / N).`;
  questionOverlay.style.display = "flex";
}

function hideQuestionOverlay() {
  if (!questionOverlay) return;
  questionOverlay.style.display = "none";
}

function showQuestionResultOverlay() {
  if (!questionResultOverlay) return;
  questionResultTextEl.textContent = questionFeedback || "";
  questionResultOverlay.style.display = "flex";
}

function hideQuestionResultOverlay() {
  if (!questionResultOverlay) return;
  questionResultOverlay.style.display = "none";
}

// Create overlays once DOM exists
createUIOverlays();

// ----- Input (keyboard) -----
window.addEventListener("keydown", e => {
  // Intro popup (all levels)
  if (
    gameState === "intro" &&
    (e.key === " " || e.key === "Enter" || e.key === "p" || e.key === "P")
  ) {
    gameState = "playing";
    return;
  }

  // Fact popup: Space/Enter/P acts like clicking OK
  if (
    gameState === "fact" &&
    (e.key === " " || e.key === "Enter" || e.key === "p" || e.key === "P")
  ) {
    confirmFactAdvance();
    return;
  }

  // Question Yes/No
  if (gameState === "question") {
    if (e.key === "y" || e.key === "Y") {
      handleQuestionAnswer(true);
    } else if (e.key === "n" || e.key === "N") {
      handleQuestionAnswer(false);
    } else {
      return;
    }

    if (gameState === "question") {
      showQuestionOverlay();
    } else if (gameState === "questionResult") {
      hideQuestionOverlay();
      showQuestionResultOverlay();
    }
    return;
  }

  // Question result → go to info page
  if (
    gameState === "questionResult" &&
    (e.key === " " || e.key === "Enter")
  ) {
    hideQuestionResultOverlay();
    triggerWin();
    return;
  }

  // Pause/resume
  if (e.key === "p" || e.key === "P") {
    if (gameState === "playing") {
      gameState = "paused";
    } else if (gameState === "paused") {
      gameState = "playing";
    }
    return;
  }

  // Home from pause
  if (gameState === "paused") {
    if (e.key === "h" || e.key === "H") {
      window.location.href = WIX_HOME_URL || "home-level-select.html";
    }
    return;
  }

  // Movement
  let dx = 0, dy = 0;
  if (e.key === "ArrowUp")    { dx = 0;  dy = -1; pacman.facing = "up"; }
  if (e.key === "ArrowDown")  { dx = 0;  dy =  1; pacman.facing = "down"; }
  if (e.key === "ArrowLeft")  { dx = -1; dy =  0; pacman.facing = "left"; }
  if (e.key === "ArrowRight") { dx =  1; dy =  0; pacman.facing = "right"; }
  if (dx !== 0 || dy !== 0) {
    pacman.nextDirX = dx;
    pacman.nextDirY = dy;
  }

  if (gameState === "dead" && e.key === " ") {
    resetAfterDeath();
  } else if ((gameState === "gameover" || gameState === "win") &&
             (e.key === "r" || e.key === "R")) {
    restartGame();
  }
});

// ----- Movement helpers -----
function atTileCenter(entity) {
  const cx = Math.floor(entity.x) + 0.5;
  const cy = Math.floor(entity.y) + 0.5;
  return Math.abs(entity.x - cx) < 0.1 && Math.abs(entity.y - cy) < 0.1;
}

function tryChangeDirection(entity, nextX, nextY, dt) {
  if (nextX === 0 && nextY === 0) return;
  if (!atTileCenter(entity)) return;
  const centerRow = Math.floor(entity.y);
  const centerCol = Math.floor(entity.x);
  const targetRow = centerRow + nextY;
  const targetCol = centerCol + nextX;
  if (!isWall(targetRow, targetCol)) {
    entity.dirX = nextX;
    entity.dirY = nextY;
  }
}

function moveEntity(entity, dt) {
  const step = entity.speed * dt;
  let newX = entity.x + entity.dirX * step;
  let newY = entity.y + entity.dirY * step;

  if (newX < 0) newX = COLS - 0.01;
  if (newX > COLS - 1) newX = 0.01;

  const { row, col } = tileAt(newX, newY);
  if (!isWall(row, col)) {
    entity.x = newX;
    entity.y = newY;
  } else {
    entity.x = Math.floor(entity.x) + 0.5;
    entity.y = Math.floor(entity.y) + 0.5;
    entity.dirX = 0;
    entity.dirY = 0;
  }
}

// ----- Game logic: Pac-Man -----
function updatePacman(dt) {
  if (gameState !== "playing") return;

  tryChangeDirection(pacman, pacman.nextDirX, pacman.nextDirY, dt);
  moveEntity(pacman, dt);

  if (pacman.dirX !== 0 || pacman.dirY !== 0) {
    pacman.animTimer += dt;
    if (pacman.animTimer > 0.08) {
      pacman.animTimer = 0;
      pacman.animFrame = (pacman.animFrame + 1) % 3;
    }
  } else {
    pacman.animFrame = 1;
  }

  const { row, col } = tileAt(pacman.x, pacman.y);
  const tile = maze[row][col];

  if (tile === "." || tile === "o") {
    maze[row][col] = " ";

    if (tile === ".") {
      score += 10;
      if (!chompPlaying) {
        sndChomp.currentTime = 0;
        sndChomp.play().catch(() => {});
        chompPlaying = true;
      }
    } else if (tile === "o") {
      score += 50;
      pacman.power = true;
      pacman.powerTimer = POWER_DURATION;
      ghosts.forEach(g => { g.frightened = true; g.eaten = false; });
      sndEatFruit.currentTime = 0;
      sndEatFruit.play().catch(() => {});

      // show next fact for this level
      handlePowerPelletFact();
    }
  }

  if (tile !== "." && chompPlaying) {
    sndChomp.pause();
    sndChomp.currentTime = 0;
    chompPlaying = false;
  }

  const currentLevel = window.LEVEL_CONFIG.levelNumber || 1;

  // 🔹 Level 4: syringe pickup → cheer + YOU WIN, then question
  if (currentLevel === SYRINGE_LEVEL &&
      syringeActive &&
      row === syringeRow &&
      col === syringeCol) {
    syringeActive = false;
    score += 200;
    sndEatFruit.currentTime = 0;
    sndEatFruit.play().catch(() => {});
    beginWinCheerThenQuestion();
  }

  if (pacman.power) {
    pacman.powerTimer -= dt;
    if (pacman.powerTimer <= 0) {
      pacman.power = false;
      ghosts.forEach(g => { g.frightened = false; g.eaten = false; });
    }
  }
}

// ----- Game logic: Viruses (ghosts) -----
function chooseGhostDirection(ghost) {
  if (!atTileCenter(ghost)) return;

  const centerRow = Math.floor(ghost.y);
  const centerCol = Math.floor(ghost.x);

  const dirs = [
    { x: 1,  y: 0 },
    { x: -1, y: 0 },
    { x: 0,  y: 1 },
    { x: 0,  y: -1 }
  ];

  const opp = { x: -ghost.dirX, y: -ghost.dirY };
  const options = [];

  dirs.forEach(d => {
    const r = centerRow + d.y;
    const c = centerCol + d.x;
    if (!isWall(r, c)) {
      if (!(d.x === opp.x && d.y === opp.y)) {
        options.push(d);
      }
    }
  });

  if (options.length === 0) {
    ghost.dirX = opp.x;
    ghost.dirY = opp.y;
    return;
  }

  let chosen;
  if (ghost.frightened) {
    chosen = options[Math.floor(Math.random() * options.length)];
  } else {
    let best = null;
    let bestDist = Infinity;
    for (const d of options) {
      const nx = ghost.x + d.x;
      const ny = ghost.y + d.y;
      const dx = nx - pacman.x;
      const dy = ny - pacman.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    chosen = best;
  }

  ghost.dirX = chosen.x;
  ghost.dirY = chosen.y;
}

function updateGhosts(dt) {
  if (gameState !== "playing") return;

  ghosts.forEach(g => {
    if (!g.released) {
      g.releaseTimer -= dt;
      if (g.releaseTimer <= 0) {
        g.released = true;
        g.x = GHOST_DOOR_X;
        g.y = GHOST_DOOR_Y;
        g.dirX = 0;
        g.dirY = 1;
      } else {
        return;
      }
    }

    const baseSpeed = g.frightened ? GHOST_SPEED * 0.7 : GHOST_SPEED;
    g.speed = baseSpeed;
    chooseGhostDirection(g);
    moveEntity(g, dt);

    const dx = g.x - pacman.x;
    const dy = g.y - pacman.y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < 0.35 * 0.35) {
      if (g.frightened && !g.eaten) {
        g.eaten = true;
        g.frightened = false;
        score += 200;
        sndEatGhost.currentTime = 0;
        sndEatGhost.play().catch(() => {});

        g.x = g.homeX;
        g.y = g.homeY;
        g.dirX = 0;
        g.dirY = 0;
        g.releaseTimer = 4;
        g.released = false;
      } else if (!g.frightened) {
        handleDeath();
      }
    }
  });
}

function handleDeath() {
  if (gameState !== "playing") return;
  lives--;
  sndDeath.currentTime = 0;
  sndDeath.play().catch(() => {});
  sndChomp.pause();
  sndChomp.currentTime = 0;
  chompPlaying = false;
  if (lives <= 0) {
    gameState = "gameover";
  } else {
    gameState = "dead";
  }
}

function resetAfterDeath() {
  pacman.x = 13.5;
  pacman.y = 17.5;
  pacman.dirX = 0;
  pacman.dirY = 0;
  pacman.nextDirX = 0;
  pacman.nextDirY = 0;
  pacman.power = false;
  pacman.powerTimer = 0;

  ghosts.forEach((g, i) => {
    g.x = g.spawnX;
    g.y = g.spawnY;
    g.dirX = 0;
    g.dirY = 0;
    g.frightened = false;
    g.eaten = false;
    g.releaseTimer = ghostReleaseDelays[i];
    if (i === 0) {
      g.released = true;
      g.x = GHOST_DOOR_X;
      g.y = GHOST_DOOR_Y;
      g.dirY = 1;
    } else {
      g.released = false;
    }
  });

  gameState = "playing";
}

// We no longer use pellet-based win
function checkWin() {}

// Restart whole level
function restartGame() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = MAZE_TEMPLATE[r][c];
      if (ch === "." || ch === "o" || ch === "#" || ch === " ") {
        maze[r][c] = ch;
      } else {
        maze[r][c] = " ";
      }
    }
  }

  randomizePowerPellets();

  score = 0;
  lives = 3;
  pacman.power = false;
  pacman.powerTimer = 0;

  factsShownThisLevel = 0;
  currentFactText = "";
  pendingQuestionAfterFact = false;
  currentQuestion = null;
  questionAttempts = 0;
  questionFeedback = "";

  resetSyringe();

  hideFactOverlay();
  hideQuestionOverlay();
  hideQuestionResultOverlay();

  resetAfterDeath();
  gameState = "intro";
}

function triggerWin() {
  gameState = "win";

  sndChomp.pause();  sndChomp.currentTime = 0;
  sndDeath.pause();  sndDeath.currentTime = 0;
  sndEatFruit.pause(); sndEatFruit.currentTime = 0;
  sndEatGhost.pause(); sndEatGhost.currentTime = 0;

  const currentLevel = window.LEVEL_CONFIG.levelNumber || 1;
  const prevCompleted = Number(localStorage.getItem("levelCompleted") || 0);
  if (currentLevel > prevCompleted) {
    localStorage.setItem("levelCompleted", currentLevel);
  }

  const wixInfoUrls = {
    1: "https://shadasalah29.wixsite.com/covid19-interactive/about-1",
    2: "https://shadasalah29.wixsite.com/covid19-interactive/level-2",
    3: "https://shadasalah29.wixsite.com/covid19-interactive/level-3",
    4: "https://shadasalah29.wixsite.com/covid19-interactive/level-4"
  };

  const target = wixInfoUrls[currentLevel] || `info${currentLevel}.html`;

  try {
    if (window.top && window.top !== window) {
      window.top.location.href = target;
    } else {
      window.location.href = target;
    }
  } catch (e) {
    window.location.href = target;
  }
}

// ----- Drawing -----
function drawMaze() {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.strokeStyle = "#1c3ad5";
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.shadowColor = "rgba(28, 58, 213, 0.8)";
  ctx.shadowBlur  = 6;

  const inset = 0;

  let minRow = ROWS, maxRow = -1;
  let minCol = COLS, maxCol = -1;

  const isWallTemplate = (rr, cc) =>
    rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS &&
    MAZE_TEMPLATE[rr][cc] === "#";

  ctx.beginPath();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const chTemplate = MAZE_TEMPLATE[r][c];
      if (chTemplate !== "#") continue;

      if (r < minRow) minRow = r;
      if (r > maxRow) maxRow = r;
      if (c < minCol) minCol = c;
      if (c > maxCol) maxCol = c;

      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;

      const left   = x + inset;
      const right  = x + TILE_SIZE - inset;
      const top    = y + inset;
      const bottom = y + TILE_SIZE - inset;

      if (!isWallTemplate(r - 1, c)) {
        ctx.moveTo(left, top);
        ctx.lineTo(right, top);
      }
      if (!isWallTemplate(r + 1, c)) {
        ctx.moveTo(left, bottom);
        ctx.lineTo(right, bottom);
      }
      if (!isWallTemplate(r, c - 1)) {
        ctx.moveTo(left, top);
        ctx.lineTo(left, bottom);
      }
      if (!isWallTemplate(r, c + 1)) {
        ctx.moveTo(right, top);
        ctx.lineTo(right, bottom);
      }
    }
  }

  ctx.stroke();

  if (minRow <= maxRow && minCol <= maxCol) {
    const outerLeft   = minCol * TILE_SIZE;
    const outerRight  = (maxCol + 1) * TILE_SIZE;
    const outerTop    = minRow * TILE_SIZE;
    const outerBottom = (maxRow + 1) * TILE_SIZE;

    const gap = TILE_SIZE * 0.3;
    const innerLeft   = outerLeft + gap;
    const innerRight  = outerRight - gap;
    const innerTop    = outerTop + gap;
    const innerBottom = outerBottom - gap;

    ctx.beginPath();
    ctx.moveTo(innerLeft, innerTop);
    ctx.lineTo(innerRight, innerTop);
    ctx.lineTo(innerRight, innerBottom);
    ctx.lineTo(innerLeft, innerBottom);
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();

  // pellets & power pellets
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tileCurrent = maze[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;

      if (tileCurrent === "." && !isGhostHouseTile(r, c)) {
        const cx = x + TILE_SIZE / 2;
        const cy = y + TILE_SIZE / 2;

        ctx.save();
        ctx.fillStyle = "#fff6a0";
        ctx.shadowColor = "rgba(255, 255, 180, 0.9)";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cx, cy, TILE_SIZE * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const size = TILE_SIZE * 0.4;
        if (pelletImg.complete && pelletImg.naturalWidth) {
          ctx.drawImage(pelletImg, cx - size / 2, cy - size / 2, size, size);
        } else {
          ctx.fillStyle = "#ffffd0";
          ctx.beginPath();
          ctx.arc(cx, cy, TILE_SIZE * 0.18, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (tileCurrent === "o") {
        const cx = x + TILE_SIZE / 2;
        const cy = y + TILE_SIZE / 2;
        const size = TILE_SIZE * 1.2;
        if (powerPelletImg.complete && powerPelletImg.naturalWidth) {
          ctx.drawImage(powerPelletImg, cx - size / 2, cy - size / 2, size, size);
        } else {
          ctx.fillStyle = "#ffff00";
          ctx.beginPath();
          ctx.arc(cx, cy, TILE_SIZE * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // 🔹 Draw syringe (level 4) if active
  if (syringeActive) {
    const cx = (syringeCol + 0.5) * TILE_SIZE;
    const cy = (syringeRow + 0.5) * TILE_SIZE;
    const size = TILE_SIZE * 1.1;

    if (syringeImg.complete && syringeImg.naturalWidth) {
      ctx.drawImage(syringeImg, cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.fillStyle = "#00ff88";
      ctx.fillRect(cx - size / 4, cy - size / 2, size / 2, size);
    }
  }
}

function drawPacman() {
  const px = pacman.x * TILE_SIZE;
  const py = pacman.y * TILE_SIZE;
  const frames = pacmanSprites[pacman.facing] || pacmanSprites.right;
  const img = frames[pacman.animFrame];
  const size = TILE_SIZE * 0.9;

  if (img.complete && img.naturalWidth) {
    ctx.drawImage(img, px - size / 2, py - size / 2, size, size);
  } else {
    ctx.fillStyle = "yellow";
    ctx.beginPath();
    ctx.arc(px, py, TILE_SIZE * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGhosts() {
  ghosts.forEach(g => {
    const gx = g.x * TILE_SIZE;
    const gy = g.y * TILE_SIZE;
    let img;
    if (g.frightened && !g.eaten) {
      img = ghostSprites.frightened;
    } else {
      img = ghostSprites[g.type];
    }
    const size = TILE_SIZE * 0.9;
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, gx - size / 2, gy - size / 2, size, size);
    } else {
      ctx.fillStyle = g.frightened ? "#0000ff" : "#ff0000";
      ctx.beginPath();
      ctx.arc(gx, gy, TILE_SIZE * 0.4, Math.PI, 0);
      ctx.lineTo(gx + TILE_SIZE * 0.4, gy + TILE_SIZE * 0.4);
      ctx.lineTo(gx - TILE_SIZE * 0.4, gy + TILE_SIZE * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  });
}

function drawHUD() {
  const scoreEl = document.getElementById("scoreDisplay");
  const livesEl = document.getElementById("livesDisplay");
  if (scoreEl) scoreEl.textContent = score;
  if (livesEl) livesEl.textContent = lives;

  if (gameState === "gameover" || gameState === "win") {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);
    ctx.fillStyle = "#ffee00";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    const text = gameState === "gameover"
      ? "GAME OVER - Press R"
      : "YOU WIN!";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  } else if (gameState === "dead") {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);
    ctx.fillStyle = "#ffee00";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.fillText("You Died - Press Space", canvas.width / 2, canvas.height / 2);
  } else if (gameState === "paused") {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, canvas.height / 2 - 60, canvas.width, 120);
    ctx.fillStyle = "#ffee00";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Paused", canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = "20px Arial";
    ctx.fillText("Press P to Resume or H for Home", canvas.width / 2, canvas.height / 2 + 25);
  } else if (gameState === "intro") {
    const lines = getLevelIntroLines();

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, canvas.height / 2 - 90, canvas.width, 180);

    ctx.fillStyle = "#ffee00";
    ctx.textAlign = "center";

    ctx.font = "30px Arial";
    ctx.fillText(lines[0], canvas.width / 2, canvas.height / 2 - 40);

    ctx.font = "18px Arial";
    for (let i = 1; i < lines.length; i++) {
      ctx.fillText(lines[i], canvas.width / 2, canvas.height / 2 - 40 + i * 24);
    }
  }
}

// ----- Main loop -----
let lastTime = performance.now();
function gameLoop(timestamp) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  if (gameState === "playing") {
    updatePacman(dt);
    updateGhosts(dt);
  }

  drawMaze();
  drawPacman();
  drawGhosts();
  drawHUD();

  requestAnimationFrame(gameLoop);
}

// Start the game
restartGame();
requestAnimationFrame(gameLoop);
