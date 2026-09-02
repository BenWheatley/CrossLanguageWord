// Phone layout and scrolling.
//
// These live here rather than in tests/index.html because the in-browser suite drives the app in
// a fixed 1100px-wide frame, where the narrow-screen rules never apply at all. Playwright can
// give the app a real phone viewport, which is the only way to exercise them.
const { test, expect, devices } = require('@playwright/test');

test.use({ ...devices['iPhone 13'] });

async function openPuzzle(page, query = '?list=german&words=15&seed=jump01'){
  await page.goto('/index.html' + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
  await page.waitForTimeout(300);
}

test('moving between squares never scrolls the page', async ({ page }) => {
  await openPuzzle(page);
  const result = await page.evaluate(async () => {
    const positions = new Set();
    const inputs = [...document.querySelectorAll('#grid .cell input')];
    for(let i = 0; i < 12; i++){
      inputs[Math.floor(i * inputs.length / 12)]
        .dispatchEvent(new Event('mousedown', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
      positions.add(Math.round(window.scrollY));
    }
    return [...positions];
  });
  // Selecting a square used to scroll the page down to the clue list and then back up to the
  // square: one tap, two jumps, with the grid leaving the screen in between.
  expect(result, `page scrolled to ${result.join(', ')}`).toEqual([0]);
});

test('the clue list scrolls in its own pane, and the current clue stays in it', async ({ page }) => {
  await openPuzzle(page);
  const result = await page.evaluate(async () => {
    const clues = document.querySelector('.clues');
    const inputs = [...document.querySelectorAll('#grid .cell input')];
    const paneOffsets = new Set();
    let alwaysVisible = true;
    for(let i = 0; i < 12; i++){
      inputs[Math.floor(i * inputs.length / 12)]
        .dispatchEvent(new Event('mousedown', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
      paneOffsets.add(Math.round(clues.scrollTop));
      const li = document.querySelector('.clue-list li.active').getBoundingClientRect();
      const pane = clues.getBoundingClientRect();
      if(li.top < pane.top - 1 || li.bottom > pane.bottom + 1) alwaysVisible = false;
    }
    return { paneScrolled: paneOffsets.size > 1, alwaysVisible };
  });
  expect(result.paneScrolled, 'the pane should be doing the scrolling').toBe(true);
  expect(result.alwaysVisible, 'the current clue should stay inside the pane').toBe(true);
});

test('the puzzle and the clues are both on screen', async ({ page }) => {
  await openPuzzle(page);
  const seen = await page.evaluate(() => {
    const grid = document.getElementById('grid').getBoundingClientRect();
    const clues = document.querySelector('.clues').getBoundingClientRect();
    return {
      gridVisible: grid.top < window.innerHeight && grid.bottom > 0,
      cluesVisible: clues.top < window.innerHeight && clues.bottom > 0,
      gridPaneScrolls: (() => { const h = document.getElementById('gridHost');
        return h.scrollHeight > h.clientHeight; })()
    };
  });
  // A fifteen-word puzzle is taller than the screen on a phone, so the two can only share it if
  // each has a pane of its own.
  expect(seen.gridVisible).toBe(true);
  expect(seen.cluesVisible).toBe(true);
  expect(seen.gridPaneScrolls, 'the grid should be in a pane of its own').toBe(true);
});

test('the clues are one column on a phone, two side by side on a desktop', async ({ page }) => {
  await openPuzzle(page);
  const acrossThenDown = await page.evaluate(() => {
    const a = document.getElementById('acrossList').getBoundingClientRect();
    const d = document.getElementById('downList').getBoundingClientRect();
    return { stacked: d.top >= a.bottom - 1, sameLeftEdge: Math.abs(d.left - a.left) < 2 };
  });
  expect(acrossThenDown.stacked, 'Down should sit below Across, not beside it').toBe(true);
  expect(acrossThenDown.sameLeftEdge, 'and use the full width').toBe(true);
});

test('the direction popup lands on the square it belongs to, even when the grid is scrolled',
  async ({ page }) => {
    await openPuzzle(page);
    const offset = await page.evaluate(async () => {
      const host = document.getElementById('gridHost');
      host.scrollTop = Math.min(120, host.scrollHeight - host.clientHeight);
      await new Promise((r) => setTimeout(r, 60));
      // find a square that starts both an across and a down word
      const nums = [...document.querySelectorAll('#grid .cell .num')];
      for(const num of nums){
        const input = num.parentElement.querySelector('input');
        const r = +input.dataset.r, c = +input.dataset.c;
        input.dispatchEvent(new Event('mousedown', { bubbles: true }));
        await new Promise((res) => setTimeout(res, 60));
        const popup = document.getElementById('dirPopup');
        if(getComputedStyle(popup).display === 'none') continue;
        const pop = popup.getBoundingClientRect();
        const cell = input.closest('.cell').getBoundingClientRect();
        return { found: true, horizontal: Math.round(pop.left - cell.left), verticalGap: Math.round(pop.top - cell.bottom) };
      }
      return { found: false };
    });
    if(!offset.found) test.skip(true, 'this puzzle has no square starting two words');
    // The popup is positioned inside the scrolling pane, so its placement has to allow for the
    // pane's scroll offset or it appears a screenful from the square.
    expect(Math.abs(offset.horizontal)).toBeLessThan(4);
    expect(offset.verticalGap).toBeGreaterThanOrEqual(0);
    expect(offset.verticalGap).toBeLessThan(20);
  });

test('the clue pane is deep enough to read a clue, with room to spare', async ({ page }) => {
  await openPuzzle(page);
  const pane = await page.evaluate(() => {
    const clues = document.querySelector('.clues');
    const items = [...clues.querySelectorAll('.clue-list li')];
    const tallest = Math.max(...items.map((li) => li.getBoundingClientRect().height));
    return { height: Math.round(clues.getBoundingClientRect().height), tallestClue: Math.round(tallest) };
  });
  // A pane sized only as a fraction of the screen goes too shallow to read once the keyboard is
  // up, so there is a floor on it. Room for the heading and several clues, not just one.
  expect(pane.height).toBeGreaterThanOrEqual(150);
  expect(pane.height).toBeGreaterThan(pane.tallestClue * 2);
});

test('the current clue is scrolled clear of the sticky heading, not under it', async ({ page }) => {
  await openPuzzle(page);
  const worst = await page.evaluate(async () => {
    const clues = document.querySelector('.clues');
    const inputs = [...document.querySelectorAll('#grid .cell input')];
    let hidden = 0, checked = 0;
    for(let i = 0; i < 14; i++){
      inputs[Math.floor(i * inputs.length / 14)]
        .dispatchEvent(new Event('mousedown', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 90));
      const li = document.querySelector('.clue-list li.active');
      const heading = li.closest('.clue-col').querySelector('h2').getBoundingClientRect();
      const a = li.getBoundingClientRect(), p = clues.getBoundingClientRect();
      checked++;
      if(a.top < p.top - 1 || a.bottom > p.bottom + 1 || a.top < heading.bottom - 1) hidden++;
    }
    return { hidden, checked };
  });
  expect(worst.hidden, `${worst.hidden} of ${worst.checked} selections left the clue unreadable`).toBe(0);
});

test('the grid always fits the screen, with nothing scrolling sideways', async ({ page }) => {
  await openPuzzle(page);
  for(let i = 0; i < 6; i++){
    const fit = await page.evaluate(() => {
      const g = document.getElementById('grid'), host = document.getElementById('gridHost');
      return {
        gridWidth: Math.round(g.getBoundingClientRect().width),
        hostWidth: host.clientWidth,
        hostScrollsSideways: host.scrollWidth > host.clientWidth,
        pageScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    expect(fit.gridWidth, `grid ${fit.gridWidth}px in ${fit.hostWidth}px`).toBeLessThanOrEqual(fit.hostWidth);
    expect(fit.hostScrollsSideways).toBe(false);
    expect(fit.pageScrollsSideways).toBe(false);
    await page.evaluate(() => document.getElementById('generateBtn').click());
    await page.waitForTimeout(300);
  }
});

test('a puzzle built for a wider screen is rebuilt to fit, and the wide one kept on the undo',
  async ({ browser }) => {
    // Column count is fixed when a puzzle is built. Carried to a narrower screen it cannot fit,
    // and shrinking the squares is no way to solve a crossword.
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('/index.html?list=german&words=15&seed=wideT', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
    await page.waitForTimeout(300);
    const wideCols = await page.evaluate(() =>
      +getComputedStyle(document.getElementById('grid')).getPropertyValue('--cols'));

    await page.setViewportSize({ width: 390, height: 664 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
    await page.waitForTimeout(400);

    const after = await page.evaluate(() => {
      const g = document.getElementById('grid'), host = document.getElementById('gridHost');
      return {
        cols: +getComputedStyle(g).getPropertyValue('--cols'),
        fits: g.getBoundingClientRect().width <= host.clientWidth,
        undoOffered: !document.getElementById('undoBtn').hidden,
        status: document.getElementById('status').textContent
      };
    });
    expect(after.fits, `still ${after.cols} columns wide, built at ${wideCols}`).toBe(true);
    expect(after.undoOffered, 'the wide puzzle should still be reachable').toBe(true);
    expect(after.status).toContain('wider screen');
    await ctx.close();
  });

test('the controls fold into the options menu, leaving the title row', async ({ page }) => {
  await openPuzzle(page);
  const compact = await page.evaluate(() => ({
    hamburgerInTitleRow: !!document.querySelector('header.app-head .hamburger-wrap'),
    toolbarShown: getComputedStyle(document.querySelector('.toolbar')).display !== 'none',
    taglineShown: getComputedStyle(document.getElementById('pageTagline')).display !== 'none',
    chromeAboveBoard: Math.round(document.querySelector('.board-area').getBoundingClientRect().top)
  }));
  expect(compact.hamburgerInTitleRow).toBe(true);
  expect(compact.toolbarShown, 'the button row should be gone').toBe(false);
  expect(compact.taglineShown, 'the word count line should be gone').toBe(false);
  expect(compact.chromeAboveBoard, 'everything above the puzzle').toBeLessThan(110);

  await page.click('#hamburgerBtn');
  const menu = await page.evaluate(() => {
    const m = document.getElementById('optionsMenu').getBoundingClientRect();
    return {
      actions: [...document.querySelectorAll('#menuActions button')].map((b) => b.textContent.trim()),
      onScreen: m.left >= 0 && m.right <= window.innerWidth
    };
  });
  expect(menu.actions).toEqual(['Check answers', 'Print', 'New crossword']);
  expect(menu.onScreen, 'the menu must not open off the side of the screen').toBe(true);
});

test('no control small enough to make iOS zoom the page in', async ({ page }) => {
  await openPuzzle(page);
  await page.click('#hamburgerBtn');          // reveal the ones inside the options menu
  const small = await page.evaluate(() => {
    const TYPED = ['text', 'number', 'search', 'tel', 'url', 'email', 'password'];
    const offenders = [];
    document.querySelectorAll('input, select, textarea').forEach((el) => {
      const takesText = el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || TYPED.includes(el.type);
      if(!takesText) return;
      const size = parseFloat(getComputedStyle(el).fontSize);
      // Safari zooms the page whenever a control under 16px takes focus, and does not zoom out
      // again: the puzzle ends up bigger than the screen and a reload keeps it that way.
      if(size < 16){
        const name = el.id ? '#' + el.id : (el.dataset.r !== undefined ? 'grid square' : el.tagName.toLowerCase());
        if(!offenders.some((o) => o.name === name)) offenders.push({ name, size });
      }
    });
    return offenders;
  });
  expect(small, `controls under 16px: ${small.map((o) => `${o.name} at ${o.size}px`).join(', ')}`).toEqual([]);
});

test('the larger control size does not break the grid or the menu', async ({ page }) => {
  await openPuzzle(page, '?list=german&words=16&seed=zoom1');
  const grid = await page.evaluate(() => {
    const g = document.getElementById('grid'), host = document.getElementById('gridHost');
    const input = document.querySelector('#grid .cell:not(.block) input');
    input.value = 'W';                        // a wide letter, to check it still fits its square
    return {
      gridFits: g.getBoundingClientRect().width <= host.clientWidth,
      letterFits: input.scrollWidth <= input.clientWidth + 1,
      pageScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });
  expect(grid.gridFits).toBe(true);
  expect(grid.letterFits).toBe(true);
  expect(grid.pageScrollsSideways).toBe(false);

  await page.click('#hamburgerBtn');
  const menu = await page.evaluate(() => {
    const m = document.getElementById('optionsMenu').getBoundingClientRect();
    const select = document.getElementById('wordListSelect').getBoundingClientRect();
    return { onScreen: m.left >= 0 && m.right <= window.innerWidth, selectFits: select.right <= m.right };
  });
  expect(menu.onScreen).toBe(true);
  expect(menu.selectFits).toBe(true);
});

