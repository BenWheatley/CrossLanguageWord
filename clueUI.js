export function renderClues(
  clues,
  state,
  gridEl
){

  const across =
    document.getElementById(
      "acrossClues"
    );

  const down =
    document.getElementById(
      "downClues"
    );


  across.innerHTML="";
  down.innerHTML="";


  for(const clue of clues.across){

    const li =
      document.createElement("li");

    li.textContent =
      `${clue.number}. ${clue.text}`;


    li.onclick=()=>{

      selectClue(
        clue,
        "across",
        state,
        gridEl
      );

    };


    across.appendChild(li);
  }



  for(const clue of clues.down){

    const li =
      document.createElement("li");

    li.textContent =
      `${clue.number}. ${clue.text}`;


    li.onclick=()=>{

      selectClue(
        clue,
        "down",
        state,
        gridEl
      );

    };


    down.appendChild(li);
  }

}



function selectClue(
  clue,
  direction,
  state,
  gridEl
){

  for(
    const [key,cell]
    of Object.entries(state.cells)
  ){

    if(cell[direction]===clue.word){

      const input =
        gridEl.querySelector(
          `input[data-key="${key}"]`
        );

      if(input){

        input.focus();

        highlight(
          clue.word,
          direction,
          state,
          gridEl
        );

        break;
      }
    }
  }

}



function highlight(
  word,
  direction,
  state,
  gridEl
){

  document
    .querySelectorAll(".cell")
    .forEach(
      e=>e.classList.remove(
        "highlight"
      )
    );


  for(
    const [key,cell]
    of Object.entries(state.cells)
  ){

    if(cell[direction]===word){

      const input =
        gridEl.querySelector(
          `input[data-key="${key}"]`
        );


      input?.parentElement
        .classList.add(
          "highlight"
        );

    }
  }
}