const KEY = "crossword-save-v1";

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function loadState() {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearState() {
  localStorage.removeItem(KEY);
}