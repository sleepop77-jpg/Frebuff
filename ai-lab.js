(() => {
  "use strict";

  /*
   * PULSE LAB
   * AI evolution + genetic archive + live-game AI controller.
   *
   * Fully client-side.
   * GitHub Pages compatible.
   */

  const STORAGE_KEY = "pulse-lab-agents-v2";
  const SETTINGS_KEY = "pulse-lab-settings-v2";

  const CONFIG = {
    population: 24,
    eliteCount: 5,

    mutationRate: 0.12,
    mutationStrength: 0.32,

    simulationHz: 30,
    maxSteps: 4200,

    gravity: 1420,
    pulseVelocity: -455,

    baseSpeed: 190,
    maxSpeed: 410,

    startGap: 175,
    minGap: 108,

    gateSpacingMin: 230,
    gateSpacingMax: 330,

    playerRadius: 15,
    gateWidth: 42,

    archiveLimit: 30
  };

  const LAB = {
    generation: 1,
    running: false,
    paused: false,
    speedMultiplier: 1,

    population: [],
    history: [],

    bestEver: null,
    generationBest: null,

    liveBrain: null,
    liveEnabled: false,
    liveInterval: null,

    selectedAgent: null,

    seed: 918273,
    idCounter: 1,

    ui: {},
    canvas: null,
    ctx: null,

    animationFrame: null,
    lastFrame: 0,
    accumulator: 0,

    mode: "evolution"
  };

  /* ---------------------------------------------------------
     Utilities
  --------------------------------------------------------- */

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function random() {
    LAB.seed = (LAB.seed * 1664525 + 1013904223) >>> 0;
    return LAB.seed / 4294967296;
  }

  function rand(min, max) {
    return min + random() * (max - min);
  }

  function gaussian() {
    let u = 0;
    let v = 0;

    while (u === 0) u = random();
    while (v === 0) v = random();

    return Math.sqrt(-2 * Math.log(u)) *
      Math.cos(Math.PI * 2 * v);
  }

  function makeId() {
    return "agent-" + Date.now().toString(36) + "-" +
      (LAB.idCounter++).toString(36);
  }

  function safeName(name) {
    return String(name || "Unnamed Agent")
      .replace(/[<>]/g, "")
      .slice(0, 32);
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  /* ---------------------------------------------------------
     Brain
  --------------------------------------------------------- */

  class Brain {
    constructor(inputSize = 6, hiddenSize = 8, outputSize = 1) {
      this.inputSize = inputSize;
      this.hiddenSize = hiddenSize;
      this.outputSize = outputSize;

      this.w1 = Array.from(
        { length: hiddenSize },
        () => Array.from(
          { length: inputSize },
          () => rand(-1, 1)
        )
      );

      this.b1 = Array.from(
        { length: hiddenSize },
        () => rand(-0.5, 0.5)
      );

      this.w2 = Array.from(
        { length: outputSize },
        () => Array.from(
          { length: hiddenSize },
          () => rand(-1, 1)
        )
      );

      this.b2 = Array.from(
        { length: outputSize },
        () => rand(-0.5, 0.5)
      );
    }

    clone() {
      const b = new Brain(
        this.inputSize,
        this.hiddenSize,
        this.outputSize
      );

      b.w1 = this.w1.map(row => [...row]);
      b.b1 = [...this.b1];
      b.w2 = this.w2.map(row => [...row]);
      b.b2 = [...this.b2];

      return b;
    }

    forward(inputs) {
      const hidden = [];

      for (let i = 0; i < this.hiddenSize; i++) {
        let sum = this.b1[i];

        for (let j = 0; j < this.inputSize; j++) {
          sum += this.w1[i][j] * (inputs[j] || 0);
        }

        hidden.push(Math.tanh(sum));
      }

      let output = this.b2[0];

      for (let i = 0; i < this.hiddenSize; i++) {
        output += this.w2[0][i] * hidden[i];
      }

      return sigmoid(output);
    }

    mutate(rate = CONFIG.mutationRate, strength = CONFIG.mutationStrength) {
      for (let i = 0; i < this.w1.length; i++) {
        for (let j = 0; j < this.w1[i].length; j++) {
          if (random() < rate) {
            this.w1[i][j] += gaussian() * strength;
          }
        }
      }

      for (let i = 0; i < this.b1.length; i++) {
        if (random() < rate) {
          this.b1[i] += gaussian() * strength;
        }
      }

      for (let i = 0; i < this.w2.length; i++) {
        for (let j = 0; j < this.w2[i].length; j++) {
          if (random() < rate) {
            this.w2[i][j] += gaussian() * strength;
          }
        }
      }

      for (let i = 0; i < this.b2.length; i++) {
        if (random() < rate) {
          this.b2[i] += gaussian() * strength;
        }
      }

      return this;
    }

    crossover(other) {
      const child = this.clone();

      for (let i = 0; i < child.w1.length; i++) {
        for (let j = 0; j < child.w1[i].length; j++) {
          if (random() < 0.5) {
            child.w1[i][j] = other.w1[i][j];
          }
        }
      }

      for (let i = 0; i < child.b1.length; i++) {
        if (random() < 0.5) {
          child.b1[i] = other.b1[i];
        }
      }

      for (let i = 0; i < child.w2.length; i++) {
        for (let j = 0; j < child.w2[i].length; j++) {
          if (random() < 0.5) {
            child.w2[i][j] = other.w2[i][j];
          }
        }
      }

      for (let i = 0; i < child.b2.length; i++) {
        if (random() < 0.5) {
          child.b2[i] = other.b2[i];
        }
      }

      return child;
    }

    serialize() {
      return {
        inputSize: this.inputSize,
        hiddenSize: this.hiddenSize,
        outputSize: this.outputSize,
        w1: this.w1,
        b1: this.b1,
        w2: this.w2,
        b2: this.b2
      };
    }

    static deserialize(data) {
      const b = new Brain(
        data.inputSize || 6,
        data.hiddenSize || 8,
        data.outputSize || 1
      );

      if (Array.isArray(data.w1)) b.w1 = data.w1.map(r => [...r]);
      if (Array.isArray(data.b1)) b.b1 = [...data.b1];
      if (Array.isArray(data.w2)) b.w2 = data.w2.map(r => [...r]);
      if (Array.isArray(data.b2)) b.b2 = [...data.b2];

      return b;
    }
  }

  /* ---------------------------------------------------------
     Headless PULSEWING-like simulation
  --------------------------------------------------------- */

  class Agent {
    constructor(brain = new Brain(), metadata = {}) {
      this.id = metadata.id || makeId();
      this.name = safeName(metadata.name || "Agent " + LAB.idCounter);

      this.brain = brain;

      this.generationBorn =
        metadata.generationBorn || LAB.generation;

      this.reset();
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
      this.combo = 1;

      this.alive = true;
      this.steps = 0;
      this.age = 0;

      this.nextGateX = 260;
      this.gates = [];

      this.spawnInitialGates();
    }

    spawnInitialGates() {
      let x = 260;

      for (let i = 0; i < 10; i++) {
        this.spawnGate(x);
        x += rand(
          CONFIG.gateSpacingMin,
          CONFIG.gateSpacingMax
        );
      }
    }

    currentGap() {
      const difficulty =
        clamp(this.steps / 1800, 0, 1);

      return CONFIG.startGap +
        (CONFIG.minGap - CONFIG.startGap) * difficulty;
    }

    spawnGate(x) {
      const gap = this.currentGap();

      const margin = 0.16;

      const center = rand(
        margin + gap / 900,
        1 - margin - gap / 900
      );

      this.gates.push({
        x,
        center,
        gap,
        width: CONFIG.gateWidth,
        passed: false
      });

      this.nextGateX = x;
    }

    ensureGates() {
      let last =
        this.gates.length
          ? this.gates[this.gates.length - 1].x
          : this.worldX + 260;

      while (last < this.worldX + 1500) {
        last += rand(
          CONFIG.gateSpacingMin,
          CONFIG.gateSpacingMax
        );

        this.spawnGate(last);
      }
    }

    nearestGate() {
      for (const gate of this.gates) {
        if (!gate.passed &&
            gate.x + gate.width > this.worldX - 10) {
          return gate;
        }
      }

      return null;
    }

    observe() {
      const gate = this.nearestGate();

      if (!gate) {
        return [0, 0, 1, 0.5, 1, 0];
      }

      const dx =
        (gate.x - this.worldX) / 500;

      const player =
        clamp(this.y, 0, 1);

      const center =
        clamp(gate.center, 0, 1);

      const gap =
        clamp(gate.gap / CONFIG.startGap, 0, 1);

      const velocity =
        clamp(this.vy / 500, -1, 1);

      const speed =
        clamp(
          (this.speed - CONFIG.baseSpeed) /
          (CONFIG.maxSpeed - CONFIG.baseSpeed),
          0,
          1
        );

      return [
        clamp(dx, -1, 2),
        velocity,
        clamp(center - player, -1, 1),
        center,
        gap,
        speed
      ];
    }

    think() {
      return this.brain.forward(this.observe());
    }

    pulse() {
      if (!this.alive) return;

      this.vy = CONFIG.pulseVelocity;
    }

    update(dt) {
      if (!this.alive) return;

      this.steps++;
      this.age += dt;

      const difficulty =
        clamp(this.steps / CONFIG.maxSteps, 0, 1);

      this.speed =
        CONFIG.baseSpeed +
        (CONFIG.maxSpeed - CONFIG.baseSpeed) *
        difficulty;

      const output = this.think();

      if (output > 0.5) {
        this.pulse();
      }

      this.vy += CONFIG.gravity * dt;

      this.y +=
        (this.vy * dt) / 520;

      this.worldX +=
        this.speed * dt;

      this.checkGates();
      this.checkCollision();
      this.ensureGates();

      this.gates =
        this.gates.filter(
          gate => gate.x > this.worldX - 100
        );

      if (this.steps >= CONFIG.maxSteps) {
        this.die();
      }
    }

    checkGates() {
      for (const gate of this.gates) {
        if (gate.passed) continue;

        if (gate.x + gate.width < this.worldX) {
          gate.passed = true;

          this.gatesCleared++;
          this.combo =
            Math.min(20, this.combo + 1);

          this.score +=
            100 * this.combo;

          const distance =
            Math.abs(this.y - gate.center);

          if (
            distance <
            gate.gap / 1050 + 0.06
          ) {
            this.nearMisses++;
            this.score += 35;
          }

          continue;
        }
      }
    }

    checkCollision() {
      if (
        this.y < 0.035 ||
        this.y > 0.965
      ) {
        this.die();
        return;
      }

      const gate = this.nearestGate();

      if (!gate) return;

      const horizontal =
        this.worldX + 0.025 >= gate.x &&
        this.worldX - 0.025 <=
          gate.x + gate.width;

      if (!horizontal) return;

      const halfGap =
        gate.gap / 1040;

      const safeTop =
        gate.center - halfGap;

      const safeBottom =
        gate.center + halfGap;

      if (
        this.y < safeTop ||
        this.y > safeBottom
      ) {
        this.die();
      }
    }

    die() {
      this.alive = false;
    }

    fitness() {
      return (
        this.age * 3 +
        this.gatesCleared * 150 +
        this.nearMisses * 60 +
        this.score * 0.5
      );
    }
  }

  /* ---------------------------------------------------------
     Evolution
  --------------------------------------------------------- */

  function createPopulation() {
    LAB.population = [];

    for (let i = 0; i < CONFIG.population; i++) {
      LAB.population.push(
        new Agent(
          new Brain(),
          {
            name: "Agent " + (i + 1),
            generationBorn: LAB.generation
          }
        )
      );
    }
  }

  function evaluateStep() {
    let alive = 0;

    for (const agent of LAB.population) {
      if (agent.alive) {
        agent.update(1 / CONFIG.simulationHz);
      }

      if (agent.alive) alive++;
    }

    return alive;
  }

  function finishGeneration() {
    LAB.population.sort(
      (a, b) => b.fitness() - a.fitness()
    );

    const best = LAB.population[0];

    LAB.generationBest = snapshotAgent(best);

    if (
      !LAB.bestEver ||
      best.fitness() > LAB.bestEver.fitness
    ) {
      LAB.bestEver = snapshotAgent(best);
    }

    LAB.history.unshift({
      generation: LAB.generation,
      fitness: best.fitness(),
      gates: best.gatesCleared,
      score: best.score
    });

    LAB.history =
      LAB.history.slice(0, 20);

    LAB.generation++;

    breedNextGeneration();

    addLog(
      "Generation " +
      (LAB.generation - 1) +
      " → best " +
      Math.round(best.fitness()) +
      " fitness / " +
      best.gatesCleared +
      " gates"
    );

    render();
  }

  function breedNextGeneration() {
    const sorted = [...LAB.population]
      .sort(
        (a, b) =>
          b.fitness() - a.fitness()
      );

    const next = [];

    for (
      let i = 0;
      i < CONFIG.eliteCount &&
      i < sorted.length;
      i++
    ) {
      const clone =
        new Agent(
          sorted[i].brain.clone(),
          {
            name:
              "Elite " +
              (i + 1) +
              " • G" +
              LAB.generation,
            generationBorn: LAB.generation
          }
        );

      next.push(clone);
    }

    while (
      next.length <
      CONFIG.population
    ) {
      const parentA =
        tournamentSelect(sorted);

      const parentB =
        tournamentSelect(sorted);

      const childBrain =
        parentA.brain
          .crossover(parentB.brain);

      childBrain.mutate(
        CONFIG.mutationRate,
        CONFIG.mutationStrength
      );

      next.push(
        new Agent(
          childBrain,
          {
            name:
              "Agent " +
              (next.length + 1),
