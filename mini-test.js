/**
 * mini-test.js — a tiny, dependency-free test framework that runs entirely in the browser
 * and renders results to the page (no console needed, though it logs there too).
 *
 * Usage:
 *   const { test, run } = createRunner();
 *   test('does the thing', () => { assertEqual(1+1, 2); });
 *   run(document.getElementById('results'));
 */
function assertEqual(actual, expected, msg){
  if(actual !== expected){
    throw new Error((msg ? msg + ': ' : '') + `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertTrue(cond, msg){
  if(!cond) throw new Error(msg || 'expected a truthy value');
}
function assertNotEqual(actual, expected, msg){
  if(actual === expected){
    throw new Error((msg ? msg + ': ' : '') + `expected value to differ from ${JSON.stringify(expected)}`);
  }
}

function createRunner(){
  const tests = [];
  function test(name, fn){ tests.push({ name, fn }); }

  async function run(container){
    let passed = 0, failed = 0;
    for(const { name, fn } of tests){
      const row = document.createElement('li');
      try{
        await fn();
        passed++;
        row.className = 'pass';
        row.textContent = '✓ ' + name;
      }catch(err){
        failed++;
        row.className = 'fail';
        row.textContent = '✗ ' + name;
        const detail = document.createElement('div');
        detail.className = 'detail';
        detail.textContent = (err && err.message) ? err.message : String(err);
        row.appendChild(detail);
        console.error(name, err);
      }
      if(container) container.appendChild(row);
    }
    return { passed, failed, total: tests.length };
  }

  return { test, run };
}
