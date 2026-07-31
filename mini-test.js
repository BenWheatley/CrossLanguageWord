/**
 * mini-test.js — a deliberately tiny test runner (no external framework needed beyond jsdom,
 * which is only required for tests/app.test.js). Supports sync and async test functions,
 * prints a clear pass/fail line per test, and exits with a non-zero code if anything failed
 * so this can be wired into CI later without changes.
 *
 * Exported as a factory (not a singleton) so each test file gets its own isolated registry —
 * otherwise, since Node caches modules, every file that requires this would share one `tests`
 * array, and running multiple test files from an orchestrator would double-count / re-run
 * each other's tests.
 *
 * Usage:
 *   const { test, run } = require('./mini-test')();
 *   test('does the thing', () => { assert.strictEqual(1+1, 2); });
 *   run(); // prints a summary and sets process.exitCode
 */
function createRunner(){
  const tests = [];

  function test(name, fn){
    tests.push({ name, fn });
  }

  async function run(){
    let passed = 0, failed = 0;
    const failures = [];
    for(const { name, fn } of tests){
      try{
        await fn();
        passed++;
        console.log(`  \x1b[32m✓\x1b[0m ${name}`);
      }catch(err){
        failed++;
        failures.push({ name, err });
        console.log(`  \x1b[31m✗\x1b[0m ${name}`);
        console.log(`      ${err && err.message ? err.message : err}`);
      }
    }
    console.log('');
    console.log(`${passed} passed, ${failed} failed (${tests.length} total)`);
    if(failed > 0){
      process.exitCode = 1;
    }
    return { passed, failed, total: tests.length, failures };
  }

  return { test, run };
}

module.exports = createRunner;
