const KEY =
  "crossword-save-v1";


export function saveState(state){

  const copy =
    structuredClone(state);


  copy.selected=null;


  localStorage.setItem(
    KEY,
    JSON.stringify(copy)
  );
}


export function loadState(){

  const raw =
    localStorage.getItem(KEY);


  if(!raw)
    return null;


  return JSON.parse(raw);
}


export function clearState(){

  localStorage.removeItem(KEY);

}