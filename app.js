"use strict";

const canvas = document.getElementById("gameCanvas");
if (!canvas) {
  throw new Error("PULSEWING: #gameCanvas not found");
}

const ctx = canvas.getContext("2d", { alpha: false });

const $ = (id) => document.getElementById(id);

const scoreEl = $("score");
const bestScoreEl = $("bestScore");
const runScoreEl = $("runScore");
const comboEl = $("combo");
const speedValueEl = $("speedValue");
const gateCountEl = $("gateCount");
const shardCountEl = $("shardCount");
const shieldIndicator = $("shieldIndicator");

const startScreen = $("startScreen");
const gameOver = $("gameOver");
const tapHint = $("tapHint");
const pauseIndicator = $("pauseIndicator");
const flash = $("flash");

const startButton = $("startButton");
const retryButton = $("retryButton");
const pauseButton = $("pauseButton");
const restartButton = $("restartButton");
const shareButton = $("shareButton");

const finalScore = $("finalScore");
const finalGates = $("finalGates");
const finalShards = $("finalShards");
const finalCombo = $("finalCombo");
const finalBest = $("finalBest");

const STORAGE_KEY = "pulsewing-best-v2";

const CONFIG = Object.freeze({
  gravity: 1420,
  flapVelocity: -455,

  playerXRatio: 0.28,
  playerRadius: 13,

  baseSpeed: 190,
  maxSpeed: 400,

  gateWidth: 62,

  startGap: 175,
  minGap: 108,

  minSpawnDistance: 250,
  maxSpawnDistance: 340,

  shieldDuration: 6
});

let dpr = 1;
let width = 320;
let height = 420;

let lastTime = 0;
let animationFrame = 0;

let bestScore = Number(
  localStorage.getItem(STORAGE_KEY) || 0
);

const game = {
  state: "menu",

  time: 0,

  score: 0,

  // IMPORTANT:
  // gates is ONLY the array of active gates.
  gates: [],

  // counters are stored separately.
  gatesCleared: 0,
  shardsCollected: 0,

  combo: 1,
  comboTimer: 0,

  speed: CONFIG.baseSpeed,

  shield: 0,

  difficulty: 0,

  seed: 0x7ab42d1,

  particles: [],
  stars: [],

  player: {
    x: 0,
    y: 0,
    vy: 0,
    rotation: 0,
    pulse: 0
  }
};

bestScoreEl.textContent = String(bestScore);


/* ======================================================
   RANDOM
====================================================== */

function random() {
  game.seed =
    (game.seed * 1664525 + 1013904223) >>> 0;

  return game.seed / 4294967296;
}

function randomRange(min, max) {
  return min + random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


/* ======================================================
   CANVAS
====================================================== */

function resizeCanvas() {
  const rect =
    canvas.getBoundingClientRect();

  dpr =
    Math.min(
      window.devicePixelRatio || 1,
      2
    );

  width =
    Math.max(
      320,
      rect.width || window.innerWidth
    );

  height =
    Math.max(
      420,
      rect.height ||
        window.innerHeight - 120
    );

  canvas.width =
    Math.floor(width * dpr);

  canvas.height =
    Math.floor(height * dpr);

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  createStars();

  if (game.state === "menu") {
    placePlayerForMenu();
  } else {
    game.player.x =
      width * CONFIG.playerXRatio;

    game.player.y =
      clamp(
        game.player.y,
        20,
        height - 20
      );
  }
}

window.addEventListener(
  "resize",
  resizeCanvas
);


/* ======================================================
   STARS
====================================================== */

function createStars() {
  game.stars.length = 0;

  const count =
    Math.max(
      35,
      Math.floor(
        (width * height) / 7000
      )
    );

  for (let i = 0; i < count; i++) {
    game.stars.push({
      x: randomRange(0, width),
      y: randomRange(0, height),
      size: randomRange(0.6, 1.8),
      depth: randomRange(0.15, 0.9)
    });
  }
}


/* ======================================================
   PLAYER MENU POSITION
====================================================== */

function placePlayerForMenu() {
  game.player.x =
    width * CONFIG.playerXRatio;

  game.player.y =
    height * 0.48;

  game.player.vy = 0;
  game.player.rotation = 0;
  game.player.pulse = 0;
}


/* ======================================================
   RESET
====================================================== */

function resetGame(seed = null) {

  if (
    seed !== null &&
    Number.isFinite(Number(seed))
  ) {
    game.seed =
      Number(seed) >>> 0;
  } else {
    game.seed =
      (
        Date.now() ^
        Math.floor(
          Math.random() *
          0xffffffff
        )
      ) >>> 0;
  }

  game.time = 0;

  game.score = 0;

  game.gates.length = 0;

  game.gatesCleared = 0;

  game.shardsCollected = 0;

  game.combo = 1;

  game.comboTimer = 0;

  game.speed =
    CONFIG.baseSpeed;

  game.shield = 0;

  game.difficulty = 0;

  game.particles.length = 0;

  game.player.x =
    width * CONFIG.playerXRatio;

  game.player.y =
    height * 0.48;

  game.player.vy = 0;

  game.player.rotation = 0;

  game.player.pulse = 0;


  /*
    Generate the initial runway.
  */

  let x =
    width + 180;

  for (let i = 0; i < 7; i++) {

    createGateAt(x);

    x +=
      randomRange(
        CONFIG.minSpawnDistance,
        CONFIG.maxSpawnDistance
      );
  }
}


/* ======================================================
   GAP
====================================================== */

function getCurrentGap() {

  return Math.max(
    CONFIG.minGap,

    CONFIG.startGap -
      game.difficulty *
        (
          CONFIG.startGap -
          CONFIG.minGap
        )
  );
}


/* ======================================================
   GATE CREATION
====================================================== */

function createGateAt(x) {

  const gap =
    getCurrentGap();

  const margin =
    55 + gap / 2;

  const center =
    randomRange(
      margin,
      height - margin
    );

  const roll =
    random();

  let type =
    "normal";

  if (
    game.time > 7 &&
    roll < 0.22
  ) {
    type = "moving";
  }

  else if (
    game.time > 20 &&
    roll >= 0.22 &&
    roll < 0.34
  ) {
    type = "pulse";
  }

  game.gates.push({

    x,

    width:
      CONFIG.gateWidth,

    baseCenter:
      center,

    gap,

    type,

    phase:
      randomRange(
        0,
        Math.PI * 2
      ),

    amplitude:
      randomRange(
        20,
        48
      ),

    passed: false,

    shardCollected: false
  });
}


/* ======================================================
   DYNAMIC GATE CENTER
====================================================== */

function getGateCenter(gate) {

  if (gate.type === "moving") {

    return clamp(

      gate.baseCenter +

        Math.sin(
          game.time * 1.7 +
          gate.phase
        ) *
          gate.amplitude,

      gate.gap / 2 + 20,

      height -
        gate.gap / 2 -
        20
    );
  }


  if (gate.type === "pulse") {

    return clamp(

      gate.baseCenter +

        Math.sin(
          game.time * 3 +
          gate.phase
        ) *
          14,

      gate.gap / 2 + 20,

      height -
        gate.gap / 2 -
        20
    );
  }


  return gate.baseCenter;
}


/* ======================================================
   UPDATE
====================================================== */

function update(dt) {

  game.time += dt;


  /*
    Difficulty ramps continuously.
  */

  game.difficulty =
    clamp(
      game.time / 90,
      0,
      1
    );


  /*
    Speed ramps continuously.
  */

  game.speed =
    Math.min(
      CONFIG.maxSpeed,

      CONFIG.baseSpeed +
        game.time * 3.15
    );


  /*
    PLAYER PHYSICS
  */

  game.player.vy +=
    CONFIG.gravity * dt;

  game.player.y +=
    game.player.vy * dt;

  game.player.rotation =
    clamp(
      game.player.vy / 650,
      -0.6,
      1.05
    );

  game.player.pulse =
    Math.max(
      0,
      game.player.pulse -
        dt * 4.8
    );


  /*
    SHIELD
  */

  if (game.shield > 0) {

    game.shield =
      Math.max(
        0,
        game.shield - dt
      );
  }


  /*
    MOVE GATES
  */

  for (
    const gate of game.gates
  ) {

    gate.x -=
      game.speed * dt;

    handleGateCollision(
      gate
    );

    handleShard(
      gate
    );

    if (
      game.state !==
      "playing"
    ) {
      break;
    }
  }


  /*
    ALWAYS MAINTAIN
    A RUNWAY AHEAD.
  */

  let rightmost =
    game.gates.length > 0
      ? game.gates[
          game.gates.length - 1
        ].x
      : width;

  while (
    rightmost <
    width + 900
  ) {

    rightmost +=
      randomRange(
        CONFIG.minSpawnDistance,
        CONFIG.maxSpawnDistance
      );

    createGateAt(
      rightmost
    );
  }


  /*
    DELETE OLD GATES
  */

  while (
    game.gates.length > 0 &&

    game.gates[0].x +
      game.gates[0].width <
      -100
  ) {

    game.gates.shift();
  }


  /*
    COMBO
  */

  if (
    game.comboTimer > 0
  ) {

    game.comboTimer -= dt;

  } else {

    game.combo =
      Math.max(
        1,
        game.combo -
          dt * 0.55
      );
  }


  /*
    WORLD BOUNDS
  */

  if (
    game.player.y < -40 ||
    game.player.y >
      height + 40
  ) {

    crash();
  }


  updateParticles(dt);

  updateHUD();
}


/* ======================================================
   COLLISION
====================================================== */

function handleGateCollision(
  gate
) {

  if (
    game.state !==
    "playing"
  ) {
    return;
  }

  const px =
    game.player.x;

  const py =
    game.player.y;

  const radius =
    CONFIG.playerRadius;

  const center =
    getGateCenter(
      gate
    );

  const halfGap =
    gate.gap / 2;

  const top =
    center - halfGap;

  const bottom =
    center + halfGap;


  /*
    Successful crossing.
  */

  if (
    !gate.passed &&

    px >
      gate.x +
      gate.width
  ) {

    gate.passed = true;

    passGate();

    return;
  }


  /*
    Horizontal overlap.
  */

  const overlap =
    px + radius >
      gate.x &&

    px - radius <
      gate.x +
      gate.width;

  if (!overlap) {
    return;
  }


  /*
    Vertical collision.
  */

  if (
    py - radius < top ||
    py + radius > bottom
  ) {

    /*
      Shield saves us.
    */

    if (game.shield > 0) {

      game.shield = 0;

      gate.passed = true;

      createBurst(
        px,
        py,
        22
      );

      flashScreen();

    } else {

      crash();
    }
  }
}


/* ======================================================
   SUCCESSFUL GATE
====================================================== */

function passGate() {

  game.gatesCleared++;

  game.comboTimer = 2.2;

  game.combo =
    Math.min(
      12,
      game.combo + 0.7
    );

  game.score +=
    Math.max(
      1,
      Math.floor(
        game.combo
      )
    );


  /*
    Small chance of shield.
  */

  if (
    game.gatesCleared >= 5 &&
    random() < 0.08
  ) {

    game.shield =
      CONFIG.shieldDuration;
  }


  createBurst(
    game.player.x + 10,
    game.player.y,
    8
  );
}


/* ======================================================
   SHARDS
====================================================== */

function handleShard(
  gate
) {

  if (
    gate.shardCollected
  ) {
    return;
  }

  const center =
    getGateCenter(
      gate
    );

  const shardX =
    gate.x +
    gate.width / 2;

  const shardY =
    center +

    Math.sin(
      game.time * 3 +
      gate.phase
    ) *

      Math.min(
        25,
        gate.gap * 0.18
      );


  const dx =
    game.player.x -
    shardX;

  const dy =
    game.player.y -
    shardY;

  const distanceSquared =
    dx * dx +
    dy * dy;


  if (
    distanceSquared <
    28 * 28
  ) {

    gate.shardCollected =
      true;

    game.shardsCollected++;

    game.score += 3;

    game.comboTimer =
      2.5;

    game.combo =
      Math.min(
        12,
        game.combo + 0.3
      );

    createBurst(
      shardX,
      shardY,
      12
    );
  }
}


/* ======================================================
   PULSE
====================================================== */

function pulse() {

  if (
    game.state === "menu" ||
    game.state === "gameover"
  ) {

    startGame();

    return;
  }


  if (
    game.state !==
    "playing"
  ) {
    return;
  }


  game.player.vy =
    CONFIG.flapVelocity;

  game.player.pulse = 1;


  createBurst(
    game.player.x - 9,
    game.player.y + 4,
    4
  );
}


/* ======================================================
   START GAME
====================================================== */

function startGame() {

  resetGame();

  game.state =
    "playing";


  startScreen.classList.add(
    "hidden"
  );

  gameOver.classList.add(
    "hidden"
  );

  pauseIndicator.classList.add(
    "hidden"
  );

  pauseButton.textContent =
    "PAUSE";


  tapHint.classList.remove(
    "hidden"
  );

  window.setTimeout(
    () =>
      tapHint.classList.add(
        "hidden"
      ),
    1200
  );


  /*
    Initial pulse.
  */

  pulse();

  updateHUD();
}


/* ======================================================
   RESTART
====================================================== */

function restartGame() {

  resetGame();

  game.state =
    "playing";


  startScreen.classList.add(
    "hidden"
  );

  gameOver.classList.add(
    "hidden"
  );

  pauseIndicator.classList.add(
    "hidden"
  );

  pauseButton.textContent =
    "PAUSE";

  tapHint.classList.add(
    "hidden"
  );


  pulse();

  updateHUD();
}


/* ======================================================
   PAUSE
====================================================== */

function togglePause() {

  if (
    game.state ===
    "playing"
  ) {

    game.state =
      "paused";

    pauseIndicator.classList.remove(
      "hidden"
    );

    pauseButton.textContent =
      "RESUME";

    return;
  }


  if (
    game.state ===
    "paused"
  ) {

    game.state =
      "playing";

    pauseIndicator.classList.add(
      "hidden"
    );

    pauseButton.textContent =
      "PAUSE";
  }
}


/* ======================================================
   CRASH
====================================================== */

function crash() {

  if (
    game.state !==
    "playing"
  ) {
    return;
  }

  game.state =
    "gameover";


  createBurst(
    game.player.x,
    game.player.y,
    28
  );

  flashScreen();


  const score =
    Math.floor(
      game.score
    );


  if (
    score > bestScore
  ) {

    bestScore =
      score;

    localStorage.setItem(
      STORAGE_KEY,
      String(bestScore)
    );
  }


  finalScore.textContent =
    String(score);

  finalGates.textContent =
    String(
      game.gatesCleared
    );

  finalShards.textContent =
    String(
      game.shardsCollected
    );

  finalCombo.textContent =
    "×" +
    Math.max(
      1,
      Math.floor(
        game.combo
      )
    );

  finalBest.textContent =
    String(bestScore);


  bestScoreEl.textContent =
    String(bestScore);


  gameOver.classList.remove(
    "hidden"
  );

  tapHint.classList.add(
    "hidden"
  );


  updateHUD();
}


/* ======================================================
   HUD
====================================================== */

function updateHUD() {

  scoreEl.textContent =
    String(
      Math.floor(
        game.score
      )
    );


  runScoreEl.textContent =
    String(
      Math.floor(
        game.score
      )
    );


  comboEl.textContent =
    "COMBO ×" +
    Math.max(
      1,
      Math.floor(
        game.combo
      )
    );


  speedValueEl.textContent =
    (
      game.speed /
      CONFIG.baseSpeed
    ).toFixed(1) +
    "×";


  gateCountEl.textContent =
    game.gatesCleared +
    " GATES";


  shardCountEl.textContent =
    game.shardsCollected +
    " SHARDS";


  shieldIndicator.classList.toggle(
    "active",
    game.shield > 0
  );
}


/* ======================================================
   PARTICLES
====================================================== */

function createBurst(
  x,
  y,
  amount
) {

  for (
    let i = 0;
    i < amount;
    i++
  ) {

    const angle =
      random() *
      Math.PI *
      2;

    const speed =
      randomRange(
        35,
        155
      );


    game.particles.push({

      x,

      y,

      vx:
        Math.cos(angle) *
        speed,

      vy:
        Math.sin(angle) *
        speed,

      life:
        randomRange(
          0.22,
          0.62
        ),

      maxLife:
        0.62,

      size:
        randomRange(
          1,
          3
        )
    });
  }
}


function updateParticles(dt) {

  for (
    const particle of
    game.particles
  ) {

    particle.x +=
      particle.vx * dt;

    particle.y +=
      particle.vy * dt;

    particle.vy +=
      75 * dt;

    particle.life -= dt;
  }


  game.particles =
    game.particles.filter(
      (particle) =>
        particle.life > 0
    );
}


/* ======================================================
   RENDER
====================================================== */

function render() {

  ctx.fillStyle =
    "#07111f";

  ctx.fillRect(
    0,
    0,
    width,
    height
  );


  drawBackground();

  drawGates();

  drawParticles();

  drawPlayer();


  if (
    game.state ===
    "gameover"
  ) {

    drawDeathOverlay();
  }
}


/* ======================================================
   BACKGROUND
====================================================== */

function drawBackground() {

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


  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    0,
    0,
    width,
    height
  );


  /*
    Energy grid.
  */

  ctx.globalAlpha =
    0.1;

  ctx.strokeStyle =
    "#62e7ff";

  ctx.lineWidth = 1;


  for (
    let y = 45;
    y < height;
    y += 48
  ) {

    ctx.beginPath();

    ctx.moveTo(
      0,
      y
    );

    ctx.lineTo(
      width,
      y
    );

    ctx.stroke();
  }


  /*
    Stars.
  */

  ctx.globalAlpha =
    0.55;


  for (
    const star of game.stars
  ) {

    const drift =
      (
        game.time *
        game.speed *
        star.depth *
        0.08
      ) %
      (width + 20);


    const x =
      (
        star.x -
        drift +
        width +
        20
      ) %
      (width + 20) -
      10;


    ctx.fillStyle =
      "#9edff0";


    ctx.fillRect(
      x,
      star.y,
      star.size,
      star.size
    );
  }


  ctx.globalAlpha =
    1;


  /*
    Bottom glow.
  */

  const glow =
    ctx.createRadialGradient(
      width / 2,
      height,
      0,
      width / 2,
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


  ctx.fillStyle =
    glow;

  ctx.fillRect(
    0,
    0,
    width,
    height
  );
}


/* ======================================================
   GATES
====================================================== */

function drawGates() {

  for (
    const gate of game.gates
  ) {

    const center =
      getGateCenter(
        gate
      );

    const topHeight =
      center -
      gate.gap / 2;

    const bottomY =
      center +
      gate.gap / 2;


    drawGateSegment(
      gate.x,
      0,
      gate.width,
      topHeight
    );


    drawGateSegment(
      gate.x,
      bottomY,
      gate.width,
      height -
        bottomY
    );


    /*
      Gap borders.
    */

    ctx.strokeStyle =
      "rgba(98,231,255,0.18)";

    ctx.lineWidth = 1;

    ctx.setLineDash([
      3,
      7
    ]);


    ctx.beginPath();

    ctx.moveTo(
      gate.x,
      topHeight
    );

    ctx.lineTo(
      gate.x +
        gate.width,
      topHeight
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      gate.x,
      bottomY
    );

    ctx.lineTo(
      gate.x +
        gate.width,
      bottomY
    );

    ctx.stroke();


    ctx.setLineDash([]);


    /*
      Shard.
    */

    if (
      !gate.shardCollected
    ) {

      const shardY =
        center +

        Math.sin(
          game.time * 3 +
          gate.phase
        ) *

          Math.min(
            25,
            gate.gap * 0.18
          );


      drawShard(
        gate.x +
          gate.width / 2,
        shardY
      );
    }
  }
}


function drawGateSegment(
  x,
  y,
  w,
  h
) {

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
    0.43,
    "#244a67"
  );

  gradient.addColorStop(
    0.5,
    "#62e7ff"
  );

  gradient.addColorStop(
    0.57,
    "#244a67"
  );

  gradient.addColorStop(
    1,
    "#172c43"
  );


  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    x,
    y,
    w,
    h
  );


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


/* ======================================================
   SHARD
====================================================== */

function drawShard(
  x,
  y
) {

  const scale =
    1 +
    Math.sin(
      game.time * 7
    ) *
      0.14;


  ctx.save();

  ctx.translate(
    x,
    y
  );

  ctx.rotate(
    Math.PI / 4
  );


  ctx.shadowBlur =
    14;

  ctx.shadowColor =
    "#62e7ff";


  ctx.fillStyle =
    "#62e7ff";


  const size =
    5 * scale;


  ctx.fillRect(
    -size,
    -size,
    size * 2,
    size * 2
  );


  ctx.fillStyle =
    "#d9fbff";


  ctx.fillRect(
    -2 * scale,
    -2 * scale,
    4 * scale,
    4 * scale
  );


  ctx.restore();
}


/* ======================================================
   PLAYER
====================================================== */

function drawPlayer() {

  const p =
    game.player;


  ctx.save();


  ctx.translate(
    p.x,
    p.y
  );

  ctx.rotate(
    p.rotation
  );


  /*
    Shield.
  */

  if (
    game.shield > 0
  ) {

    const scale =
      1 +
      Math.sin(
        game.time * 8
      ) *
        0.08;


    ctx.strokeStyle =
      "rgba(98,231,255,0.68)";

    ctx.lineWidth = 2;

    ctx.shadowBlur =
      18;

    ctx.shadowColor =
      "#62e7ff";


    ctx.beginPath();

    ctx.arc(
      0,
      0,
      23 * scale,
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


  ctx.fillStyle =
    trail;


  ctx.beginPath();

  ctx.moveTo(
    -trailLength,
    0
  );

  ctx.lineTo(
    5,
    -5
  );

  ctx.lineTo(
    5,
    5
  );

  ctx.closePath();

  ctx.fill();


  /*
    Body.
  */

  ctx.shadowBlur =
    20;

  ctx.shadowColor =
    "#62e7ff";

  ctx.fillStyle =
    "#62e7ff";


  ctx.beginPath();

  ctx.moveTo(
    16,
    0
  );

  ctx.lineTo(
    -8,
    -11
  );

  ctx.lineTo(
    -13,
    0
  );

  ctx.lineTo(
    -8,
    11
  );

  ctx.closePath();

  ctx.fill();


  /*
    Core.
  */

  ctx.shadowBlur =
    0;

  ctx.fillStyle =
    "#effcff";


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


/* ======================================================
   PARTICLES
====================================================== */

function drawParticles() {

  for (
    const particle of
    game.particles
  ) {

    ctx.globalAlpha =
      particle.life /
      particle.maxLife;

    ctx.fillStyle =
      "#62e7ff";


    ctx.fillRect(
      particle.x,
      particle.y,
      particle.size,
      particle.size
    );
  }


  ctx.globalAlpha =
    1;
}


/* ======================================================
   DEATH
====================================================== */

function drawDeathOverlay() {

  ctx.fillStyle =
    "rgba(255,60,110,0.05)";


  ctx.fillRect(
    0,
    0,
    width,
    height
  );
}


/* ======================================================
   FLASH
====================================================== */

function flashScreen() {

  flash.classList.remove(
    "active"
  );


  /*
    Force browser reflow.
  */

  void flash.offsetWidth;


  flash.classList.add(
    "active"
  );
}


/* ======================================================
   INPUT
====================================================== */

canvas.addEventListener(
  "pointerdown",
  (event) => {

    event.preventDefault();

    pulse();
  },
  {
    passive: false
  }
);


window.addEventListener(
  "keydown",
  (event) => {

    if (
      event.code ===
        "Space" ||
      event.code ===
        "ArrowUp"
    ) {

      event.preventDefault();

      pulse();

    } else if (
      event.code ===
        "KeyP" ||
      event.code ===
        "Escape"
    ) {

      event.preventDefault();

      togglePause();
    }
  }
);


/* ======================================================
   BUTTON EVENTS
====================================================== */

startButton.addEventListener(
  "click",
  (event) => {

    event.preventDefault();
    event.stopPropagation();

    startGame();
  }
);


retryButton.addEventListener(
  "click",
  (event) => {

    event.preventDefault();
    event.stopPropagation();

    restartGame();
  }
);


restartButton.addEventListener(
  "click",
  (event) => {

    event.preventDefault();
    event.stopPropagation();

    restartGame();
  }
);


pauseButton.addEventListener(
  "click",
  (event) => {

    event.preventDefault();
    event.stopPropagation();

    togglePause();
  }
);


shareButton.addEventListener(
  "click",
  async (event) => {

    event.preventDefault();
    event.stopPropagation();


    const text =
      `I scored ${
        Math.floor(game.score)
      } in PULSEWING — ${
        game.gatesCleared
      } gates, ${
        game.shardsCollected
      } shards.`;


    try {

      if (
        navigator.clipboard &&
        navigator.clipboard.writeText
      ) {

        await navigator.clipboard.writeText(
          text
        );

        shareButton.textContent =
          "COPIED";

      } else {

        window.prompt(
          "Copy your run:",
          text
        );
      }

    } catch {

      window.prompt(
        "Copy your run:",
        text
      );
    }


    window.setTimeout(
      () => {

        shareButton.textContent =
          "COPY RUN";

      },
      1000
    );
  }
);


/* ======================================================
   STOP BUTTON EVENTS FROM REACHING
   OTHER INPUT HANDLERS
====================================================== */

for (
  const button of [
    startButton,
    retryButton,
    restartButton,
    pauseButton,
    shareButton
  ]
) {

  button.addEventListener(
    "pointerdown",
    (event) => {
      event.stopPropagation();
    }
  );
}


/* ======================================================
   AUTO PAUSE WHEN WINDOW LOSES FOCUS
====================================================== */

window.addEventListener(
  "blur",
  () => {

    if (
      game.state ===
      "playing"
    ) {

      togglePause();
    }
  }
);


/* ======================================================
   AI API
====================================================== */

window.PulseWingAI = {

  version: "1.1",


  getState() {

    const nearestGate =
      game.gates.find(
        (gate) =>
          gate.x +
            gate.width >=
          game.player.x - 20
      ) || null;


    return {

      version:
        this.version,

      gameState:
        game.state,


      player: {

        x:
          game.player.x,

        y:
          game.player.y,

        vy:
          game.player.vy,

        rotation:
          game.player.rotation
      },


      nearestGate:

        nearestGate
          ? {

              x:
                nearestGate.x,

              width:
                nearestGate.width,

              center:
                getGateCenter(
                  nearestGate
                ),

              gap:
                nearestGate.gap,

              distance:
                nearestGate.x -
                game.player.x,

              type:
                nearestGate.type

            }
          : null,


      score:
        Math.floor(
          game.score
        ),


      gatesCleared:
        game.gatesCleared,


      shardsCollected:
        game.shardsCollected,


      combo:
        game.combo,


      speed:
        game.speed,


      shield:
        game.shield,


      time:
        game.time,


      difficulty:
        game.difficulty
    };
  },


  /*
    0 = nothing
    1 = pulse
  */

  step(action = 0) {

    if (
      game.state !==
      "playing"
    ) {

      return this.getState();
    }


    if (
      Number(action) === 1
    ) {

      pulse();
    }


    return this.getState();
  },


  pulse() {

    pulse();

    return this.getState();
  },


  reset(seed = null) {

    resetGame(
      seed
    );


    game.state =
      "playing";


    startScreen.classList.add(
      "hidden"
    );

    gameOver.classList.add(
      "hidden"
    );

    pauseIndicator.classList.add(
      "hidden"
    );

    pauseButton.textContent =
      "PAUSE";


    return this.getState();
  }
};


/* ======================================================
   BROADCAST CHANNEL
====================================================== */

if (
  "BroadcastChannel" in window
) {

  const channel =
    new BroadcastChannel(
      "pulsewing-ai-v1"
    );


  channel.addEventListener(
    "message",
    (event) => {

      const message =
        event.data || {};


      if (
        message.type ===
        "pulsewing:get-state"
      ) {

        channel.postMessage({

          type:
            "pulsewing:state",

          requestId:
            message.requestId ||
            null,

          state:
            window.PulseWingAI.getState()
        });

      }


      else if (
        message.type ===
        "pulsewing:action"
      ) {

        channel.postMessage({

          type:
            "pulsewing:state",

          requestId:
            message.requestId ||
            null,

          state:
            window.PulseWingAI.step(
              message.action
            )
        });

      }


      else if (
        message.type ===
        "pulsewing:reset"
      ) {

        channel.postMessage({

          type:
            "pulsewing:state",

          requestId:
            message.requestId ||
            null,

          state:
            window.PulseWingAI.reset(
              message.seed ??
              null
            )
        });
      }
    }
  );
}


/* ======================================================
   MAIN LOOP
====================================================== */

function loop(timestamp) {

  if (!lastTime) {
    lastTime =
      timestamp;
  }


  const dt =
    Math.min(
      (timestamp -
        lastTime) /
        1000,
      0.04
    );


  lastTime =
    timestamp;


  if (
    game.state ===
    "playing"
  ) {

    update(dt);
  }


  render();


  animationFrame =
    requestAnimationFrame(
      loop
    );
}


/* ======================================================
   INITIALIZE
====================================================== */

resizeCanvas();

resetGame(
  0x7ab42d1
);

game.state =
  "menu";

placePlayerForMenu();

updateHUD();

animationFrame =
  requestAnimationFrame(
    loop
  );
