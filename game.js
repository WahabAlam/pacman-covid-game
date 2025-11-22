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

// ---- Level gate state (NEW) ----
let gateBlocked = false;

// ----- Level gate: don't allow skipping levels -----
(function enforceLevelProgression() {
  const currentLevel = Number(window.LEVEL_CONFIG.levelNumber || 1);
  const highestCompleted = Number(localStorage.getItem("levelCompleted") || 0);

  console.log("Gate check:", { currentLevel, highestCompleted });

  // To play level N (>1), you must have completed at least level N-1
  if (currentLevel > 1 && highestCompleted < currentLevel - 1) {
    // Instead of instantly redirecting, mark this level as blocked.
    gateBlocked = true;
  }
})();

// Logical tile size
const TILE_SIZE = 24;

// ----- Classic-style Maze -----
// # = wall, . = pellet, o = power pellet, ' ' = empty path
const MAZE_TEMPLATE = [
  "############################", // 0
  "#..........................#", // 1  <-- opened middle, full top path
  "#.##########.##.##########.#", // 2
  "#......##....##....##......#", // 3
  "###.##.##.########.##.##.###", // 4
  "#o..##................##..o#", // 5
  "#.####.##.##    ##.##.####.#", // 6  // virus room row stays the same
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
  "#..........................#", // 17  <-- full bottom path, Pac-Man spawn row
  "############################"  // 18
];

const ROWS = MAZE_TEMPLATE.length;
const COLS = MAZE_TEMPLATE[0].length;
canvas.width = COLS * TILE_SIZE;
canvas.height = ROWS * TILE_SIZE;

// ----- Maze grid (mutable pellets) -----
const maze = MAZE_TEMPLATE.map(row => row.split(""));

// ----- Tile helpers -----

// Virus room: row 6, columns 12–15 (1×4 indent)
function isGhostHouseTile(row, col) {
  return row === 6 && col >= 12 && col <= 15;
}

function isWall(row, col) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
  // treat the virus room tiles as blocked for normal movement
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
sndChomp.loop = true;
let chompPlaying = false;

// ----- Meme popup (optional) -----
const memeFiles = [];
let memeImage = null;
let memeTimer = 0;

function triggerMeme() {
  if (memeFiles.length === 0) return;
  const path = memeFiles[Math.floor(Math.random() * memeFiles.length)];
  memeImage = loadImage(path);
  memeTimer = 3;
}

// ----- Game State -----
// gameState can be: "intro", "playing", "dead", "gameover", "win", "paused", "gateBlocked"
let score = 0;
let lives = 3;
let gameState = "playing";
if (gateBlocked) {
  gameState = "gateBlocked";
}
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

function remainingPowerPellets() {
  let count = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (maze[r][c] === "o") count++;
    }
  }
  return count;
}

function spawnSyringe() {
  const currentLevel = window.LEVEL_CONFIG.levelNumber || 1;
  if (currentLevel !== SYRINGE_LEVEL) return;

  const candidates = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isWalkable(r, c)) continue;
      if (isGhostHouseTile(r, c)) continue;
      candidates.push({ r, c });
    }
  }
  if (candidates.length === 0) return;

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  syringeRow = pick.r;
  syringeCol = pick.c;
  syringeActive = true;
}

// ----- Level intro text helper -----
function getLevelIntroLines() {
  const lvl = window.LEVEL_CONFIG.levelNumber || 1;

  if (lvl === SYRINGE_LEVEL) {
    return [
      `Level ${lvl} – Final Dose`,
      "1) Eat ALL power pellets (big pills).",
      "2) A syringe will appear somewhere in the maze.",
      "3) Grab the syringe to win the level.",
      "Press Space / Enter / P to start"
    ];
  }

  return [
    `Level ${lvl}`,
    "Use the arrow keys to move.",
    "Eat all the pellets to clear the level.",
    "Avoid the viruses unless powered up.",
    "Press Space / Enter / P to start"
  ];
}

// ----- Virus room (ghost house) geometry -----
const GHOST_DOOR_X = 13.5; // col 13
const GHOST_DOOR_Y = 5.5;  // row 5

// Home tiles inside the 1×4 indent (row 6)
const HOME_TILES = [
  { x: 12.5, y: 6.5 },
  { x: 13.5, y: 6.5 },
  { x: 14.5, y: 6.5 },
  { x: 15.5, y: 6.5 }
];

// Helper: create virus/ghost
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

// ----- Ghost setup -----
const ALL_GHOSTS = [
  makeGhost("red",    HOME_TILES[0].x, HOME_TILES[0].y, HOME_TILES[0].x, HOME_TILES[0].y),
  makeGhost("pink",   HOME_TILES[1].x, HOME_TILES[1].y, HOME_TILES[1].x, HOME_TILES[1].y),
  makeGhost("teal",   HOME_TILES[2].x, HOME_TILES[2].y, HOME_TILES[2].x, HOME_TILES[2].y),
  makeGhost("orange", HOME_TILES[3].x, HOME_TILES[3].y, HOME_TILES[3].x, HOME_TILES[3].y)
];

// Base release delays in SECONDS
const GHOST_RELEASE_DELAYS_BASE = [0, 2, 4, 6];

const ghosts = ALL_GHOSTS.slice(0, window.LEVEL_CONFIG.ghostsEnabled);
const ghostReleaseDelays = GHOST_RELEASE_DELAYS_BASE.slice(0, ghosts.length);

// Initial release state
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

// ----- Input -----
window.addEventListener("keydown", e => {
  // 🔹 If this level is locked, any confirm key sends back to home.
  if (gameState === "gateBlocked") {
    if (e.key === " " || e.key === "Enter" || e.key === "Escape") {
      window.location.href = WIX_HOME_URL || "home-level-select.html";
    }
    return;
  }

  // Intro popup (all levels)
  if (
    gameState === "intro" &&
    (e.key === " " || e.key === "Enter" || e.key === "p" || e.key === "P")
  ) {
    gameState = "playing";
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

// Also allow mouse click to confirm on blocked level.
canvas.addEventListener("click", () => {
  if (gameState === "gateBlocked") {
    window.location.href = WIX_HOME_URL || "home-level-select.html";
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

  // Tunnel wrap horizontally
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
      triggerMeme();

      // Level 4: when the LAST power pellet is eaten, spawn syringe
      const currentLevel = window.LEVEL_CONFIG.levelNumber || 1;
      if (currentLevel === SYRINGE_LEVEL &&
          remainingPowerPellets() === 0 &&
          !syringeActive) {
        spawnSyringe();
      }
    }

    checkWin();
  }

  if (tile !== "." && chompPlaying) {
    sndChomp.pause();
    sndChomp.currentTime = 0;
    chompPlaying = false;
  }

  // Level 4: check if Pac-Man picks up the syringe
  const currentLevel = window.LEVEL_CONFIG.levelNumber || 1;
  if (currentLevel === SYRINGE_LEVEL &&
      syringeActive &&
      row === syringeRow &&
      col === syringeCol) {

    syringeActive = false;
    score += 200; // tweak if you like
    sndEatFruit.currentTime = 0;
    sndEatFruit.play().catch(() => {});
    triggerWin();
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
    // 1) Handle delayed release from the room
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

    // 2) Normal movement / frightened slowdown
    const baseSpeed = g.frightened ? GHOST_SPEED * 0.7 : GHOST_SPEED;
    g.speed = baseSpeed;
    chooseGhostDirection(g);
    moveEntity(g, dt);

    // 3) Collision with Pac-Man
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
  // reset pacman
  pacman.x = 13.5;
  pacman.y = 17.5;
  pacman.dirX = 0;
  pacman.dirY = 0;
  pacman.nextDirX = 0;
  pacman.nextDirY = 0;
  pacman.power = false;
  pacman.powerTimer = 0;

  // reset ghosts to their spawn positions
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

function restartGame() {
  // reset maze pellets
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
  score = 0;
  lives = 3;
  pacman.power = false;
  pacman.powerTimer = 0;

  resetSyringe();
  resetAfterDeath();

  // ALL levels: start in intro, except blocked levels stay blocked
  if (gateBlocked) {
    gameState = "gateBlocked";
  } else {
    gameState = "intro";
  }
}

function triggerWin() {
  gameState = "win";

  // Stop sounds so nothing keeps playing in the background
  sndChomp.pause();  sndChomp.currentTime = 0;
  sndDeath.pause();  sndDeath.currentTime = 0;
  sndEatFruit.pause(); sndEatFruit.currentTime = 0;
  sndEatGhost.pause(); sndEatGhost.currentTime = 0;

  const currentLevel = window.LEVEL_CONFIG.levelNumber || 1;
  const prevCompleted = Number(localStorage.getItem("levelCompleted") || 0);
  if (currentLevel > prevCompleted) {
    localStorage.setItem("levelCompleted", currentLevel);
  }

  // Map levels to Wix info pages
  const wixInfoUrls = {
    1: "https://shadasalah29.wixsite.com/covid19-interactive/about-1",
    2: "https://shadasalah29.wixsite.com/covid19-interactive/level-2",
    3: "https://shadasalah29.wixsite.com/covid19-interactive/level-3",
    4: "https://shadasalah29.wixsite.com/covid19-interactive/level-4"
  };

  const target = wixInfoUrls[currentLevel];

  if (target) {
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = target;
      } else {
        window.location.href = target;
      }
    } catch (e) {
      window.location.href = target;
    }
    return;
  }

  // Fallback if no Wix URL defined
  window.location.href = `info${currentLevel}.html`;
}

function checkWin() {
  const currentLevel = window.LEVEL_CONFIG.levelNumber || 1;

  // Level 4: pellets no longer cause a win; syringe does instead.
  if (currentLevel === SYRINGE_LEVEL) {
    return;
  }

  // Other levels keep the classic "eat all pellets" rule.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (maze[r][c] === "." || maze[r][c] === "o") {
        return;
      }
    }
  }

  triggerWin();
}

// ----- Drawing -----
function drawMaze() {
  // Black background everywhere
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 1) Draw Pac-Man style walls
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

  // 1b) Tight inner rectangle (double wall)
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

  // 2) Draw pellets and power pills
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tileCurrent = maze[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;

      // normal pellets – brighter & larger with a glow
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
      }

      // power pellets (pills)
      else if (tileCurrent === "o") {
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
}

// Draw syringe (level 4)
function drawSyringe() {
  if (!syringeActive) return;

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

  const currentLevel = window.LEVEL_CONFIG.levelNumber || 1;

  if (gameState === "gateBlocked") {
    // Popup when player tries to access a locked level
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, canvas.height / 2 - 80, canvas.width, 160);
    ctx.fillStyle = "#fff";
    ctx.font = "28px Arial";
    ctx.textAlign = "center";
    ctx.fillText("You can’t skip levels!", canvas.width / 2, canvas.height / 2 - 25);
    ctx.font = "18px Arial";
    ctx.fillText(
      `Please complete Level ${currentLevel - 1} first.`,
      canvas.width / 2,
      canvas.height / 2 + 5
    );
    ctx.fillText(
      "Press Space / Enter or click to go back.",
      canvas.width / 2,
      canvas.height / 2 + 35
    );
  } else if (gameState === "gameover" || gameState === "win") {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);
    ctx.fillStyle = "#fff";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    const text = gameState === "gameover"
      ? "GAME OVER - Press R"
      : "YOU WIN! - Press R";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  } else if (gameState === "dead") {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);
    ctx.fillStyle = "#fff";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.fillText("You Died - Press Space", canvas.width / 2, canvas.height / 2);
  } else if (gameState === "paused") {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, canvas.height / 2 - 60, canvas.width, 120);
    ctx.fillStyle = "#fff";
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Paused", canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = "20px Arial";
    ctx.fillText("Press P to Resume or H for Home", canvas.width / 2, canvas.height / 2 + 25);
  } else if (gameState === "intro") {
    // Generic level intro popup (all levels)
    const lines = getLevelIntroLines();

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, canvas.height / 2 - 90, canvas.width, 180);

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";

    ctx.font = "30px Arial";
    ctx.fillText(lines[0], canvas.width / 2, canvas.height / 2 - 40);

    ctx.font = "18px Arial";
    for (let i = 1; i < lines.length; i++) {
      ctx.fillText(lines[i], canvas.width / 2, canvas.height / 2 - 40 + i * 24);
    }
  }
}

function drawMemeOverlay() {
  if (memeTimer <= 0 || !memeImage || !memeImage.complete || !memeImage.naturalWidth) return;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const maxW = canvas.width * 0.6;
  const maxH = canvas.height * 0.6;
  let w = memeImage.width;
  let h = memeImage.height;
  const s = Math.min(maxW / w, maxH / h, 1);
  w *= s; h *= s;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;
  ctx.drawImage(memeImage, x, y, w, h);
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

  if (memeTimer > 0) {
    memeTimer -= dt;
    if (memeTimer < 0) memeTimer = 0;
  }

  drawMaze();
  drawSyringe();
  drawPacman();
  drawGhosts();
  drawHUD();
  if (gameState === "playing") {
    drawMemeOverlay();
  }

  requestAnimationFrame(gameLoop);
}

// Start the game
restartGame();   // sets gameState = "intro" or "gateBlocked"
requestAnimationFrame(gameLoop);
