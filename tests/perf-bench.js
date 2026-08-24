/**
 * perf-bench.js - the generation-cost table rendered at the bottom of tests/index.html.
 * Not a pass/fail test; a tuning aid.
 */
async function runPerformanceBenchmark(tbody){
  const engine = window.CrosswordEngine;
  const res = await fetch('../german.json');
  const data = await res.json();
  const bank = data.words.map((w) => ({ answer: engine.toUpperGrapheme(w.word), clue: w.clues[0] }));
  const target = 30;
  const budgetValues = [10, 25, 50, 100, 160, 250, 400, 600];
  const repeats = 3;

  for(const budgetMs of budgetValues){
    const areas = [];
    const times = [];
    for(let i = 0; i < repeats; i++){
      const t0 = performance.now();
      const result = engine.buildCrossword(bank, target, budgetMs);
      const t1 = performance.now();
      const bounds = engine.computeBounds(result.placements);
      areas.push(bounds.rows * bounds.cols);
      times.push(t1 - t0);
    }
    const avgArea = areas.reduce((a,b) => a+b, 0) / areas.length;
    const minArea = Math.min(...areas);
    const avgTime = times.reduce((a,b) => a+b, 0) / times.length;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${budgetMs}</td><td>${avgArea.toFixed(1)}</td><td>${minArea}</td><td>${avgTime.toFixed(1)}</td>`;
    tbody.appendChild(tr);
    // Let the browser paint each row as it completes rather than freezing until the whole
    // benchmark (which can take a little while at the largest n) is done.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
