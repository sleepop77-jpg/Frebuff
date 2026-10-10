
"use strict";

/*
  PULSEWING AI LAB
  Standalone AI Lab for the existing game.
  Uses window.PulseWingAI from app.js.
*/

(() => {
  if (window.__PULSEWING_LAB_LOADED__) return;
  window.__PULSEWING_LAB_LOADED__ = true;

  const API = () => window.PulseWingAI;
  const SAVE_KEY = "pulsewing-ai-lab-v1";
  const POPULATION_SIZE = 24;
  const ELITE_COUNT = 4;
  const INPUTS = 4;
  const HIDDEN = 8;
  const WEIGHT_COUNT = INPUTS * HIDDEN + HIDDEN +
    HIDDEN + 1;

  const lab = {
    open: false,
    training: false,
    controlling: false,
    generation: 1,
    episode: 0,
    bestFitness: 0,
    bestGates: 0,
    currentFitness: 0,
    population: [],
    fitnesses: [],
    brainIndex: 0,
    brain: null,
    lastAction: 0,
    lastDistance: Infinity,
    lastY: 0,
    episodeStarted: false,
    episodesThisGeneration: 0,
    timer: 0,
    alive: false,
    best: null
  };

  function randomWeight() {
    return Math.random() * 2 - 1;
  }

  function createBrain() {
    return Array.from(
      { length: WEIGHT_COUNT },
      randomWeight
    );
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
  }

  function think(brain, inputs) {
    let p = 0;
    const hidden = [];

    for (let h = 0; h < HIDDEN; h++) {
      let sum = brain[p++];
      for (let i = 0; i < INPUTS; i++) {
        sum += inputs[i] * brain[p++];
      }
      hidden.push(Math.tanh(sum));
    }

    let output = brain[p++];
    for (let h = 0; h < HIDDEN; h++) {
      output += hidden[h] * brain[p++];
    }

    return sigmoid(output);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getInputs(state) {
    const gate = state.nearestGate;
    const player = state.player;

    if (!gate || !player) return [0, 0, 0, 0];

    const distance = gate.x - player.x;
    const height = Math.max(
      300,
      document.getElementById("gameCanvas")?.clientHeight || 420
    );

    return [
      clamp((player.y - gate.center) / height, -1, 1),
      clamp(player.vy / 650, -1, 1),
      clamp(distance / 420, -1, 1),
      clamp(gate.gap / height, 0, 1)
    ];
  }

  function mutate(brain, rate = 0.16) {
    return brain.map(weight => {
      if (Math.random() < rate) {
        return clamp(weight + randomWeight() * 0.65, -3, 3);
      }
      return weight;
    });
  }

  function crossover(a, b) {
    return a.map((weight, i) =>
      Math.random() < 0.5 ? weight : b[i]
    );
  }

  function createPopulation() {
    lab.population = Array.from(
      { length: POPULATION_SIZE },
      createBrain
    );
    lab.fitnesses = [];
    lab.brainIndex = 0;
  }

  function evolve() {
    const ranked = lab.population
      .map((brain, i) => ({
        brain,
        fitness: lab.fitnesses[i] || 0
      }))
      .sort((a, b) => b.fitness - a.fitness);

    const winner = ranked[0];
    if (winner && winner.fitness > lab.bestFitness) {
      lab.bestFitness = winner.fitness;
      lab.best = winner.brain.slice();
      lab.bestGates = Math.max(lab.bestGates, lab.lastGates || 0);
    }

    const next = ranked
      .slice(0, ELITE_COUNT)
      .map(item => item.brain.slice());

    while (next.length < POPULATION_SIZE) {
      const a = ranked[Math.floor(Math.random() * Math.min(8, ranked.length))].brain;
      const b = ranked[Math.floor(Math.random() * Math.min(8, ranked.length))].brain;
      next.push(mutate(crossover(a, b)));
    }

    lab.population = next;
    lab.fitnesses = [];
    lab.brainIndex = 0;
    lab.generation++;
    lab.episodesThisGeneration = 0;
    saveBest(false);
    updateUI();
  }

  function saveBest(showMessage = true) {
    if (!lab.best) {
      if (showMessage) alert("Train the AI first to create a best brain.");
      return;
    }

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        brain: lab.best,
        fitness: lab.bestFitness,
        gates: lab.bestGates,
        generation: lab.generation,
        savedAt: new Date().toISOString()
      }));

      if (showMessage) {
        const status = document.getElementById("pw-status");
        if (status) status.textContent = "Best brain saved on this device.";
      }
    } catch (error) {
      console.error("PULSEWING save failed:", error);
      alert("Could not save the brain. Check device storage.");
    }
  }

  function loadBest() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (saved && Array.isArray(saved.brain) &&
          saved.brain.length === WEIGHT_COUNT) {
        lab.best = saved.brain;
        lab.bestFitness = Number(saved.fitness) || 0;
        lab.bestGates = Number(saved.gates) || 0;
      }
    } catch (error) {
      console.warn("Could not load saved AI brain:", error);
    }
  }

  function stopControl() {
    lab.controlling = false;
    lab.training = false;
    lab.alive = false;
    const button = document.getElementById("pw-train");
    if (button) button.textContent = "Start Training";
    updateUI();
  }

  function startEpisode() {
    if (!API()) {
      setStatus("Game API not found. Make sure app.js loads first.");
      stopControl();
      return;
    }

    lab.brain = lab.population[lab.brainIndex];
    lab.episode++;
    lab.currentFitness = 0;
    lab.lastGates = 0;
    lab.lastAction = 0;
    lab.lastDistance = Infinity;
    lab.episodeStarted = true;
    lab.alive = true;

    API().reset();
    lab.timer = performance.now();
    updateUI();
  }

  function finishEpisode(state) {
    if (!lab.episodeStarted) return;

    lab.episodeStarted = false;
    lab.alive = false;

    const gates = Number(state?.gatesCleared) || 0;
    const score = Number(state?.score) || 0;
    const elapsed = Math.max(0, (performance.now() - lab.timer) / 1000);

    // Gates and score are the main reward; survival adds a small bonus.
    const fitness = gates * 100 + score + Math.min(elapsed, 90) * 0.2;
    lab.lastGates = gates;
    lab.fitnesses[lab.brainIndex] = fitness;
    lab.episodesThisGeneration++;

    if (fitness > lab.bestFitness) {
      lab.bestFitness = fitness;
      lab.bestGates = Math.max(lab.bestGates, gates);
      lab.best = lab.brain.slice();
      saveBest(false);
    }

    if (lab.training) {
setStatus("Episode " + lab.episode + " finished · " +
gates + " gates · restarting next episode...");
lab.brainIndex++;
if (lab.brainIndex >= POPULATION_SIZE) {
evolve();
}
if (lab.training) {
// Start a fresh episode after the game-over state is cleared.
window.setTimeout(() => {
if (lab.training) startEpisode();
}, 350);
}
} else {
      lab.controlling = false;
      updateUI();
    }

    updateUI();
  }

  function tick() {
    const api = API();

    if ((lab.training || lab.controlling) && api) {
      let state = api.getState();

      if (state.gameState === "gameover") {
        finishEpisode(state);
      } else if (state.gameState === "playing") {
        lab.alive = true;
        const inputs = getInputs(state);
        const brain = lab.brain || lab.best;

        if (brain) {
          // Trigger a pulse only when the network predicts it is needed.
          const output = think(brain, inputs);
          if (output > 0.57) {
            api.pulse();
          }
        } else {
          // Safe starter policy until the first brain is saved.
          const gate = state.nearestGate;
          if (gate && state.player.y > gate.center + 8 &&
              state.player.vy > -80 && gate.x - state.player.x < 155) {
            api.pulse();
          }
        }

        // Progress score rewards getting closer to the next gate.
        const nextDistance = state.nearestGate
          ? state.nearestGate.x - state.player.x
          : Infinity;

        if (Number.isFinite(nextDistance) &&
            Number.isFinite(lab.lastDistance)) {
          lab.currentFitness += Math.max(
            0,
            lab.lastDistance - nextDistance
          ) * 0.002;
        }
        lab.lastDistance = nextDistance;
      } else if (lab.training && !lab.episodeStarted) {
        startEpisode();
      }

      updateUI();
    }

    window.requestAnimationFrame(tick);
  }

  function setStatus(message) {
    const el = document.getElementById("pw-status");
    if (el) el.textContent = message;
  }

  function updateUI() {
    const $ = id => document.getElementById(id);
    if (!$("pw-panel")) return;

    $("pw-generation").textContent = lab.generation;
    $("pw-episode").textContent = lab.episode;
    $("pw-best").textContent = Math.round(lab.bestFitness);
    $("pw-gates").textContent = lab.bestGates;
    $("pw-alive").textContent = lab.alive ? "YES" : "NO";
    $("pw-progress").style.width =
      `${Math.min(100, lab.episodesThisGeneration / POPULATION_SIZE * 100)}%`;

    $("pw-train").textContent = lab.training ? "Pause Training" : "Start Training";
    $("pw-control").textContent = lab.controlling ? "Stop AI Control" : "AI Take Control";
  }

  function makeUI() {
    if (document.getElementById("pw-panel")) return;

    const style = document.createElement("style");
    style.textContent = `
      #pw-open{border:1px solid #62e7ff;background:#0b2030;color:#b8f7ff;
        padding:10px 14px;border-radius:10px;font-weight:800;cursor:pointer}
      #pw-panel{position:fixed;inset:0;z-index:99999;display:none;
        align-items:center;justify-content:center;padding:16px;
        background:rgba(1,7,15,.82);font-family:system-ui,sans-serif;color:#eafaff}
      #pw-panel.pw-visible{display:flex}
      #pw-card{width:min(520px,100%);max-height:90vh;overflow:auto;
        background:#081522;border:1px solid #244a67;border-radius:18px;
        padding:20px;box-shadow:0 20px 80px #000}
      #pw-card h2{margin:0;color:#62e7ff;letter-spacing:2px}
      #pw-card p{color:#9bb8c8;font-size:13px;line-height:1.5}
      .pw-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:16px 0}
      .pw-stat{background:#102438;border:1px solid #1e3b51;border-radius:12px;padding:12px}
      .pw-stat small{display:block;color:#8ba9ba;font-size:10px;letter-spacing:1px}
      .pw-stat strong{font-size:24px}
      .pw-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .pw-actions button{border:1px solid #28516a;border-radius:10px;padding:12px;
        color:#eafaff;background:#102438;font-weight:750;cursor:pointer}
      .pw-actions button:first-child{background:#0c5365;border-color:#62e7ff}
      #pw-progress-wrap{height:6px;background:#172c43;border-radius:99px;overflow:hidden;margin:14px 0}
      #pw-progress{height:100%;width:0;background:#62e7ff;transition:width .2s}
      #pw-status{min-height:20px;font-size:12px;color:#9bb8c8}
      #pw-close{float:right;border:0;background:transparent;color:#c5dce7;font-size:22px;cursor:pointer}
    `;
    document.head.appendChild(style);

    const button = document.createElement("button");
    button.id = "pw-open";
    button.textContent = "AI LAB";
    button.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:9998";
    document.body.appendChild(button);

    const panel = document.createElement("div");
    panel.id = "pw-panel";
    panel.innerHTML = `
      <section id="pw-card">
        <button id="pw-close" aria-label="Close">×</button>
        <h2>PULSEWING / AI LAB</h2>
        <p>Train a small neural network against the real game. The best brain is stored locally on this device.</p>
        <div class="pw-grid">
          <div class="pw-stat"><small>GENERATION</small><strong id="pw-generation">1</strong></div>
          <div class="pw-stat"><small>EPISODE</small><strong id="pw-episode">0</strong></div>
          <div class="pw-stat"><small>BEST FITNESS</small><strong id="pw-best">0</strong></div>
          <div class="pw-stat"><small>BEST GATES</small><strong id="pw-gates">0</strong></div>
        </div>
        <div id="pw-progress-wrap"><div id="pw-progress"></div></div>
        <div class="pw-actions">
          <button id="pw-train">Start Training</button>
          <button id="pw-control">AI Take Control</button>
          <button id="pw-save">Save Best Brain</button>
          <button id="pw-reset">Reset Training</button>
        </div>
        <p id="pw-status">Ready. Start training to evaluate the first population.</p>
        <p><b>Note:</b> Training runs game episodes one at a time. Keep the game tab open while training.</p>
      </section>`;
    document.body.appendChild(panel);

    const openLab = () => {
lab.open = true;
panel.classList.add("pw-visible");
updateUI();
};

button.addEventListener("click", openLab);

const startOpenButton = document.getElementById("pw-open-start");
if (startOpenButton) {
startOpenButton.addEventListener("click", openLab);
}

    document.getElementById("pw-close").addEventListener("click", () => {
      lab.open = false;
      panel.classList.remove("pw-visible");
    });

    panel.addEventListener("click", event => {
      if (event.target === panel) {
        lab.open = false;
        panel.classList.remove("pw-visible");
      }
    });

    document.getElementById("pw-train").addEventListener("click", () => {
      if (lab.training) {
        lab.training = false;
        lab.controlling = false;
        lab.episodeStarted = false;
        setStatus("Training paused.");
      } else {
        if (!API()) {
          setStatus("PulseWingAI API is missing. Check that app.js loads before ai-lab.js.");
          return;
        }
        if (!lab.population.length) createPopulation();
        lab.training = true;
        lab.controlling = false;
        setStatus("Training in progress. Let the episodes run.");
        startEpisode();
      }
      updateUI();
    });

    document.getElementById("pw-control").addEventListener("click", () => {
      if (lab.controlling) {
        lab.controlling = false;
        lab.episodeStarted = false;
        setStatus("AI control stopped.");
      } else {
        if (!API()) {
          setStatus("PulseWingAI API is missing.");
          return;
        }
        lab.training = false;
        lab.controlling = true;
        lab.brain = lab.best || lab.population[0] || createBrain();
        lab.episodeStarted = true;
        API().reset();
        lab.timer = performance.now();
        setStatus(lab.best ? "Best saved brain controlling the game." :
          "Starter brain controlling the game. Train to improve it.");
      }
      updateUI();
    });

    document.getElementById("pw-save").addEventListener("click", () => saveBest(true));

    document.getElementById("pw-reset").addEventListener("click", () => {
      stopControl();
      createPopulation();
      lab.generation = 1;
      lab.episode = 0;
      lab.bestFitness = 0;
      lab.bestGates = 0;
      lab.best = null;
      lab.lastGates = 0;
      localStorage.removeItem(SAVE_KEY);
      setStatus("Training population reset.");
      updateUI();
    });
  }

  function init() {
    loadBest();
    createPopulation();
    makeUI();
    updateUI();
    window.requestAnimationFrame(tick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

// End of PULSEWING AI Lab.
