/**
 * run-tests.js — runs the full test suite (engine + app) and exits non-zero on any failure.
 *
 * Setup:  npm install jsdom     (only needed for tests/app.test.js; engine.test.js has no deps)
 * Run:    node tests/run-tests.js
 */
console.log('crossword-engine.js — pure generation logic\n');
const engine = require('./engine.test.js');

async function main(){
  const engineResult = await engine.run();

  console.log('\ncrossword-trainer.html — interactive app (via a local HTTP server + jsdom)\n');
  // Imported after engine tests run so a missing `jsdom` install doesn't block the fast,
  // dependency-free engine suite from at least reporting its own results first.
  let appResult;
  try{
    const app = require('./app.test.js');
    appResult = await app.run();
  }catch(err){
    if(err && err.code === 'MODULE_NOT_FOUND' && /jsdom/.test(err.message)){
      console.log('  Skipped: jsdom is not installed. Run `npm install jsdom` to include these tests.');
      appResult = { passed: 0, failed: 0, total: 0 };
    } else {
      throw err;
    }
  }

  const totalPassed = engineResult.passed + appResult.passed;
  const totalFailed = engineResult.failed + appResult.failed;
  const total = engineResult.total + appResult.total;

  console.log('\n' + '─'.repeat(40));
  console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed (${total} total)`);
  process.exitCode = totalFailed > 0 ? 1 : 0;
}

main();
