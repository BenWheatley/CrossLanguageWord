/**
 * perf-bench.js - the generation-cost table rendered at the bottom of tests/index.html.
 * Not a pass/fail test; a tuning aid for attemptsFor() in crossword-engine.js.
 */
async function runPerformanceBenchmark(tbody){
  const engine = window.CrosswordEngine;
  const res = await fetch('../german.json');
  const data = await res.json();
  const bank = data.words.map((w) => ({ answer: engine.toUpperGrapheme(w.word), clue: w.clues[0] }));
  const target = 30;
  const attemptValues = [1, 2, 4, 8, 12, 20, 40, 80];
  // Each row averages over several different seeds. Three was too few to read anything from -
  // the old table regularly showed a bigger budget producing a worse average purely by chance.
  const seeds = ['bench01', 'bench02', 'bench03', 'bench04', 'bench05', 'bench06', 'bench07', 'bench08'];

  for(const attempts of attemptValues){
    const areas = [];
    const times = [];
    for(const seed of seeds){
      const t0 = performance.now();
      const result = engine.buildCrossword(bank, target, { attempts, rng: engine.makeRng(seed) });
      const t1 = performance.now();
      const bounds = engine.computeBounds(result.placements);
      areas.push(bounds.rows * bounds.cols);
      times.push(t1 - t0);
    }
    const avgArea = areas.reduce((a,b) => a+b, 0) / areas.length;
    const minArea = Math.min(...areas);
    const avgTime = times.reduce((a,b) => a+b, 0) / times.length;
    const inUse = attempts === engine.attemptsFor(target) ? ' ← attemptsFor(30)' : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${attempts}${inUse}</td><td>${avgArea.toFixed(1)}</td><td>${minArea}</td><td>${avgTime.toFixed(1)}</td>`;
    tbody.appendChild(tr);
    // Let the browser paint each row as it completes rather than freezing until the whole
    // benchmark is done.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
