import { splitLetters } from "./unicode.js";

function emptyGrid(size = 40) {
  return Array.from(
    {length:size},
    () => Array(size).fill(null)
  );
}


function canPlace(grid, word, x, y, dir) {

  const letters = splitLetters(word);

  for (let i=0;i<letters.length;i++) {

    const px = dir==="across" ? x+i : x;
    const py = dir==="down" ? y+i : y;

    if (!grid[py] || grid[py][px] === undefined)
      return false;

    const existing = grid[py][px];

    if (existing && existing !== letters[i])
      return false;
  }

  return true;
}


function place(grid, word, x, y, dir) {

  const letters = splitLetters(word);

  for (let i=0;i<letters.length;i++) {

    const px = dir==="across" ? x+i : x;
    const py = dir==="down" ? y+i : y;

    grid[py][px] = letters[i];
  }
}


function scorePlacement(grid, word, x, y, dir) {

  let score = 0;

  const letters = splitLetters(word);

  for (let i=0;i<letters.length;i++) {

    const px = dir==="across" ? x+i : x;
    const py = dir==="down" ? y+i : y;

    if (grid[py][px] === letters[i])
      score++;
  }

  return score;
}


function candidates(grid, word) {

  const result = [];

  for (let y=0;y<grid.length;y++) {
    for (let x=0;x<grid.length;x++) {

      for (const dir of ["across","down"]) {

        if (!canPlace(grid,word,x,y,dir))
          continue;

        result.push({
          x,
          y,
          dir,
          score:scorePlacement(grid,word,x,y,dir)
        });
      }
    }
  }

  return result;
}


export function generate(words) {

  const grid = emptyGrid();

  const sorted = [...words]
    .sort(
      (a,b)=>
        splitLetters(b).length -
        splitLetters(a).length
    );


  const first = sorted.shift();

  place(
    grid,
    first,
    20,
    20,
    "across"
  );


  const placements=[
    {
      word:first,
      x:20,
      y:20,
      dir:"across"
    }
  ];


  for (const word of sorted) {

    const options =
      candidates(grid,word)
      .filter(x=>x.score>0)
      .sort(
        (a,b)=>b.score-a.score
      );


    if (!options.length)
      continue;


    const choice =
      options[0];


    place(
      grid,
      word,
      choice.x,
      choice.y,
      choice.dir
    );


    placements.push({
      word,
      ...choice
    });
  }


  return {
    grid,
    placements
  };
}