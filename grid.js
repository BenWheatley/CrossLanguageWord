import { splitLetters } from "./unicode.js";


export function buildCells(result) {

  const cells={};
  const solution={};


  for (const p of result.placements) {

    const letters =
      splitLetters(p.word);


    for(let i=0;i<letters.length;i++){

      const x =
        p.dir==="across"
        ? p.x+i
        : p.x;

      const y =
        p.dir==="down"
        ? p.y+i
        : p.y;


      const key=`${x},${y}`;


      if(!cells[key]) {

        cells[key]={
          x,
          y,
          across:null,
          down:null
        };

      }


      cells[key][p.dir]=p.word;
      solution[key]=letters[i];
    }
  }


  numberCells(cells);

  return {
    cells,
    solution
  };
}



function numberCells(cells){

  const sorted =
    Object.values(cells)
    .sort(
      (a,b)=>
        a.y-b.y ||
        a.x-b.x
    );


  let n=1;


  for(const c of sorted){

    const startsAcross =
      c.across &&
      !cells[`${c.x-1},${c.y}`]?.across;


    const startsDown =
      c.down &&
      !cells[`${c.x},${c.y-1}`]?.down;


    if(startsAcross || startsDown){
      c.number=n++;
    }
  }
}