import { parseURLParams } from "./url.js";
import { saveState, loadState } from "./storage.js";
import { startTimer } from "./timer.js";

import { validateWordList } from "./validation.js";
import { generate } from "./generator.js";
import { buildCells } from "./grid.js";
import { normalizeWord } from "./unicode.js";

import { setupInteraction } from "./interaction.js";

import { buildClues } from "./clues.js";
import { renderClues } from "./clueUI.js";

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
  if(saved){
  
    state=saved;
  
    render();
  
    renderClues(
      state.clues,
      state,
      gridEl
    );

}

  startTimer(t => timerEl.textContent = t);
}

async function handleFile(e) {

  const file =
    e.target.files[0];

  const text =
    await file.text();

  const data =
    JSON.parse(text);


  validateWordList(data);


  const count =
    params.words ??
    15;


  const selectedEntries =
  data.words
    .slice(0,count);
  
  const selected =
    selectedEntries
      .map(x =>
        normalizeWord(x.word)
      );
  
  
  const clueMap = {};
  
  for(const item of selectedEntries){
    
    clueMap[
      normalizeWord(item.word)
    ] =
      item.clues[0];
    
  }


  const crossword =
    generate(selected);


  const built =
  buildCells(crossword);
  
  
  state.clues =
    buildClues(
      crossword.placements,
      clueMap
    );


  state.cells =
    built.cells;

  state.solution =
    built.solution;


  render();
}

function render(){

  gridEl.innerHTML="";

  const cells =
    Object.values(state.cells);


  const minX =
    Math.min(...cells.map(c=>c.x));

  const maxX =
    Math.max(...cells.map(c=>c.x));

  const minY =
    Math.min(...cells.map(c=>c.y));

  const maxY =
    Math.max(...cells.map(c=>c.y));


  gridEl.style.gridTemplateColumns =
    `repeat(${maxX-minX+1},var(--cell))`;


  for(
    let y=minY;
    y<=maxY;
    y++
  ){

    for(
      let x=minX;
      x<=maxX;
      x++
    ){

      const key=`${x},${y}`;

      const cell =
        state.cells[key];


      const div =
        document.createElement("div");


      div.className =
        "cell";


      if(!cell){

        div.classList.add("blocked");

      }
      else {

        const input =
          document.createElement("input");

        input.maxLength=1;

        input.value =
          state.cells[key].value ?? "";

        input.dataset.key=key;


        input.addEventListener(
          "input",
          e=>{

            state.cells[key].value =
              e.target.value
              .normalize("NFC")
              .toUpperCase();


            saveState(state);
          }
        );


        div.appendChild(input);

      }


      gridEl.appendChild(div);
    }
  }
  
  renderClues(
    state.clues,
    state,
    gridEl
  );
  
  setupInteraction(
    state,
    gridEl,
    updateCheckButton
  );
}

const checkBtn =
  document.getElementById("checkBtn");


function updateCheckButton(){

  const cells =
    Object.values(state.cells);


  const complete =
    cells.every(
      c=>c.value &&
      c.value.length>0
    );


  checkBtn.hidden =
    !complete;
}


checkBtn.onclick=()=>{

  let correct=true;


  for(
    const [key,value]
    of Object.entries(state.solution)
  ){

    if(
      state.cells[key].value
      !== value
    ){
      correct=false;
      break;
    }
  }


  alert(
    correct
      ? "Correct!"
      : "Some answers are incorrect."
  );
};