import { saveState } from "./storage.js";


export function setupInteraction(state, gridEl, checkCallback) {

  let activeKey = null;
  let direction = "across";


  const popup =
    createDirectionPopup();


  gridEl.addEventListener(
    "click",
    e => {

      const input =
        e.target.closest("input");

      if (!input)
        return;


      const key =
        input.dataset.key;


      selectCell(
        key,
        state,
        gridEl
      );


      activeKey = key;


      const cell =
        state.cells[key];


      if (
        cell.across &&
        cell.down
      ) {

        showDirectionChoice(
          popup,
          input,
          d => {
            direction=d;
            highlightWord(
              key,
              direction,
              state,
              gridEl
            );
          }
        );

      }
      else {

        direction =
          cell.across
          ? "across"
          : "down";


        highlightWord(
          key,
          direction,
          state,
          gridEl
        );
      }
    }
  );


  gridEl.addEventListener(
    "input",
    e => {

      if (
        !e.target.matches("input")
      )
        return;


      const key =
        e.target.dataset.key;


      state.cells[key].value =
        e.target.value
          .normalize("NFC")
          .toUpperCase();


      saveState(state);


      moveNext(
        key,
        direction,
        state,
        gridEl
      );


      checkCallback();
    }
  );


  gridEl.addEventListener(
    "keydown",
    e=>{

      const input =
        e.target.closest("input");

      if (!input)
        return;


      const key =
        input.dataset.key;


      if(e.key==="Backspace"){

        if(input.value){

          input.value="";
          state.cells[key].value="";

        }
        else {

          movePrevious(
            key,
            direction,
            state,
            gridEl
          );

        }


        saveState(state);
        e.preventDefault();
      }


      if(
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown"
        ].includes(e.key)
      ){

        const d =
          {
            ArrowLeft:"across",
            ArrowRight:"across",
            ArrowUp:"down",
            ArrowDown:"down"
          }[e.key];


        direction=d;


        const next =
          adjacent(
            key,
            e.key,
            state
          );


        if(next)
          focus(next,gridEl);


        e.preventDefault();
      }

    }
  );



  function selectCell(key){

    document
      .querySelectorAll(".cell")
      .forEach(
        x=>x.classList.remove(
          "selected"
        )
      );


    const input =
      document.querySelector(
        `input[data-key="${key}"]`
      );


    if(input)
      input.parentElement
        .classList.add(
          "selected"
        );
  }


}



function moveNext(
  key,
  direction,
  state,
  gridEl
){

  const cell =
    state.cells[key];


  const x =
    direction==="across"
    ? cell.x+1
    : cell.x;


  const y =
    direction==="down"
    ? cell.y+1
    : cell.y;


  focus(
    `${x},${y}`,
    gridEl
  );
}



function movePrevious(
  key,
  direction,
  state,
  gridEl
){

  const cell =
    state.cells[key];


  const x =
    direction==="across"
    ? cell.x-1
    : cell.x;


  const y =
    direction==="down"
    ? cell.y-1
    : cell.y;


  focus(
    `${x},${y}`,
    gridEl
  );
}



function adjacent(key, arrow, state){

  const c =
    state.cells[key];

  if(!c)
    return null;


  let x=c.x;
  let y=c.y;


  if(arrow==="ArrowLeft")x--;
  if(arrow==="ArrowRight")x++;
  if(arrow==="ArrowUp")y--;
  if(arrow==="ArrowDown")y++;


  const next =
    `${x},${y}`;


  return state.cells[next]
    ? next
    : null;
}



function focus(key,gridEl){

  const input =
    gridEl.querySelector(
      `input[data-key="${key}"]`
    );

  if(input){
    input.focus();
  }
}



function highlightWord(
  key,
  direction,
  state,
  gridEl
){

  document
    .querySelectorAll(".cell")
    .forEach(
      x=>x.classList.remove(
        "highlight"
      )
    );


  const word =
    state.cells[key][direction];


  if(!word)
    return;


  for(
    const [k,c] of Object.entries(
      state.cells
    )
  ){

    if(c[direction]===word){

      const el =
        gridEl.querySelector(
          `input[data-key="${k}"]`
        );

      if(el)
        el.parentElement
          .classList.add(
            "highlight"
          );
    }
  }
}



function createDirectionPopup(){

  const div =
    document.createElement("div");

  div.id="directionPopup";

  div.style.display="none";

  div.innerHTML=`
    <button data-dir="across">
      Across →
    </button>
    <button data-dir="down">
      Down ↓
    </button>
  `;


  document.body.appendChild(div);

  return div;
}



function showDirectionChoice(
  popup,
  input,
  callback
){

  popup.style.position="absolute";

  const r =
    input.getBoundingClientRect();

  popup.style.left =
    `${r.left}px`;

  popup.style.top =
    `${r.top-45}px`;

  popup.style.display="block";


  popup
    .querySelectorAll("button")
    .forEach(btn=>{

      btn.onclick=()=>{

        callback(
          btn.dataset.dir
        );

        popup.style.display="none";
      };

    });
}