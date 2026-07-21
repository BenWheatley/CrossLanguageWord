let startTime = null;
let elapsed = 0;
let running = false;

let interval = null;

export function startTimer(updateFn) {
  if (running) return;
  running = true;
  startTime = performance.now() - elapsed;

  interval = setInterval(() => {
    if (!running) return;
    elapsed = performance.now() - startTime;
    updateFn(format(elapsed));
  }, 250);

  document.addEventListener("visibilitychange", handleVisibility);
}

export function stopTimer() {
  running = false;
  clearInterval(interval);
}

function handleVisibility() {
  if (document.hidden) {
    stopTimer();
  } else {
    startTimer(() => {});
  }
}

export function getElapsed() {
  return elapsed;
}

function format(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}