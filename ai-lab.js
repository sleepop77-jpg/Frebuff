"use strict";

/*
=========================================================
 PULSE LAB
 Evolutionary AI system for PULSEWING

 20 neural agents
 -> simulation
 -> fitness
 -> selection
 -> crossover
 -> mutation
 -> next generation
=========================================================
*/

(() => {

  /* =====================================================
     CONFIG
  ===================================================== */

  const CONFIG = {

    population: 20,

    eliteCount: 4,

    mutationRate: 0.12,

    mutationStrength: 0.38,

    simulationHz: 30,

    maxSteps:
      30 * 60 * 3,

    gravity: 1420,

    flapVelocity: -455,

    baseSpeed: 190,

    maxSpeed: 400,

    playerRadius: 13,

    gateWidth: 62,

    startGap: 175,

    minGap: 108,

    minSpawnDistance: 250,

    maxSpawnDistance: 340,

    /*
      How much work the browser performs
      per animation frame.
    */

    stepsPerFrame: 5
  };


  /* =====================================================
     STATE
  ===================================================== */

  const lab = {

    open: false,

    running: false,

    generation: 0,

    step: 0,

    population: [],

    bestEver: null,

    generationBest: null,

    generationAverage: 0,

    history: [],

    seed: 0x51a7e,

    selectedAgent: 0,

    speedMode: 1
  };


  /* =====================================================
     RANDOM
  ===================================================== */

  function random() {

    lab.seed =
      (
        lab.seed *
        1664525 +
        1013904223
      ) >>> 0;

    return lab.seed / 4294967296;
  }


  function randomRange(min, max) {

    return (
      min +
      random() *
      (max - min)
    );
  }


  function gaussian() {

    let u = 0;
    let v = 0;

    while (u === 0) {
      u = random();
    }

    while (v === 0) {
      v = random();
    }

    return Math.sqrt(
      -2 *
      Math.log(u)
    ) *
      Math.cos(
        2 *
        Math.PI *
        v
      );
  }


  function clamp(value, min, max) {

    return Math.max(
      min,
      Math.min(max, value)
    );
  }


  /* =====================================================
     NEURAL NETWORK
     
     6 inputs
       ↓
     8 hidden neurons
       ↓
     1 output

     Inputs:
       playerY
       velocityY
       gateDistance
       gateCenter
       gapSize
       speed
  ===================================================== */

  class Brain {

    constructor() {

      this.inputSize = 6;

      this.hiddenSize = 8;

      this.weights1 =
        Array.from(
          {
            length:
              this.inputSize *
              this.hiddenSize
          },
          () =>
            gaussian() * 0.8
        );


      this.bias1 =
        Array.from(
          {
            length:
              this.hiddenSize
          },
          () =>
            gaussian() * 0.2
        );


      this.weights2 =
        Array.from(
          {
            length:
              this.hiddenSize
          },
          () =>
            gaussian() * 0.8
        );


      this.bias2 =
        gaussian() * 0.2;
    }


    clone() {

      const copy =
        new Brain();


      copy.weights1 =
        [...this.weights1];

      copy.bias1 =
        [...this.bias1];

      copy.weights2 =
        [...this.weights2];

      copy.bias2 =
        this.bias2;


      return copy;
    }


    activate(inputs) {

      const hidden =
        new Array(
          this.hiddenSize
        );


      for (
        let h = 0;
        h < this.hiddenSize;
        h++
      ) {

        let sum =
          this.bias1[h];


        for (
          let i = 0;
          i < this.inputSize;
          i++
        ) {

          sum +=
            inputs[i] *
            this.weights1[
              h *
                this.inputSize +
              i
            ];
        }


        /*
          tanh gives the hidden layer
          a smooth nonlinear response.
        */

        hidden[h] =
          Math.tanh(sum);
      }


      let output =
        this.bias2;


      for (
        let h = 0;
        h < this.hiddenSize;
        h++
      ) {

        output +=
          hidden[h] *
          this.weights2[h];
      }


      /*
        Sigmoid gives 0 → 1.
      */

      return 1 /
        (
          1 +
          Math.exp(
            -output
          )
        );
    }


    mutate(
      rate =
        CONFIG.mutationRate,
      strength =
        CONFIG.mutationStrength
    ) {

      for (
        let i = 0;
        i <
        this.weights1.length;
        i++
      ) {

        if (
          random() <
          rate
        ) {

          this.weights1[i] +=
            gaussian() *
            strength;
        }
      }


      for (
        let i = 0;
        i <
        this.bias1.length;
        i++
      ) {

        if (
          random() <
          rate
        ) {

          this.bias1[i] +=
            gaussian() *
            strength;
        }
      }


      for (
        let i = 0;
        i <
        this.weights2.length;
        i++
      ) {

        if (
          random() <
          rate
        ) {

          this.weights2[i] +=
            gaussian() *
            strength;
        }
      }


      if (
        random() <
        rate
      ) {

        this.bias2 +=
          gaussian() *
          strength;
      }


      return this;
    }


    static crossover(
      a,
      b
    ) {

      const child =
        new Brain();


      for (
        let i = 0;
        i <
        child.weights1.length;
        i++
      ) {

        child.weights1[i] =
          random() < 0.5
            ? a.weights1[i]
            : b.weights1[i];
      }


      for (
        let i = 0;
        i <
        child.bias1.length;
        i++
      ) {

        child.bias1[i] =
          random() < 0.5
            ? a.bias1[i]
            : b.bias1[i];
      }


      for (
        let i = 0;
        i <
        child.weights2.length;
        i++
      ) {

        child.weights2[i] =
          random() < 0.5
            ? a.weights2[i]
            : b.weights2[i];
      }


      child.bias2 =
        random() < 0.5
          ? a.bias2
          : b.bias2;


      return child;
    }
  }


  /* =====================================================
     AGENT
  ===================================================== */

  class Agent {

    constructor(
      brain = null,
      id = 0
    ) {

      this.id = id;

      this.brain =
        brain ||
        new Brain();


      this.reset();
    }


    reset() {

      this.y = 0.5;

      this.vy = 0;

      this.worldX = 0;

      this.time = 0;

      this.gates = [];

      this.nextGate =
        350;


      this.score = 0;

      this.gatesCleared = 0;

      this.shards = 0;

      this.nearMisses = 0;

      this.alive = true;

      this.steps = 0;

      this.fitness = 0;

      this.combo = 1;

      this.comboTimer = 0;


      this.seed =
        (
          lab.seed ^
          (
            this.id *
            7919
          )
        ) >>> 0;


      this.spawnInitialGates();
    }


    rand() {

      this.seed =
        (
          this.seed *
          1664525 +
          1013904223
        ) >>> 0;

      return (
        this.seed /
        4294967296
      );
    }


    spawnInitialGates() {

      let x =
        350;


      for (
        let i = 0;
        i < 8;
        i++
      ) {

        this.createGate(x);


        x +=
          250 +
          this.rand() * 90;
      }


      this.nextGate =
        x;
    }


    createGate(x) {

      const gap =
        Math.max(
          CONFIG.minGap,

          CONFIG.startGap -
            (
              this.time /
              90
            ) *
            (
              CONFIG.startGap -
              CONFIG.minGap
            )
        );


      const center =
        0.16 +
        this.rand() *
        0.68;


      this.gates.push({

        x,

        center,

        gap,

        passed: false
      });
    }


    nearestGate() {

      for (
        const gate of
        this.gates
      ) {

        if (
          gate.x >
          this.worldX -
          40
        ) {

          return gate;
        }
      }


      return null;
    }


    observation() {

      const gate =
        this.nearestGate();


      if (!gate) {

        return [
          this.y,
          clamp(
            this.vy / 700,
            -1,
            1
          ),
          1,
          0.5,
          0.5,
          clamp(
            this.speed() /
            CONFIG.maxSpeed,
            0,
            1
          )
        ];
      }


      const dx =
        (
          gate.x -
          this.worldX
        ) /
        600;


      return [

        /*
          Player Y
        */

        clamp(
          this.y,
          0,
          1
        ),


        /*
          Vertical velocity
        */

        clamp(
          this.vy / 700,
          -1,
          1
        ),


        /*
          Gate distance
        */

        clamp(
          dx,
          -1,
          1
        ),


        /*
          Gap center
        */

        gate.center,


        /*
          Gap size
        */

        clamp(
          gate.gap /
          220,
          0,
          1
        ),


        /*
          Current speed
        */

        clamp(
          this.speed() /
          CONFIG.maxSpeed,
          0,
          1
        )
      ];
    }


    speed() {

      return Math.min(

        CONFIG.maxSpeed,

        CONFIG.baseSpeed +
        this.time * 4.2 +
        (
          1 -
          Math.exp(
            -this.time /
            48
          )
        ) *
        35
      );
    }


    pulse() {

      this.vy =
        CONFIG.flapVelocity;
    }


    update(dt) {

      if (!this.alive) {
        return;
      }


      this.steps++;

      this.time += dt;


      /*
        AI chooses an action.
      */

      const output =
        this.brain.activate(
          this.observation()
        );


      if (
        output >
        0.5
      ) {

        this.pulse();
      }


      /*
        Physics.
      */

      this.vy +=
        CONFIG.gravity *
        dt;


      this.y +=
        (
          this.vy *
          dt
        ) /
        520;


      /*
        World moves forward.
      */

      this.worldX +=
        this.speed() *
        dt;


      /*
        Generate gates.
      */

      while (
        this.nextGate <
        this.worldX +
        1000
      ) {

        this.nextGate +=
          250 +
          this.rand() *
          90;


        this.createGate(
          this.nextGate
        );
      }


      this.checkGates();


      /*
        Out of bounds.
      */

      if (
        this.y < -0.08 ||
        this.y > 1.08
      ) {

        this.die();
      }


      /*
        Combo timeout.
      */

      if (
        this.comboTimer > 0
      ) {

        this.comboTimer -=
          dt;

      } else {

        this.combo =
          Math.max(
            1,
            this.combo -
            dt * 0.5
          );
      }


      /*
        Fitness is continuously updated,
        so survival itself has value.
      */

      this.fitness =
        this.time * 3 +

        this.gatesCleared * 120 +

        this.shards * 35 +

        this.nearMisses * 50 +

        this.score * 0.5;
    }


    checkGates() {

      for (
        const gate of
        this.gates
      ) {

        if (
          gate.passed
        ) {
          continue;
        }


        /*
          Has the agent crossed
          the gate?
        */

        if (
          gate.x <
          this.worldX
        ) {

          gate.passed = true;


          const distance =
            Math.abs(
              this.y -
              gate.center
            );


          /*
            Collision.

            The agent gets a little
            tolerance around the gap.
          */

          const halfGap =
            (
              gate.gap /
              2
            ) /
            520;


          const safe =
            Math.abs(
              this.y -
              gate.center
            ) <
            halfGap;


          if (!safe) {

            this.die();

            return;
          }


          /*
            SUCCESS
          */

          this.gatesCleared++;

          this.comboTimer =
            2.5;

          this.combo =
            Math.min(
              15,
              this.combo +
              0.7
            );


          this.score +=
            10 *
            Math.floor(
              this.combo
            );


          /*
            Precision bonus.
          */

          if (
            distance <
            gate.gap /
            520 *
            0.16
          ) {

            this.score +=
              20;

            this.nearMisses++;
          }
        }
      }


      /*
        Remove old gates.
      */

      this.gates =
        this.gates.filter(
          gate =>
            gate.x >
            this.worldX -
            100
        );
    }


    die() {

      if (
        !this.alive
      ) {
        return;
      }


      this.alive =
        false;


      /*
        Small survival bonus.
      */

      this.fitness +=
        this.time * 2;
    }
  }


  /* =====================================================
     EVOLUTION
  ===================================================== */

  function createPopulation() {

    lab.population =
      [];


    for (
      let i = 0;
      i <
      CONFIG.population;
      i++
    ) {

      lab.population.push(
        new Agent(
          null,
          i
        )
      );
    }
  }


  function evaluateGeneration() {

    const alive =
      lab.population.filter(
        agent =>
          agent.alive
      );


    /*
      If everybody dies, generation
      ends immediately.
    */

    if (
      alive.length === 0 ||
      lab.step >=
        CONFIG.maxSteps
    ) {

      finishGeneration();
    }
  }


  function finishGeneration() {

    lab.running =
      false;


    /*
      Highest fitness first.
    */

    lab.population.sort(
      (a, b) =>
        b.fitness -
        a.fitness
    );


    const best =
      lab.population[0];


    lab.generationBest =
      best;


    lab.generationAverage =
      lab.population.reduce(
        (sum, agent) =>
          sum +
          agent.fitness,
        0
      ) /
      lab.population.length;


    lab.history.push({

      generation:
        lab.generation,

      best:
        best.fitness,

      average:
        lab.generationAverage,

      gates:
        best.gatesCleared,

      time:
        best.time
    });


    if (
      !lab.bestEver ||
      best.fitness >
        lab.bestEver.fitness
    ) {

      lab.bestEver =
        cloneAgent(
          best
        );
    }


    lab.generation++;

    updateLabUI();


    /*
      Don't automatically breed immediately.

      This gives the user a chance to
      inspect the generation.
    */
  }


  function cloneAgent(agent) {

    const clone =
      new Agent(
        agent.brain.clone(),
        agent.id
      );


    clone.fitness =
      agent.fitness;

    clone.gatesCleared =
      agent.gatesCleared;

    clone.time =
      agent.time;

    clone.score =
      agent.score;

    clone.shards =
      agent.shards;

    clone.nearMisses =
      agent.nearMisses;


    return clone;
  }


  function breedNextGeneration() {

    /*
      If generation hasn't been
      evaluated, finish it first.
    */

    if (
      lab.running
    ) {
      return;
    }


    /*
      Make sure population has
      fitness ordering.
    */

    lab.population.sort(
      (a, b) =>
        b.fitness -
        a.fitness
    );


    const elites =
      lab.population.slice(
        0,
        CONFIG.eliteCount
      );


    const next =
      [];


    /*
      ELITISM

      The best agents survive
      unchanged.
    */

    for (
      let i = 0;
      i <
      CONFIG.eliteCount;
      i++
    ) {

      next.push(

        new Agent(
          elites[i]
            .brain
            .clone(),

          i
        )
      );
    }


    /*
      CHILDREN

      Randomly select parents
      from the elite group.
    */

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
          childBrain,
          next.length
        )
      );
    }


    lab.population =
      next;


    lab.step = 0;

    lab.running =
      true;


    updateLabUI();
  }


  function startEvolution() {

    if (
      lab.population.length === 0
    ) {

      lab.generation = 0;

      lab.step = 0;

      lab.history = [];

      lab.bestEver = null;

      createPopulation();
    }


    lab.running =
      true;


    updateLabUI();
  }


  function resetEvolution() {

    lab.running =
      false;

    lab.generation =
      0;

    lab.step =
      0;

    lab.history =
      [];

    lab.bestEver =
      null;

    lab.generationBest =
      null;

    lab.population =
      [];


    createPopulation();

    updateLabUI();
  }


  /* =====================================================
     SIMULATION LOOP
  ===================================================== */

  let lastFrame =
    performance.now();


  function simulationLoop(now) {

    const realDt =
      Math.min(
        (
          now -
          lastFrame
        ) /
        1000,
        0.05
      );


    lastFrame =
      now;


    if (
      lab.running
    ) {

      /*
        Multiple tiny steps per frame.

        This makes the evolutionary
        simulation much faster than
        playing manually.
      */

      const dt =
        1 /
        CONFIG.simulationHz;


      const count =
        Math.max(
          1,
          Math.floor(
            CONFIG.stepsPerFrame *
            lab.speedMode
          )
        );


      for (
        let i = 0;
        i < count;
        i++
      ) {

        lab.step++;


        for (
          const agent of
          lab.population
        ) {

          agent.update(dt);
        }


        evaluateGeneration();


        if (
          !lab.running
        ) {
          break;
        }
      }


      updateLabUI();
    }


    drawAgentPreview();


    requestAnimationFrame(
      simulationLoop
    );
  }


  /* =====================================================
     UI CREATION
  ===================================================== */

  const style =
    document.createElement(
      "style"
    );


  style.textContent = `

    #pulseLabButton {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 9000;

      border: 1px solid
        rgba(98,231,255,.45);

      background:
        rgba(5,14,25,.92);

      color: #d9fbff;

      padding:
        11px 15px;

      border-radius:
        12px;

      font:
        800 12px
        system-ui;

      letter-spacing:
        .12em;

      cursor: pointer;

      box-shadow:
        0 0 25px
        rgba(98,231,255,.12);

      backdrop-filter:
        blur(12px);
    }


    #pulseLabButton:hover {
      border-color:
        #62e7ff;

      box-shadow:
        0 0 28px
        rgba(98,231,255,.28);
    }


    #pulseLab {
      position: fixed;
      inset: 0;
      z-index: 10000;

      display: none;

      background:
        radial-gradient(
          circle at 50% 0%,
          #102b40 0%,
          #050c16 52%,
          #02060b 100%
        );

      color: #d9fbff;

      font-family:
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        sans-serif;

      overflow: auto;
    }


    #pulseLab.open {
      display: block;
    }


    .pl-header {
      display: flex;
      align-items: center;
      justify-content: space-between;

      padding:
        18px 22px;

      border-bottom:
        1px solid
        rgba(98,231,255,.13);
    }


    .pl-title {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: .08em;
    }


    .pl-subtitle {
      margin-top: 3px;
      color:
        rgba(217,251,255,.52);

      font-size: 11px;
      letter-spacing: .08em;
    }


    .pl-close {
      border: 0;
      background:
        rgba(255,255,255,.06);

      color: white;

      border-radius: 10px;

      padding: 9px 13px;

      cursor: pointer;
    }


    .pl-main {
      max-width: 1150px;
      margin: auto;
      padding: 20px;
    }


    .pl-stats {
      display: grid;

      grid-template-columns:
        repeat(4, 1fr);

      gap: 10px;

      margin-bottom: 14px;
    }


    .pl-stat {
      padding: 14px;

      background:
        rgba(255,255,255,.035);

      border:
        1px solid
        rgba(98,231,255,.12);

      border-radius: 13px;
    }


    .pl-stat-label {
      font-size: 9px;
      letter-spacing: .15em;
      opacity: .45;
    }


    .pl-stat-value {
      margin-top: 5px;

      font-size: 21px;
      font-weight: 900;
    }


    .pl-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;

      margin-bottom: 14px;
    }


    .pl-controls button {
      border:
        1px solid
        rgba(98,231,255,.25);

      background:
        rgba(98,231,255,.07);

      color:
        #d9fbff;

      padding:
        10px 14px;

      border-radius:
        10px;

      cursor: pointer;

      font-weight:
        800;
    }


    .pl-controls button:hover {
      background:
        rgba(98,231,255,.15);

      border-color:
        #62e7ff;
    }


    #plSpeed {
      display: flex;
      align-items: center;
      gap: 7px;

      margin-left: auto;

      color:
        rgba(217,251,255,.6);

      font-size: 11px;
    }


    #plSpeed button {
      padding:
        7px 10px;
    }


    .pl-grid {
      display: grid;

      grid-template-columns:
        minmax(0, 1.7fr)
        minmax(280px, 1fr);

      gap: 14px;
    }


    .pl-card {
      background:
        rgba(255,255,255,.035);

      border:
        1px solid
        rgba(98,231,255,.12);

      border-radius: 15px;

      overflow: hidden;
    }


    .pl-card-title {
      padding:
        12px 14px;

      border-bottom:
        1px solid
        rgba(98,231,255,.08);

      font-size: 10px;
      font-weight: 900;
      letter-spacing: .14em;

      color:
        rgba(217,251,255,.65);
    }


    #plPreview {
      width: 100%;
      height: 270px;

      display: block;

      background:
        #040b13;
    }


    .pl-agent {
      display: grid;

      grid-template-columns:
        42px
        1fr
        90px
        75px;

      gap: 8px;

      align-items: center;

      padding:
        9px 12px;

      border-bottom:
        1px solid
        rgba(255,255,255,.045);

      cursor: pointer;
    }


    .pl-agent:hover {
      background:
        rgba(98,231,255,.06);
    }


    .pl-rank {
      font-weight: 900;
      opacity: .45;
    }


    .pl-agent-name {
      font-weight: 800;
      font-size: 12px;
    }


    .pl-bar {
      height: 5px;

      border-radius: 99px;

      background:
        rgba(255,255,255,.07);

      overflow: hidden;
    }


    .pl-bar-fill {
      height: 100%;

      background:
        #62e7ff;

      border-radius: 99px;
    }


    .pl-fitness {
      text-align: right;

      font:
        800 11px
        monospace;
    }


    .pl-gates {
      text-align: right;

      font:
        700 10px
        monospace;

      opacity: .55;
    }


    #plLog {
      padding: 14px;

      height: 170px;

      overflow: auto;

      font:
        11px
        monospace;

      line-height: 1.7;

      color:
        rgba(217,251,255,.65);
    }


    .pl-best {
      color:
        #62e7ff;

      font-weight:
        900;
    }


    @media (max-width: 760px) {

      .pl-stats {
        grid-template-columns:
          repeat(2, 1fr);
      }


      .pl-grid {
        grid-template-columns:
          1fr;
      }


      #plSpeed {
        margin-left: 0;
        width: 100%;
      }
    }

  `;


  document.head.appendChild(
    style
  );


  /* =====================================================
     DOM
  ===================================================== */

  const button =
    document.createElement(
      "button"
    );


  button.id =
    "pulseLabButton";

  button.textContent =
    "⚡ AI LAB";


  document.body.appendChild(
    button
  );


  const labRoot =
    document.createElement(
      "div"
    );


  labRoot.id =
    "pulseLab";


  labRoot.innerHTML = `

    <div class="pl-header">

      <div>

        <div class="pl-title">
          PULSE LAB
        </div>

        <div class="pl-subtitle">
          EVOLUTIONARY FLIGHT INTELLIGENCE
        </div>

      </div>


      <button
        class="pl-close"
        id="plClose"
      >
        CLOSE
      </button>

    </div>


    <div class="pl-main">

      <div class="pl-stats">

        <div class="pl-stat">
          <div class="pl-stat-label">
            GENERATION
          </div>

          <div
            class="pl-stat-value"
            id="plGeneration"
          >
            0
          </div>
        </div>


        <div class="pl-stat">
          <div class="pl-stat-label">
            BEST FITNESS
          </div>

          <div
            class="pl-stat-value"
            id="plBest"
          >
            0
          </div>
        </div>


        <div class="pl-stat">
          <div class="pl-stat-label">
            BEST GATES
          </div>

          <div
            class="pl-stat-value"
            id="plGates"
          >
            0
          </div>
        </div>


        <div class="pl-stat">
          <div class="pl-stat-label">
            STATUS
          </div>

          <div
            class="pl-stat-value"
            id="plStatus"
          >
            READY
          </div>
        </div>

      </div>


      <div class="pl-controls">

        <button id="plStart">
          ▶ START EVOLUTION
        </button>


        <button id="plBreed">
          🧬 BREED NEXT
        </button>


        <button id="plReset">
          ↻ RESET
        </button>


        <div id="plSpeed">

          SIM SPEED

          <button
            data-speed="1"
          >
            1×
          </button>

          <button
            data-speed="3"
          >
            3×
          </button>

          <button
            data-speed="8"
          >
            8×
          </button>

          <button
            data-speed="20"
          >
            20×
          </button>

        </div>

      </div>


      <div class="pl-grid">

        <div class="pl-card">

          <div class="pl-card-title">
            LIVE POPULATION
          </div>

          <canvas
            id="plPreview"
          ></canvas>

          <div id="plAgents"></div>

        </div>


        <div>

          <div class="pl-card">

            <div class="pl-card-title">
              EVOLUTION LOG
            </div>

            <div id="plLog">
              PULSE LAB initialized.<br>
              20 neural agents ready.
            </div>

          </div>


          <div
            class="pl-card"
            style="margin-top:14px"
          >

            <div class="pl-card-title">
              HOW IT LEARNS
            </div>

            <div
              style="
                padding:15px;
                font-size:12px;
                line-height:1.7;
                color:rgba(217,251,255,.62)
              "
            >

              Each agent receives six
              observations about the world.

              <br><br>

              Its tiny neural network decides:

              <br>

              <b style="color:#62e7ff">
                PULSE
              </b>
              or
              <b style="color:#fff">
                DON'T PULSE
              </b>

              <br><br>

              Bad agents die.

              Good agents reproduce.

              The best brains survive unchanged.

              The rest are created through
              <b style="color:#62e7ff">
                crossover + mutation
              </b>.

              <br><br>

              No pretrained model.
              No API.
              No server.

              <br><br>

              Everything runs locally
              inside your browser.

            </div>

          </div>

        </div>

      </div>

    </div>
  `;


  document.body.appendChild(
    labRoot
  );


  /* =====================================================
     UI REFERENCES
  ===================================================== */

  const closeButton =
    document.getElementById(
      "plClose"
    );

  const startEvolutionButton =
    document.getElementById(
      "plStart"
    );

  const breedButton =
    document.getElementById(
      "plBreed"
    );

  const resetButton =
    document.getElementById(
      "plReset"
    );

  const generationElement =
    document.getElementById(
      "plGeneration"
    );

  const bestElement =
    document.getElementById(
      "plBest"
    );

  const gatesElement =
    document.getElementById(
      "plGates"
    );

  const statusElement =
    document.getElementById(
      "plStatus"
    );

  const agentsElement =
    document.getElementById(
      "plAgents"
    );

  const logElement =
    document.getElementById(
      "plLog"
    );

  const preview =
    document.getElementById(
      "plPreview"
    );

  const previewCtx =
    preview.getContext(
      "2d"
    );


  /* =====================================================
     OPEN / CLOSE
  ===================================================== */

  function openLab() {

    lab.open =
      true;

    labRoot.classList.add(
      "open"
    );

    /*
      Pause the real game if possible.
    */

    if (
      window.PulseWingAI &&
      window.PulseWingAI.getState
    ) {

      const state =
        window.PulseWingAI
          .getState();

      if (
        state.gameState ===
        "playing"
      ) {

        const pause =
          document.getElementById(
            "pauseButton"
          );

        if (
          pause &&
          pause.textContent ===
          "PAUSE"
        ) {

          pause.click();
        }
      }
    }


    updateLabUI();
  }


  function closeLab() {

    lab.open =
      false;

    labRoot.classList.remove(
      "open"
    );
  }


  button.addEventListener(
    "click",
    openLab
  );


  closeButton.addEventListener(
    "click",
    closeLab
  );


  /* =====================================================
     CONTROLS
  ===================================================== */

  startEvolutionButton.addEventListener(
    "click",
    () => {

      if (
        lab.running
      ) {

        lab.running =
          false;

      } else {

        startEvolution();
      }


      updateLabUI();
    }
  );


  breedButton.addEventListener(
    "click",
    () => {

      breedNextGeneration();

      log(
        `GEN ${lab.generation}: new population bred.`
      );

      updateLabUI();
    }
  );


  resetButton.addEventListener(
    "click",
    () => {

      resetEvolution();

      log(
        "Population reset. Fresh genomes created."
      );
    }
  );


  document
    .querySelectorAll(
      "#plSpeed button"
    )
    .forEach(
      speedButton => {

        speedButton.addEventListener(
          "click",
          () => {

            lab.speedMode =
              Number(
                speedButton
                  .dataset
                  .speed
              );

            updateLabUI();
          }
        );
      }
    );


  /* =====================================================
     LOG
  ===================================================== */

  function log(message) {

    const line =
      document.createElement(
        "div"
      );


    line.textContent =
      `[GEN ${lab.generation}] ${message}`;


    logElement.prepend(
      line
    );


    while (
      logElement.children.length >
      40
    ) {

      logElement.lastChild
        .remove();
    }
  }


  /* =====================================================
     UI
  ===================================================== */

  function updateLabUI() {

    generationElement.textContent =
      String(
        lab.generation
      );


    const best =
      lab.bestEver ||
      lab.generationBest;


    bestElement.textContent =
      best
        ? Math.floor(
            best.fitness
          )
        : "0";


    gatesElement.textContent =
      best
        ? String(
            best.gatesCleared
          )
        : "0";


    statusElement.textContent =
      lab.running
        ? "EVOLVING"
        : lab.population.length === 0
          ? "READY"
          : "BREED";


    startEvolutionButton.textContent =
      lab.running
        ? "Ⅱ PAUSE EVOLUTION"
        : "▶ START EVOLUTION";


    agentsElement.innerHTML =
      "";


    const sorted =
      [...lab.population]
        .sort(
          (a, b) =>
            b.fitness -
            a.fitness
        );


    const maxFitness =
      Math.max(
        1,
        ...sorted.map(
          a =>
            a.fitness
        )
      );


    sorted.forEach(
      (agent, index) => {

        const row =
          document.createElement(
            "div"
          );


        row.className =
          "pl-agent";


        row.innerHTML = `

          <div class="pl-rank">
            #${index + 1}
          </div>

          <div>

            <div class="pl-agent-name">
              AGENT ${agent.id}
              ${
                index === 0
                  ? " ★"
                  : ""
              }
            </div>

            <div class="pl-bar">

              <div
                class="pl-bar-fill"
                style="
                  width:${
                    (
                      agent.fitness /
                      maxFitness
                    ) *
                    100
                  }%
                "
              ></div>

            </div>

          </div>

          <div class="pl-fitness">
            ${Math.floor(
              agent.fitness
            )}
          </div>

          <div class="pl-gates">
            ${agent.gatesCleared}
            gates
          </div>
        `;


        agentsElement.appendChild(
          row
        );
      }
    );


    if (
      lab.generationBest &&
      lab.history.length >
      0
    ) {

      const previous =
        lab.history[
          lab.history.length - 1
        ];


      if (
        previous &&
        previous.generation ===
        lab.generation
      ) {

        log(
          `Best fitness: ${Math.floor(
            previous.best
          )} | Gates: ${
            previous.gates
          } | Survival: ${
            previous.time.toFixed(1)
          }s`
        );
      }
    }
  }


  /* =====================================================
     PREVIEW
  ===================================================== */

  function resizePreview() {

    const rect =
      preview.getBoundingClientRect();


    const dpr =
      Math.min(
        window.devicePixelRatio || 1,
        2
      );


    preview.width =
      rect.width * dpr;


    preview.height =
      rect.height * dpr;


    previewCtx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );
  }


  window.addEventListener(
    "resize",
    resizePreview
  );


  resizePreview();


  function drawAgentPreview() {

    if (
      !lab.open
    ) {
      return;
    }


    const w =
      preview.clientWidth;


    const h =
      preview.clientHeight;


    previewCtx.fillStyle =
      "#030911";


    previewCtx.fillRect(
      0,
      0,
      w,
      h
    );


    /*
      Horizon lines.
    */

    previewCtx.strokeStyle =
      "rgba(98,231,255,.08)";


    for (
      let y = 30;
      y < h;
      y += 40
    ) {

      previewCtx.beginPath();

      previewCtx.moveTo(
        0,
        y
      );

      previewCtx.lineTo(
        w,
        y
      );

      previewCtx.stroke();
    }


    if (
      lab.population.length === 0
    ) {

      previewCtx.fillStyle =
        "rgba(217,251,255,.3)";

      previewCtx.font =
        "12px system-ui";

      previewCtx.textAlign =
        "center";

      previewCtx.fillText(
        "PRESS START EVOLUTION",
        w / 2,
        h / 2
      );

      return;
    }


    /*
      Draw each agent as a tiny
      glowing particle.

      This gives a visual sense
      of the population learning.
    */

    lab.population.forEach(
      (agent, index) => {

        const x =
          70 +
          (
            (
              agent.worldX %
              700
            ) /
            700
          ) *
          (
            w - 120
          );


        const y =
          clamp(
            agent.y,
            0,
            1
          ) *
          (
            h - 35
          ) +
          15;


        previewCtx.globalAlpha =
          agent.alive
            ? 0.8
            : 0.13;


        previewCtx.fillStyle =
          index === 0
            ? "#ffffff"
            : "#62e7ff";


        previewCtx.shadowBlur =
          index === 0
            ? 14
            : 5;


        previewCtx.shadowColor =
          "#62e7ff";


        previewCtx.beginPath();

        previewCtx.arc(
          x,
          y,
          index === 0
            ? 4
            : 2.5,
          0,
          Math.PI * 2
        );

        previewCtx.fill();
      }
    );


    previewCtx.globalAlpha =
      1;


    previewCtx.shadowBlur =
      0;


    /*
      Generation label.
    */

    previewCtx.fillStyle =
      "rgba(217,251,255,.4)";

    previewCtx.font =
      "10px monospace";

    previewCtx.textAlign =
      "left";

    previewCtx.fillText(
      `GEN ${lab.generation} • ${
        lab.population.filter(
          a => a.alive
        ).length
      } ALIVE`,
      12,
      18
    );
  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.PulseLab = {

    version:
      "1.0",


    start() {

      startEvolution();

      return this.getState();
    },


    pause() {

      lab.running =
        false;

      updateLabUI();

      return this.getState();
    },


    breed() {

      breedNextGeneration();

      return this.getState();
    },


    reset() {

      resetEvolution();

      return this.getState();
    },


    setSpeed(speed) {

      lab.speedMode =
        clamp(
          Number(speed) || 1,
          1,
          20
        );


      return this.getState();
    },


    getState() {

      return {

        version:
          this.version,

        open:
          lab.open,

        running:
          lab.running,

        generation:
          lab.generation,

        speed:
          lab.speedMode,

        population:
          lab.population.map(
            agent => ({

              id:
                agent.id,

              alive:
                agent.alive,

              fitness:
                agent.fitness,

              score:
                agent.score,

              gates:
                agent.gatesCleared,

              time:
                agent.time,

              shards:
                agent.shards
            })
          ),

        bestEver:
          lab.bestEver
            ? {

                fitness:
                  lab.bestEver.fitness,

                gates:
                  lab.bestEver
                    .gatesCleared,

                time:
                  lab.bestEver.time
              }
            : null
      };
    }
  };


  /* =====================================================
     START LOOP
  ===================================================== */

  requestAnimationFrame(
    simulationLoop
  );


  /*
    Don't start evolution automatically.

    User gets control over when the
    first generation begins.
  */

  createPopulation();

  updateLabUI();

})();
