export function buildClues(placements, wordEntries = {}) {

  const across = [];
  const down = [];

  const sorted =
    [...placements]
      .sort(
        (a,b)=>
          a.y-b.y ||
          a.x-b.x
      );


  let number = 1;


  for (const p of sorted) {

    const startsAcross =
      p.dir === "across";


    const startsDown =
      p.dir === "down";


    const clue = {
      number,
      word:p.word,
      text:
        wordEntries[p.word]
        ?? p.word
    };


    if (startsAcross)
      across.push(clue);


    if (startsDown)
      down.push(clue);


    if (startsAcross || startsDown)
      number++;

  }


  return {
    across,
    down
  };
}