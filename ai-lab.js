(() => {
  "use strict";

  /*
    PULSE LAB
    Evolutionary AI laboratory for PULSEWING.

    Client-side only.
    GitHub Pages compatible.
  */

  const CONFIG = {
    population: 24,
    eliteCount: 5,

    mutationRate: 0.12,
    mutationStrength: 0.35,

    simulationHz: 30,
    maxSteps: 5400,

    gravity: 1420,
    pulseVelocity: -455,

    baseSpeed: 190,
    maxSpeed: 410,

    startGap: 175,
    minGap: 108,

    gateSpacingMin: 230,
    gateSpacingMax: 330
  };

  const lab = {
    generation: 1,
    running: false,
    paused: false,

    speedMultiplier: 1,

    agents: [],
    history: [],

    bestEver: null,
    generationBest: null,

    seed: 918273,

    ui: {},
    animationFrame: null
  };

  /* =========================================================
     RANDOM
  ========================================================= */

  function random() {
    lab.seed |= 0;
    lab.seed = (lab.seed + 0x6D2B79F5) | 0;

    let t = lab.seed;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function rand(min, max) {
    return min + random() * (max - min);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /* =========================================================
     BRAIN
  ========================================================= */

  class Brain {
    constructor(inputCount = 6, hiddenCount = 8) {
      this.inputCount = inputCount;
      this.hiddenCount = hiddenCount;

      this.w1 = Array.from(
        { length: hiddenCount },
        () =>
          Array.from(
            { length: inputCount },
            () => rand(-1, 1)
          )
      );

      this.b1 = Array.from(
        { length: hiddenCount },
        () => rand(-1, 1)
      );

      this.w2 = Array.from(
        { length: hiddenCount },
        () => rand(-1, 1)
      );

      this.b2 = rand(-1, 1);
    }

    clone() {
      const b = Object.create(Brain.prototype);

      b.inputCount = this.inputCount;
      b.hiddenCount = this.hiddenCount;

      b.w1 = this.w1.map(row => [...row]);
      b.b1 = [...this.b1];

      b.w2 = [...this.w2];
      b.b2 = this.b2;

      return b;
    }

    predict(inputs) {
      const hidden = new Array(this.hiddenCount);

      for (let i = 0; i < this.hiddenCount; i++) {
        let sum = this.b1[i];

        for (let j = 0; j < this.inputCount; j++) {
          sum += this.w1[i][j] * inputs[j];
        }

        hidden[i] = Math.tanh(sum);
      }

      let output = this.b2;

      for (let i = 0; i < this.hiddenCount; i++) {
        output += this.w2[i] * hidden[i];
      }

      return 1 / (1 + Math.exp(-output));
    }

    mutate(rate = CONFIG.mutationRate, strength = CONFIG.mutationStrength) {
      const mutateValue = value => {
        if (random() < rate) {
          return value + rand(-strength, strength);
        }

        return value;
      };

      for (let i = 0; i < this.w1.length; i++) {
        for (let j = 0; j < this.w1[i].length; j++) {
          this.w1[i][j] = mutateValue(this.w1[i][j]);
        }

        this.b1[i] = mutateValue(this.b1[i]);
        this.w2[i] = mutateValue(this.w2[i]);
      }

      this.b2 = mutateValue(this.b2);

      return this;
    }

    static crossover(a, b) {
      const child = a.clone();

      for (let i = 0; i < child.w1.length; i++) {
        for (let j = 0; j < child.w1[i].length; j++) {
          if (random() < 0.5) {
            child.w1[i][j] = b.w1[i][j];
          }
        }

        if (random() < 0.5) {
          child.b1[i] = b.b1[i];
        }

        if (random() < 0.5) {
          child.w2[i] = b.w2[i];
        }
      }

      if (random() < 0.5) {
        child.b2 = b.b2;
      }

      return child;
    }
  }

  /* =========================================================
     AGENT
  ========================================================= */

  class Agent {
    constructor(brain = new Brain()) {
      this.brain = brain;

      this.reset();

      this.id =
        "A-" +
        Math.random()
          .toString(36)
          .slice(2, 7)
          .toUpperCase();
    }

    reset() {
      this.y = 0.5;
      this.vy = 0;

      this.worldX = 0;

      this.speed = CONFIG.baseSpeed;

      this.score = 0;
      this.gatesCleared = 0;
      this.shards = 0;
      this.nearMisses = 0;
      this.combo = 0;

      this.alive = true;

      this.steps = 0;
      this.age = 0;

      this.nextGateX = 260;
      this.gates = [];

      this.spawnInitialGates();
    }

    spawnInitialGates() {
      let x = 260;

      while (x < 1800) {
        this.spawnGate(x);
        x += rand(
          CONFIG.gateSpacingMin,
          CONFIG.gateSpacingMax
        );
      }
    }

    spawnGate(x) {
      const gapSize = Math.max(
        CONFIG.minGap,
        CONFIG.startGap - this.age * 0.7
      );

      const center = rand(
        0.24 + gapSize / 900,
        0.76 - gapSize / 900
      );

      this.gates.push({
        x,
        center,
        gap: gapSize,
        passed: false
      });
    }

    ensureGates() {
      while (
        this.nextGateX <
        this.worldX + 1900
      ) {
        this.spawnGate(this.nextGateX);

        this.nextGateX += rand(
          CONFIG.gateSpacingMin,
          CONFIG.gateSpacingMax
        );
      }
    }

    getNearestGate() {
      let nearest = null;

      for (const gate of this.gates) {
        if (gate.passed) continue;

        if (
          gate.x + 30 <
          this.worldX
        ) {
          continue;
        }

        if (
          !nearest ||
          gate.x < nearest.x
        ) {
          nearest = gate;
        }
      }

      return nearest;
    }

    observe() {
      const gate = this.getNearestGate();

      if (!gate) {
        return [
          this.y,
          clamp(this.vy / 700, -1, 1),
          1,
          0.5,
          0.25,
          clamp(
            this.speed / CONFIG.maxSpeed,
            0,
            1
          )
        ];
      }

      const dx =
        (gate.x - this.worldX) / 500;

      return [
        clamp(this.y, 0, 1),

        clamp(
          this.vy / 700,
          -1,
          1
        ),

        clamp(dx, -1, 1),

        clamp(gate.center, 0, 1),

        clamp(gate.gap / 400, 0, 1),

        clamp(
          this.speed / CONFIG.maxSpeed,
          0,
          1
        )
      ];
    }

    think() {
      const output =
        this.brain.predict(
          this.observe()
        );

      return output > 0.5;
    }

    pulse() {
      this.vy = CONFIG.pulseVelocity;
    }

    update(dt) {
      if (!this.alive) return;

      this.steps++;
      this.age += dt;

      this.speed = Math.min(
        CONFIG.maxSpeed,
        CONFIG.baseSpeed +
          this.age * 7
      );

      if (this.think()) {
        this.pulse();
      }

      this.vy += CONFIG.gravity * dt;
      this.y +=
        (this.vy * dt) / 600;

      this.worldX +=
        this.speed * dt;

      this.score += dt * 10;

      this.ensureGates();

      this.checkGates();
      this.checkCollision();

      if (this.steps >= CONFIG.maxSteps) {
        this.die();
      }
    }

    checkGates() {
      for (const gate of this.gates) {
        if (gate.passed) continue;

        if (
          gate.x <
          this.worldX
        ) {
          gate.passed = true;

          this.gatesCleared++;

          this.combo++;

          this.score +=
            100 +
            this.combo * 10;

          if (
            Math.abs(
              this.y - gate.center
            ) < 0.075
          ) {
            this.nearMisses++;
            this.score += 50;
          }
        }
      }

      this.gates =
        this.gates.filter(
          gate =>
            gate.x >
            this.worldX - 500
        );
    }

    checkCollision() {
      const top = 0.04;
      const bottom = 0.96;

      if (
        this.y < top ||
        this.y > bottom
      ) {
        this.die();
        return;
      }

      const gate =
        this.getNearestGate();

      if (!gate) return;

      const dx =
        gate.x - this.worldX;

      if (
        dx > -15 &&
        dx < 25
      ) {
        const halfGap =
          gate.gap / 1200;

        if (
          Math.abs(
            this.y - gate.center
          ) > halfGap
        ) {
          this.die();
        }
      }
    }

    die() {
      if (!this.alive) return;

      this.alive = false;

      this.fitness =
        this.age * 3 +
        this.gatesCleared * 120 +
        this.shards * 35 +
        this.nearMisses * 50 +
        this.score * 0.5;
    }

    getFitness() {
      return this.fitness || 0;
    }
  }

  /* =========================================================
     EVOLUTION
  ========================================================= */

  function createPopulation() {
    lab.agents = [];

    for (
      let i = 0;
      i < CONFIG.population;
      i++
    ) {
      lab.agents.push(
        new Agent()
      );
    }
  }

  function evaluateGeneration() {
    return lab.agents.every(
      agent => !agent.alive
    );
  }

  function finishGeneration() {
    lab.running = false;

    lab.agents.sort(
      (a, b) =>
        b.getFitness() -
        a.getFitness()
    );

    lab.generationBest =
      lab.agents[0];

    if (
      !lab.bestEver ||
      lab.generationBest.getFitness() >
        lab.bestEver.getFitness()
    ) {
      lab.bestEver =
        cloneAgent(
          lab.generationBest
        );
    }

    lab.history.push({
      generation: lab.generation,
      fitness:
        lab.generationBest.getFitness(),
      gates:
        lab.generationBest.gatesCleared,
      age:
        lab.generationBest.age
    });

    lab.generation++;

    updateUI();
  }

  function cloneAgent(agent) {
    const clone =
      new Agent(
        agent.brain.clone()
      );

    clone.fitness =
      agent.getFitness();

    clone.gatesCleared =
      agent.gatesCleared;

    clone.age =
      agent.age;

    clone.score =
      agent.score;

    return clone;
  }

  function breedNextGeneration() {
    lab.agents.sort(
      (a, b) =>
        b.getFitness() -
        a.getFitness()
    );

    const elites =
      lab.agents
        .slice(
          0,
          CONFIG.eliteCount
        );

    const next = [];

    for (
      let i = 0;
      i < CONFIG.eliteCount;
      i++
    ) {
      next.push(
        new Agent(
          elites[i].brain.clone()
        )
      );
    }

    while (
      next.length <
      CONFIG.population
    ) {
      const parentA =
        elites[
          Math.floor(
            random() *
              elites.length
          )
        ];

      const parentB =
        elites[
          Math.floor(
            random() *
              elites.length
          )
        ];

      const childBrain =
        Brain.crossover(
          parentA.brain,
          parentB.brain
        );

      childBrain.mutate();

      next.push(
        new Agent(
          childBrain
        )
      );
    }

    lab.agents = next;

    lab.running = true;

    updateUI();
  }

  /* =========================================================
     SIMULATION
  ========================================================= */

  let lastTime = 0;

  function simulationLoop(time) {
    const dt =
      Math.min(
        0.04,
        (time - lastTime) / 1000 || 0
      );

    lastTime = time;

    if (lab.running) {
      const steps = Math.max(
        1,
        Math.floor(
          lab.speedMultiplier
        )
      );

      const fixedDt =
        1 /
        CONFIG.simulationHz;

      for (
        let s = 0;
        s < steps;
        s++
      ) {
        for (
          const agent of lab.agents
        ) {
          if (agent.alive) {
            agent.update(
              fixedDt
            );
          }
        }

        if (
          evaluateGeneration()
        ) {
          finishGeneration();
          break;
        }
      }

      drawPopulation();
      updateUI();
    }

    lab.animationFrame =
      requestAnimationFrame(
        simulationLoop
      );
  }

  /* =========================================================
     UI
  ========================================================= */

  function createUI() {
    if (
      document.getElementById(
        "pulse-lab-root"
      )
    ) {
      return;
    }

    const root =
      document.createElement(
        "div"
      );

    root.id =
      "pulse-lab-root";

    root.innerHTML = `
      <button
        id="pulse-lab-open"
        type="button"
      >
        ⚡ AI LAB
      </button>

      <div
        id="pulse-lab-overlay"
        class="pulse-lab-hidden"
      >
        <div
          id="pulse-lab-panel"
        >

          <div
            class="pulse-lab-header"
          >
            <div>
              <div
                class="pulse-lab-title"
              >
                PULSE LAB
              </div>

              <div
                class="pulse-lab-subtitle"
              >
                EVOLUTIONARY AI SIMULATION
              </div>
            </div>

            <button
              id="pulse-lab-close"
              type="button"
            >
              ×
            </button>
          </div>

          <div
            class="pulse-lab-stats"
          >
            <div>
              <span>
                GENERATION
              </span>

              <strong
                id="pulse-lab-generation"
              >
                1
              </strong>
            </div>

            <div>
              <span>
                BEST FITNESS
              </span>

              <strong
                id="pulse-lab-fitness"
              >
                0
              </strong>
            </div>

            <div>
              <span>
                BEST GATES
              </span>

              <strong
                id="pulse-lab-gates"
              >
                0
              </strong>
            </div>

            <div>
              <span>
                ALIVE
              </span>

              <strong
                id="pulse-lab-alive"
              >
                0
              </strong>
            </div>
          </div>

          <div
            class="pulse-lab-controls"
          >
            <button
              id="pulse-lab-start"
              type="button"
            >
              ▶ START EVOLUTION
            </button>

            <button
              id="pulse-lab-breed"
              type="button"
            >
              🧬 BREED NEXT
            </button>

            <button
              id="pulse-lab-reset"
              type="button"
            >
              ↻ RESET
            </button>
          </div>

          <div
            class="pulse-lab-speed"
          >
            <span>
              SIM SPEED
            </span>

            <button
              data-speed="1"
              type="button"
            >
              1×
            </button>

            <button
              data-speed="3"
              type="button"
            >
              3×
            </button>

            <button
              data-speed="8"
              type="button"
            >
              8×
            </button>

            <button
              data-speed="20"
              type="button"
            >
              20×
            </button>
          </div>

          <canvas
            id="pulse-lab-canvas"
          ></canvas>

          <div
            class="pulse-lab-columns"
          >

            <div>
              <h3>
                AGENTS
              </h3>

              <div
                id="pulse-lab-agents"
              ></div>
            </div>

            <div>
              <h3>
                EVOLUTION LOG
              </h3>

              <div
                id="pulse-lab-log"
              ></div>
            </div>

          </div>

          <div
            class="pulse-lab-info"
          >
            <strong>
              HOW IT LEARNS
            </strong>

            <p>
              Every agent receives the same
              type of environment but starts
              with a different neural network.
              The agents that survive longer
              and clear more gates receive
              higher fitness.
            </p>

            <p>
              The strongest brains are copied,
              crossed together and mutated.
              A new generation then tries again.
            </p>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(root);

    injectStyles();

    lab.ui = {
      root,

      overlay:
        document.getElementById(
          "pulse-lab-overlay"
        ),

      generation:
        document.getElementById(
          "pulse-lab-generation"
        ),

      fitness:
        document.getElementById(
          "pulse-lab-fitness"
        ),

      gates:
        document.getElementById(
          "pulse-lab-gates"
        ),

      alive:
        document.getElementById(
          "pulse-lab-alive"
        ),

      agents:
        document.getElementById(
          "pulse-lab-agents"
        ),

      log:
        document.getElementById(
          "pulse-lab-log"
        ),

      canvas:
        document.getElementById(
          "pulse-lab-canvas"
        )
    };

    document
      .getElementById(
        "pulse-lab-open"
      )
      .addEventListener(
        "click",
        () => {
          lab.ui.overlay.classList.remove(
            "pulse-lab-hidden"
          );
        }
      );

    document
      .getElementById(
        "pulse-lab-close"
      )
      .addEventListener(
        "click",
        () => {
          lab.ui.overlay.classList.add(
            "pulse-lab-hidden"
          );
        }
      );

    document
      .getElementById(
        "pulse-lab-start"
      )
      .addEventListener(
        "click",
        () => {
          lab.running = true;
        }
      );

    document
      .getElementById(
        "pulse-lab-breed"
      )
      .addEventListener(
        "click",
        () => {
          breedNextGeneration();
        }
      );

    document
      .getElementById(
        "pulse-lab-reset"
      )
      .addEventListener(
        "click",
        () => {
          resetLab();
        }
      );

    document
      .querySelectorAll(
        "[data-speed]"
      )
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            lab.speedMultiplier =
              Number(
                button.dataset.speed
              );
          }
        );
      });
  }

  function injectStyles() {
    if (
      document.getElementById(
        "pulse-lab-styles"
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "pulse-lab-styles";

    style.textContent = `
      #pulse-lab-open {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 9998;
        border: 1px solid rgba(255,255,255,.2);
        border-radius: 12px;
        padding: 11px 15px;
        background: rgba(15,20,30,.9);
        color: white;
        font-weight: 800;
        cursor: pointer;
        backdrop-filter: blur(12px);
      }

      #pulse-lab-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(2,5,12,.86);
        backdrop-filter: blur(14px);
        overflow: auto;
        padding: 18px;
      }

      .pulse-lab-hidden {
        display: none !important;
      }

      #pulse-lab-panel {
        width: min(1100px, 100%);
        margin: auto;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 24px;
        background: #0b1019;
        color: #eef5ff;
        padding: 20px;
        box-shadow: 0 30px 100px rgba(0,0,0,.5);
      }

      .pulse-lab-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 15px;
        margin-bottom: 18px;
      }

      .pulse-lab-title {
        font-size: 28px;
        font-weight: 950;
        letter-spacing: .08em;
      }

      .pulse-lab-subtitle {
        opacity: .5;
        font-size: 11px;
        letter-spacing: .16em;
        margin-top: 4px;
      }

      #pulse-lab-close {
        width: 42px;
        height: 42px;
        border: 0;
        border-radius: 12px;
        background: rgba(255,255,255,.08);
        color: white;
        font-size: 25px;
        cursor: pointer;
      }

      .pulse-lab-stats {
        display: grid;
        grid-template-columns:
          repeat(4, 1fr);
        gap: 10px;
      }

      .pulse-lab-stats > div {
        padding: 14px;
        border-radius: 14px;
        background: rgba(255,255,255,.045);
        border: 1px solid rgba(255,255,255,.07);
      }

      .pulse-lab-stats span {
        display: block;
        opacity: .45;
        font-size: 10px;
        letter-spacing: .12em;
      }

      .pulse-lab-stats strong {
        display: block;
        font-size: 22px;
        margin-top: 5px;
      }

      .pulse-lab-controls,
      .pulse-lab-speed {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .pulse-lab-controls button,
      .pulse-lab-speed button {
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 10px;
        background: rgba(255,255,255,.07);
        color: white;
        padding:
