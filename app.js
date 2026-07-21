import { parseURLParams } from "./url.js";
import { saveState, loadState } from "./storage.js";
import { startTimer } from "./timer.js";

const gridEl = document.getElementById("grid");
const timerEl = document.getElementById("timer");
const fileInput = document.getElementById("fileInput");

let state = {
  grid: [],
  width: 0,
  height: 0,
  cells: {},
  solution: {},
  clues: { across: [], down: [] },
  selected: null,
  direction: "across"
};

const params = parseURLParams();

init();

function init() {
  fileInput.addEventListener("change", handleFile);

  const saved = loadState();
  if (saved) {
    state = saved;
    render();
  }

  startTimer(t => timerEl.textContent = t);
}

async function handleFile(e) {
  const file = e.target.files[0];
  const text = await file.text();
  const data = JSON.parse(text);

  console.log("Loaded wordlist:", data);
  // generator not implemented yet (next step)
}

function render() {
  gridEl.innerHTML = "";
}