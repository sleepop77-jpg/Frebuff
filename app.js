"use strict";

/*
  PULSEWING
  Phase 1: deterministic arcade game engine.

  Important:
  The game is intentionally written without external dependencies.

  Later AI systems will use:
      window.PulseWingAI.getState()
      window.PulseWingAI.step(action)
      window.PulseWingAI.reset(seed)

  This means the AI will play the exact same game as the human.
*/

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });

const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const runScoreEl = document.getElementById("runScore");
const comboEl = document.getElementById("combo");
const speedValueEl = document.getElementById("speedValue");
const gateCountEl = document.getElementById("gateCount");
const shardCountEl = document.getElementById("shardCount");
const shieldIndicator = document.getElementById("shieldIndicator");

const startScreen = document.getElementById("startScreen");
const gameOver = document.getElementById("gameOver");
const tapHint = document.getElementById("tapHint");
const pauseIndicator = document.getElementById("pauseIndicator");
const flash = document.getElementById("flash");

const startButton = document.getElementById("startButton");
const retryButton = document.getElementById("retryButton");
const pauseButton = document.getElementById("pauseButton");
const restartButton = document.getElementById("restartButton");
const shareButton = document.getElementById("shareButton");

const finalScore = document.getElementById("finalScore");
const finalGates = document.getElementById("finalGates");
const finalShards = document.getElementById("finalShards");
const finalCombo = document.getElementById("finalCombo");
const finalBest = document.getElementById("finalBest");

let DPR = 1;
let width = 0;
let height = 0;

let animationFrame = 0;
let lastTime = 0;

const STORAGE_KEY = "pulsewing-best-v1";

const CONFIG = {
  gravity: 1450,
  flapVelocity: -440,
  playerX: 0.28,
  playerRadius: 13,

  baseSpeed: 185,
  maxSpeed: 390,

  gateWidth: 58,
  startingGap: 168,
  minimumGap: 105,

  spawnDistance: 330,

  shardRadius: 5,

  shieldDuration: 6,

  fixedStep: 1 / 120
};

const game = {
  state: "menu",

  time: 0,
  score: 0,
  gates: 0,
  shards: 0,

  combo: 1,
  comboTimer: 0,

  speed: CONFIG.baseSpeed,

  shield: 0,

  seed: 182736,
  difficulty: 0,

  cameraX: 0,

  player: {
    x: 0,
    y: 0,
    vy: 0,
    rotation: 0,
    pulse: 0
  },

  gates: [],
  particles: [],
  stars: [],

  nextGateX: 0
};

let bestScore = Number(localStorage.getItem(STORAGE_KEY) || 0);
bestScoreEl.textContent = bestScore;


/* -------------------------------------------------------
   Deterministic random generator
------------------------------------------------------- */

function random() {
  game.seed = (game.seed * 1664525 + 1013904223) >>> 0;
  return game.seed / 4294967296;
}

function randomRange(min, max) {
  return min + random() * (max - min);
}


/* -------------------------------------------------------
   Canvas
------------------------------------------------------- */

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();

  DPR = Math.min(window.devicePixelRatio || 1, 2);

  width = Math.max(320, rect.width);
  height = Math.max(420, rect.height);

  canvas.width = Math.floor(width * DPR);
  canvas.height = Math.floor(height * DPR);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  createStars();

  if (game.state === "menu") {
    resetWorld(false);
  }
}

window.addEventListener("resize", resizeCanvas);


/* -------------------------------------------------------
   Background stars
------------------------------------------------------- */

function createStars() {
  game.stars.length = 0;

  const count = Math.floor((width * height) / 9000);

  for (let i = 0; i < count; i++) {
    game.stars.push({
      x: randomRange(0, width),
      y: randomRange(0, height),
      size: randomRange(0.5, 1.8),
      depth: randomRange(0.2, 1)
    });
  }
}


/* -------------------------------------------------------
   Reset
------------------------------------------------------- */

function resetWorld(starting = true) {
  game.time = 0;
  game.score = 0;
  game.gates = 0;
  game.shards = 0;

  game.combo = 1;
  game.comboTimer = 0;

  game.speed = CONFIG.baseSpeed;
  game.shield = 0;

  game.difficulty = 0;

  game.gates.length = 0;
  game.particles.length = 0;

  game.cameraX = 0;

  game.player.x = width * CONFIG.playerX;
  game.player.y = height * 0.48;
  game.player.vy = 0;
  game.player.rotation = 0;
  game.player.pulse = 0;

  game.nextGateX = width + 180;

  /*
    Generate enough gates ahead of the player.
  */
  while (game.nextGateX < width + 1500) {
    spawnGate();
  }

  updateHUD();

  if (starting) {
    tapHint.classList.remove("hidden");
  }
}


/* -------------------------------------------------------
   Gate generation
------------------------------------------------------- */

function spawnGate() {
  const difficulty = Math.min(1, game.difficulty);

  const gap = Math.max(
    CONFIG.minimumGap,
    CONFIG.startingGap - difficulty * 55
  );

  const margin = 60 + gap / 2;

  const center = randomRange(
    margin,
    height - margin
  );

  const typeRoll = random();

  let type = "normal";

  if (game.gates.length > 5 && typeRoll < 0.24) {
    type = "moving";
  } else if (game.gates.length > 12 && typeRoll < 0.38) {
    type = "split";
  }

  const gate = {
    x: game.nextGateX,
    width: CONFIG.gateWidth,
    center,
    gap,

    type,

    phase: randomRange(0, Math.PI * 2),
    amplitude: randomRange(20, 50),

    passed: false,
    shardCollected: false,

    shard: {
      x: game.nextGateX + CONFIG.gateWidth / 2,
      y: center + randomRange(-gap * 0.22, gap * 0.22),
      collected: false
    }
  };

  game.gates.push(gate);

  const spacing = randomRange(225, 340);

  game.nextGateX += spacing;
}


/* -------------------------------------------------------
   Game loop
------------------------------------------------------- */

function loop(timestamp) {
  if (!lastTime) {
    lastTime = timestamp;
  }

  let dt = (timestamp - lastTime) / 1000;

  lastTime = timestamp;

  dt = Math.min(dt, 0.04);

  if (game.state === "playing") {
    update(dt);
  }

  render();

  animationFrame = requestAnimationFrame(loop);
}


/* -------------------------------------------------------
   Update
------------------------------------------------------- */

function update(dt) {
  game.time += dt;

  game.difficulty = Math.min(
    1,
    game.time / 80
  );

  game.speed = Math.min(
    CONFIG.maxSpeed,
    CONFIG.baseSpeed + game.time * 3.4
  );

  game.cameraX += game.speed * dt;

  /*
    Player physics.
  */
  game.player.vy += CONFIG.gravity * dt;
  game.player.y += game.player.vy * dt;

  game.player.rotation =
    Math.max(
      -0.55,
      Math.min(
        1.1,
        game.player.vy / 650
      )
    );

  game.player.pulse = Math.max(
    0,
    game.player.pulse - dt * 5
  );

  /*
    Shield timer.
  */
  if (game.shield > 0) {
    game.shield -= dt;

    if (game.shield <= 0) {
      game.shield = 0;
    }
  }

  /*
    Move gates.
  */
  for (const gate of game.gates) {
    gate.x -= game.speed * dt;

    if (gate.type === "moving") {
      gate.currentCenter =
        gate.center +
        Math.sin(
          game.time * 1.8 + gate.phase
        ) *
        gate.amplitude;
    } else {
      gate.currentCenter = gate.center;
    }

    gate.shard.x =
      gate.x + gate.width / 2;

    gate.shard.y =
      gate.currentCenter +
      Math.sin(
        game.time * 3 + gate.phase
      ) *
      Math.min(24, gate.gap * 0.18);

    checkGate(gate);
    checkShard(gate);
  }

  /*
    Remove old gates.
  */
  while (
    game.gates.length &&
    game.gates[0].x < -100
  ) {
    game.gates.shift();
  }

  /*
    Keep generating.
  */
  while (
    game.nextGateX <
    game.cameraX + width + 1000
  ) {
    spawnGate();
  }

  /*
    Combo decays if player doesn't
    collect anything.
  */
  if (game.comboTimer > 0) {
    game.comboTimer -= dt;
  } else {
    game.combo = Math.max(
      1,
      game.combo - dt * 0.4
    );
  }

  /*
    World bounds.
  */
  if (
    game.player.y < -30 ||
    game.player.y > height + 30
  ) {
    crash();
  }

  updateParticles(dt);
  updateHUD();
}


/* -------------------------------------------------------
   Gate collision
------------------------------------------------------- */

function checkGate(gate) {
  const px = game.player.x;
  const py = game.player.y;
  const r = CONFIG.playerRadius;

  const gateRight =
    gate.x + gate.width;

  /*
    Only test collision while
    player overlaps gate horizontally.
  */
  if (
    px + r < gate.x ||
    px - r > gateRight
  ) {
    /*
      Count successful pass.
    */
    if (
      !gate.passed &&
      px > gateRight
    ) {
      gate.passed = true;
      passGate(gate);
    }

    return;
  }

  const center = gate.currentCenter;
  const halfGap = gate.gap / 2;

  const topEdge = center - halfGap;
  const bottomEdge = center + halfGap;

  const touchingTop =
    py - r < topEdge;

  const touchingBottom =
    py + r > bottomEdge;

  if (touchingTop || touchingBottom) {
    if (game.shield > 0) {
      game.shield = 0;
      createBurst(
        game.player.x,
        game.player.y,
        18
      );
      flashScreen();
      gate.passed = true;
    } else {
      crash();
    }
  }
}


function passGate(gate) {
  game.gates++;

  game.comboTimer = 2.2;
  game.combo = Math.min(
    12,
    game.combo + 0.65
  );

  const earned =
    Math.round(game.combo);

  game.score += earned;

  /*
    Every successful gate has a
    small chance of dropping a shield.
  */
  if (
    game.gates > 4 &&
    random() < 0.075
  ) {
    game.shield = CONFIG.shieldDuration;
  }

  createBurst(
    gate.x + gate.width,
    gate.currentCenter,
    9
  );
}


/* -------------------------------------------------------
   Shards
------------------------------------------------------- */

function checkShard(gate) {
  if (gate.shard.collected) {
    return;
  }

  const dx =
    game.player.x - gate.shard.x;

  const dy =
    game.player.y - gate.shard.y;

  const distance =
    Math.sqrt(dx * dx + dy * dy);

  if (distance < 22) {
    gate.shard.collected = true;

    game.shards++;

    game.comboTimer = 2.5;

    game.combo = Math.min(
      12,
      game.combo + 0.25
    );

    game.score += 3;

    createBurst(
      gate.shard.x,
      gate.shard.y,
      12
    );
  }
}


/* -------------------------------------------------------
   Pulse
------------------------------------------------------- */

function pulse() {
  if (game.state === "menu") {
    startGame();
    return;
  }

  if (game.state === "gameover") {
    startGame();
    return;
  }

  if (game.state !== "playing") {
    return;
  }

  game.player.vy = CONFIG.flapVelocity;
  game.player.pulse = 1;

  createBurst(
    game.player.x - 9,
    game.player.y + 5,
    4
  );
}


/* -------------------------------------------------------
   Crash
------------------------------------------------------- */

function crash() {
  if (game.state !== "playing") {
    return;
  }

  game.state = "gameover";

  createBurst(
    game.player.x,
    game.player.y,
    30
  );

  flashScreen();

  const roundedScore =
    Math.floor(game.score);

  if (roundedScore > bestScore) {
    bestScore = roundedScore;

    localStorage.setItem(
      STORAGE_KEY,
      String(bestScore)
    );
  }

  finalScore.textContent = roundedScore;
  finalGates.textContent = game.gates;
  finalShards.textContent = game.shards;
  finalCombo.textContent =
    "×" + Math.floor(game.combo);
  finalBest.textContent = bestScore;

  bestScoreEl.textContent = bestScore;

  gameOver.classList.remove("hidden");
  tapHint.classList.add("hidden");

  updateHUD();
}


/* -------------------------------------------------------
   Start / restart
------------------------------------------------------- */

function startGame() {
  gameOver.classList.add("hidden");
  startScreen.classList.add("hidden");

  game.state = "playing";

  resetWorld(true);

  tapHint.classList.remove("hidden");

  setTimeout(() => {
    tapHint.classList.add("hidden");
  }, 1600);

  /*
    Initial pulse makes the first
    interaction feel responsive.
  */
  pulse();
}


function restartGame() {
  gameOver.classList.add("hidden");
  startScreen.classList.add("hidden");

  game.state = "playing";

  resetWorld(true);

  pulse();
}


/* -------------------------------------------------------
   Pause
------------------------------------------------------- */

function togglePause() {
  if (game.state === "playing") {
    game.state = "paused";

    pauseIndicator.classList.remove("hidden");
    pauseButton.textContent = "RESUME";
  } else if (game.state === "paused") {
    game.state = "playing";

    pauseIndicator.classList.add("hidden");
    pauseButton.textContent = "PAUSE";
  }
}


/* -------------------------------------------------------
   HUD
------------------------------------------------------- */

function updateHUD() {
  scoreEl.textContent =
    Math.floor(game.score);

  runScoreEl.textContent =
    Math.floor(game.score);

  comboEl.textContent =
    "COMBO ×" + Math.max(
      1,
      Math.floor(game.combo)
    );

  speedValueEl.textContent =
    (game.speed / CONFIG.baseSpeed).toFixed(1) + "×";

  gateCountEl.textContent =
    game.gates + " GATES";

  shardCountEl.textContent =
    game.shards + " SHARDS";

  shieldIndicator.classList.toggle(
    "active",
    game.shield > 0
  );
}


/* -------------------------------------------------------
   Particles
------------------------------------------------------- */

function createBurst(x, y, amount) {
  for (let i = 0; i < amount; i++) {
    const angle =
      random() * Math.PI * 2;

    const speed =
      randomRange(30, 150);

    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,

      life: randomRange(0.25, 0.65),
      maxLife: 0.65,

      size: randomRange(1, 3)
    });
  }
}


function updateParticles(dt) {
  for (const particle of game.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;

    particle.vy += 80 * dt;

    particle.life -= dt;
  }

  game.particles =
    game.particles.filter(
      particle => particle.life > 0
    );
}


/* -------------------------------------------------------
   Rendering
------------------------------------------------------- */

function render() {
  ctx.fillStyle = "#07111f";
  ctx.fillRect(0, 0, width, height);

  drawBackground();
  drawGates();
  drawParticles();
  drawPlayer();

  if (game.state === "gameover") {
    drawDeathOverlay();
  }
}


/* -------------------------------------------------------
   Background
------------------------------------------------------- */

function drawBackground() {
  /*
    Gradient sky.
  */
  const gradient =
    ctx.createLinearGradient(
      0,
      0,
      0,
      height
    );

  gradient.addColorStop(
    0,
    "#06101e"
  );

  gradient.addColorStop(
    0.55,
    "#091a2c"
  );

  gradient.addColorStop(
    1,
    "#050c16"
  );

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  /*
    Distant horizontal energy lines.
  */
  ctx.globalAlpha = 0.1;

  for (let y = 40; y < height; y += 48) {
    const offset =
      (game.cameraX * 0.08) % 70;

    ctx.strokeStyle = "#62e7ff";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(-offset, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  /*
    Stars.
  */
  ctx.globalAlpha = 0.55;

  for (const star of game.stars) {
    const x =
      (star.x -
        game.cameraX *
          star.depth *
          0.08) %
      width;

    const wrapped =
      x < 0 ? x + width : x;

    ctx.fillStyle = "#9edff0";

    ctx.beginPath();
    ctx.arc(
      wrapped,
      star.y,
      star.size,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  ctx.globalAlpha = 1;

  /*
    Lower atmospheric glow.
  */
  const glow =
    ctx.createRadialGradient(
      width * 0.5,
      height,
      0,
      width * 0.5,
      height,
      height * 0.8
    );

  glow.addColorStop(
    0,
    "rgba(98,231,255,0.08)"
  );

  glow.addColorStop(
    1,
    "rgba(98,231,255,0)"
  );

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}


/* -------------------------------------------------------
   Gates
------------------------------------------------------- */

function drawGates() {
  for (const gate of game.gates) {
    const x = gate.x;
    const w = gate.width;

    const center =
      gate.currentCenter;

    const gap = gate.gap;

    const topHeight =
      center - gap / 2;

    const bottomY =
      center + gap / 2;

    drawGateSegment(
      x,
      0,
      w,
      topHeight
    );

    drawGateSegment(
      x,
      bottomY,
      w,
      height - bottomY
    );

    /*
      Gap markers.
    */
    ctx.strokeStyle =
      "rgba(98,231,255,0.16)";

    ctx.lineWidth = 1;

    ctx.setLineDash([3, 7]);

    ctx.beginPath();
    ctx.moveTo(x, center - gap / 2);
    ctx.lineTo(x + w, center - gap / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, center + gap / 2);
    ctx.lineTo(x + w, center + gap / 2);
    ctx.stroke();

    ctx.setLineDash([]);

    /*
      Shard.
    */
    if (!gate.shard.collected) {
      drawShard(
        gate.shard.x,
        gate.shard.y
      );
    }
  }
}


function drawGateSegment(x, y, w, h) {
  if (h <= 0) {
    return;
  }

  const gradient =
    ctx.createLinearGradient(
      x,
      0,
      x + w,
      0
    );

  gradient.addColorStop(
    0,
    "#172c43"
  );

  gradient.addColorStop(
    0.45,
    "#244a67"
  );

  gradient.addColorStop(
    0.5,
    "#62e7ff"
  );

  gradient.addColorStop(
    0.55,
    "#244a67"
  );

  gradient.addColorStop(
    1,
    "#172c43"
  );

  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  /*
    Energy edge.
  */
  ctx.fillStyle =
    "rgba(184,247,255,0.7)";

  ctx.fillRect(
    x + 1,
    y,
    2,
    h
  );

  ctx.fillRect(
    x + w - 3,
    y,
    2,
    h
  );
}


function drawShard(x, y) {
  const pulse =
    1 +
    Math.sin(game.time * 7) * 0.14;

  ctx.save();

  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);

  ctx.shadowBlur = 14;
  ctx.shadowColor = "#62e7ff";

  ctx.fillStyle = "#62e7ff";

  ctx.fillRect(
    -5 * pulse,
    -5 * pulse,
    10 * pulse,
    10 * pulse
  );

  ctx.fillStyle = "#d9fbff";

  ctx.fillRect(
    -2 * pulse,
    -2 * pulse,
    4 * pulse,
    4 * pulse
  );

  ctx.restore();
}


/* -------------------------------------------------------
   Player
------------------------------------------------------- */

function drawPlayer() {
  const p = game.player;

  ctx.save();

  ctx.translate(
    p.x,
    p.y
  );

  ctx.rotate(p.rotation);

  /*
    Shield.
  */
  if (game.shield > 0) {
    const pulse =
      1 +
      Math.sin(game.time * 8) * 0.08;

    ctx.strokeStyle =
      "rgba(98,231,255,0.65)";

    ctx.lineWidth = 2;

    ctx.shadowBlur = 18;
    ctx.shadowColor = "#62e7ff";

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      23 * pulse,
      0,
      Math.PI * 2
    );

    ctx.stroke();
  }

  /*
    Trail.
  */
  const trailLength =
    15 +
    p.pulse * 20;

  const trail =
    ctx.createLinearGradient(
      -trailLength,
      0,
      8,
      0
    );

  trail.addColorStop(
    0,
    "rgba(98,231,255,0)"
  );

  trail.addColorStop(
    1,
    "rgba(98,231,255,0.55)"
  );

  ctx.fillStyle = trail;

  ctx.beginPath();
  ctx.moveTo(-trailLength, 0);
  ctx.lineTo(5, -5);
  ctx.lineTo(5, 5);
  ctx.closePath();
  ctx.fill();

  /*
    Main pulse body.
  */
  ctx.shadowBlur = 20;
  ctx.shadowColor = "#62e7ff";

  ctx.fillStyle = "#62e7ff";

  ctx.beginPath();

  ctx.moveTo(16, 0);
  ctx.lineTo(-8, -11);
  ctx.lineTo(-13, 0);
  ctx.lineTo(-8, 11);
  ctx.closePath();

  ctx.fill();

  /*
    Core.
  */
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#effcff";

  ctx.beginPath();
  ctx.arc(
    1,
    0,
    4,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}


/* -------------------------------------------------------
   Particles
------------------------------------------------------- */

function drawParticles() {
  for (const particle of game.particles) {
    const alpha =
      particle.life /
      particle.maxLife;

    ctx.globalAlpha = alpha;

    ctx.fillStyle = "#62e7ff";

    ctx.fillRect(
      particle.x,
      particle.y,
      particle.size,
      particle.size
    );
  }

  ctx.globalAlpha = 1;
}


/* -------------------------------------------------------
   Death overlay
------------------------------------------------------- */

function drawDeathOverlay() {
  ctx.fillStyle =
    "rgba(255,60,110,0.04)";

  ctx.fillRect(
    0,
    0,
    width,
    height
  );
}


/* -------------------------------------------------------
   Flash
------------------------------------------------------- */

function flashScreen() {
  flash.classList.remove("active");

  /*
    Force reflow so the animation
    can run again.
  */
  void flash.offsetWidth;

  flash.classList.add("active");
}


/* -------------------------------------------------------
   Input
------------------------------------------------------- */

canvas.addEventListener(
  "pointerdown",
  event => {
    event.preventDefault();
    pulse();
  },
  { passive: false }
);

window.addEventListener(
  "keydown",
  event => {
    if (
      event.code === "Space" ||
      event.code === "ArrowUp"
    ) {
      event.preventDefault();
      pulse();
    }

    if (
      event.code === "KeyP" ||
      event.code === "Escape"
    ) {
      togglePause();
    }
  }
);

startButton.addEventListener(
  "click",
  startGame
);

retryButton.addEventListener(
  "click",
  restartGame
);

restartButton.addEventListener(
  "click",
  restartGame
);

pauseButton.addEventListener(
  "click",
  togglePause
);

shareButton.addEventListener(
  "click",
  async () => {
    const text =
      `I scored ${Math.floor(game.score)} ` +
      `in PULSEWING with ${game.gates} gates cleared.`;

    try {
      await navigator.clipboard.writeText(text);

      shareButton.textContent =
        "COPIED";

      setTimeout(() => {
        shareButton.textContent =
          "COPY RUN";
      }, 1200);
    } catch {
      shareButton.textContent =
        "COPY FAILED";
    }
  }
);


/* -------------------------------------------------------
   AI-ready browser API
-------------------------------------------------------

   This is NOT the AI yet.

   It is the foundation that allows
   the future evolutionary agent to
   directly operate the game.

   Observation format:
     player position
     velocity
     nearest gate
     gate gap
     distance
     speed
     score
     etc.

   Actions:
     0 = nothing
     1 = pulse
------------------------------------------------------- */

window.PulseWingAI = {

  version: "1.0",

  getState() {
    const nearest =
      game.gates.find(
        gate =>
          gate.x + gate.width >
          game.player.x - 20
      );

    return {
      version: this.version,

      gameState: game.state,

      player: {
        x: game.player.x,
        y: game.player.y,
        vy: game.player.vy,
        rotation: game.player.rotation
      },

      nearestGate: nearest
        ? {
            x: nearest.x,
            width: nearest.width,
            center: nearest.currentCenter,
            gap: nearest.gap,
            distance:
              nearest.x -
              game.player.x,
            type: nearest.type
          }
        : null,

      score: game.score,
      gates: game.gates,
      shards: game.shards,
      combo: game.combo,

      speed: game.speed,

      shield: game.shield,

      time: game.time,

      difficulty: game.difficulty
    };
  },

  step(action = 0) {
    if (game.state !== "playing") {
      return this.getState();
    }

    if (action === 1) {
      pulse();
    }

    return this.getState();
  },

  reset(seed = null) {
    if (seed !== null) {
      game.seed =
        Number(seed) >>> 0;
    }

    game.state = "playing";

    resetWorld(true);

    return this.getState();
  },

  pulse() {
    pulse();
    return this.getState();
  }
};


/* -------------------------------------------------------
   BroadcastChannel AI bridge

   This allows another browser tab or
   local AI process connected through
   a browser bridge to communicate with
   the game without a server.
------------------------------------------------------- */

if ("BroadcastChannel" in window) {
  const aiChannel =
    new BroadcastChannel(
      "pulsewing-ai-v1"
    );

  aiChannel.addEventListener(
    "message",
    event => {
      const message =
        event.data || {};

      if (
        message.type ===
        "pulsewing:get-state"
      ) {
        aiChannel.postMessage({
          type:
            "pulsewing:state",
          requestId:
            message.requestId || null,
          state:
            window.PulseWingAI.getState()
        });
      }

      if (
        message.type ===
        "pulsewing:action"
      ) {
        const state =
          window.PulseWingAI.step(
            Number(message.action) || 0
          );

        aiChannel.postMessage({
          type:
            "pulsewing:state",
          requestId:
            message.requestId || null,
          state
        });
      }

      if (
        message.type ===
        "pulsewing:reset"
      ) {
        const state =
          window.PulseWingAI.reset(
            message.seed ?? null
          );

        aiChannel.postMessage({
          type:
            "pulsewing:state",
          requestId:
            message.requestId || null,
          state
        });
      }
    }
  );
}


/* -------------------------------------------------------
   Initialisation
------------------------------------------------------- */

resizeCanvas();

resetWorld(false);

animationFrame =
  requestAnimationFrame(loop);
 
