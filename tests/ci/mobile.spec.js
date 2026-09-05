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
  // Bringing the clue into view and focusing the square are two separate scrolls, and on a phone
  // the clue list is most of a screen away from the grid. If either moves the page, one tap
  // produces two jumps with the grid leaving the screen in between.
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

/** Covers the page the way the iOS keyboard does: the visual viewport shrinks, the layout one does not. */
async function raiseKeyboard(page, visibleHeight = 336){
  await page.evaluate((height) => {
    const real = window.visualViewport;
    const fake = {
      height, offsetTop: 0, offsetLeft: 0, scale: 1,
      addEventListener: real.addEventListener.bind(real),
      removeEventListener: real.removeEventListener.bind(real)
    };
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
    real.dispatchEvent(new Event('resize'));
  }, visibleHeight);
  await page.waitForTimeout(150);
}

test('the clues stay visible and readable once the keyboard is up', async ({ page }) => {
  await openPuzzle(page, '?list=german&words=16&seed=kbd1');
  const VISIBLE = 336;
  await raiseKeyboard(page, VISIBLE);

  const seen = await page.evaluate((visible) => {
    const clues = document.querySelector('.clues').getBoundingClientRect();
    const grid = document.getElementById('gridHost').getBoundingClientRect();
    return {
      cluesWithin: clues.top >= 0 && clues.bottom <= visible + 1,
      gridWithin: grid.top >= 0 && grid.bottom <= visible + 1,
      cluePaneHeight: Math.round(clues.height),
      panesStacked: clues.top >= grid.bottom - 1,
      sameColumn: Math.abs(clues.left - grid.left) < 2
    };
  }, VISIBLE);

  // vh and dvh both keep reporting the whole screen when the keyboard is up - it covers the page
  // rather than shortening it - so a pane sized from them ends up underneath the keyboard.
  expect(seen.cluesWithin, `clue pane runs past the ${VISIBLE}px left on screen`).toBe(true);
  expect(seen.gridWithin).toBe(true);
  expect(seen.cluePaneHeight, 'too shallow to read a clue').toBeGreaterThanOrEqual(110);
  // A column flex container with a definite height wraps an item that will not fit into a second
  // column, off the side of the screen, unless told not to.
  expect(seen.panesStacked, 'the panes should stack, not sit side by side').toBe(true);
  expect(seen.sameColumn).toBe(true);
});

test('the panes give the space back when the keyboard goes away', async ({ page }) => {
  await openPuzzle(page, '?list=german&words=16&seed=kbd1');
  const before = await page.evaluate(() => Math.round(document.querySelector('.clues').getBoundingClientRect().height));
  await raiseKeyboard(page, 336);
  const during = await page.evaluate(() => Math.round(document.querySelector('.clues').getBoundingClientRect().height));
  expect(during).toBeLessThan(before);
});

test('the options menu is not printed', async ({ page }) => {
  await openPuzzle(page);
  await page.click('#hamburgerBtn');           // the Print button lives inside it on a phone
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => {
    const drawn = (sel) => { const e = document.querySelector(sel); if(!e) return null;
      const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      hamburger: drawn('.hamburger-wrap'), menu: drawn('#optionsMenu'), actions: drawn('#menuActions'),
      grid: drawn('#grid'), clues: drawn('.clues'), answerKey: drawn('#printAnswerKey')
    };
  });
  // The wrap moves into the title row on a phone, so it can no longer rely on the toolbar's
  // no-print to hide it.
  expect(printed.hamburger, 'the options button should not print').toBe(false);
  expect(printed.menu, 'nor its menu').toBe(false);
  expect(printed.actions).toBe(false);
  expect(printed.grid).toBe(true);
  expect(printed.clues).toBe(true);
  expect(printed.answerKey).toBe(true);
});

test('a sheet printed from a phone is laid out the same as one printed from a desktop',
  async ({ browser }) => {
    // The narrow-screen rules describe how to fit a hand-held screen. None of it belongs on
    // paper: a phone was printing one column of clues instead of two, with the panes' borders
    // and padding, and a board still carrying the height of the screen it was sized for.
    const measure = async (contextOptions) => {
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      await page.goto('/index.html?list=german&words=12&seed=pcmp', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
      await page.emulateMedia({ media: 'print' });
      const style = await page.evaluate(() => {
        const of = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
        const across = document.getElementById('acrossList').getBoundingClientRect();
        const down = document.getElementById('downList').getBoundingClientRect();
        return {
          titleFontSize: of('header.app-head h1', 'fontSize'),
          wrapPadding: of('.wrap', 'padding'),
          boardDisplay: of('.board-area', 'display'),
          cluesDisplay: of('.clues', 'display'),
          cluesOverflow: of('.clues', 'overflowY'),
          cluesBorderTop: of('.clues', 'borderTopWidth'),
          cluesPadding: of('.clues', 'padding'),
          clueColumnsSideBySide: Math.abs(down.top - across.top) < 4 && down.left > across.right - 4,
          headingPosition: of('.clue-col h2', 'position'),
          headingPadding: of('.clue-col h2', 'padding'),
          clueListPaddingTop: of('.clue-list', 'paddingTop'),
          cellFontSize: of('#grid .cell input', 'fontSize'),
          gridHostOverflow: of('#gridHost', 'overflow'),
          secondColumnMargin: of('.clue-col + .clue-col', 'marginTop'),
          taglineShown: of('#pageTagline', 'display')
        };
      });
      await context.close();
      return style;
    };

    const desktop = await measure({ viewport: { width: 1280, height: 900 } });
    const phone = await measure({ ...devices['iPhone 13'] });

    // Everything here is styling; the puzzle itself legitimately differs, since each device
    // builds one to fit its own screen.
    expect(phone).toEqual(desktop);
    expect(desktop.clueColumnsSideBySide, 'two columns on paper').toBe(true);
    expect(desktop.cluesBorderTop, 'no on-screen panel border on paper').toBe('0px');
  });

test('the printed title does not depend on the width it was laid out at', async ({ browser }) => {
  // clamp(28px, 4vw, 40px) made the printed title follow the window as well as the device.
  const sizes = [];
  for(const width of [390, 700, 1280, 1900]){
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await context.newPage();
    await page.goto('/index.html?list=german&words=12&seed=pcmp', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
    await page.emulateMedia({ media: 'print' });
    sizes.push(await page.evaluate(() => getComputedStyle(document.querySelector('header.app-head h1')).fontSize));
    await context.close();
  }
  expect(new Set(sizes).size, `printed title sizes: ${sizes.join(', ')}`).toBe(1);
});

test('the page itself cannot scroll, and the three regions never move', async ({ page }) => {
  await openPuzzle(page, '?list=german&words=16&seed=shell1');
  const result = await page.evaluate(async () => {
    const header = document.querySelector('header.app-head');
    const host = document.getElementById('gridHost');
    const clues = document.querySelector('.clues');
    const tops = { header: new Set(), grid: new Set(), clues: new Set() };
    const note = () => {
      tops.header.add(Math.round(header.getBoundingClientRect().top));
      tops.grid.add(Math.round(host.getBoundingClientRect().top));
      tops.clues.add(Math.round(clues.getBoundingClientRect().top));
    };
    note();
    for(const y of [400, 1200, -600]){ window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); note(); }
    document.body.scrollTop = 800;
    await new Promise((r) => setTimeout(r, 60)); note();
    host.scrollTop = host.scrollHeight;          // scroll a pane to its end, where chaining leaked
    clues.scrollTop = clues.scrollHeight;
    await new Promise((r) => setTimeout(r, 80)); note();
    return {
      documentScrollable: document.documentElement.scrollHeight > window.innerHeight,
      windowScrollY: Math.round(window.scrollY),
      headerFixed: tops.header.size === 1,
      gridRegionFixed: tops.grid.size === 1,
      clueRegionFixed: tops.clues.size === 1,
      gridScrolledInternally: host.scrollTop > 0,
      cluesScrolledInternally: clues.scrollTop > 0
    };
  });
  // If the document can scroll at all, a flick anywhere carries it - taking the puzzle off the
  // top of the screen and leaving the clue list floating on its own.
  expect(result.documentScrollable, 'the page must not scroll').toBe(false);
  expect(result.windowScrollY).toBe(0);
  expect(result.headerFixed, 'the title moved').toBe(true);
  expect(result.gridRegionFixed, 'the puzzle region moved').toBe(true);
  expect(result.clueRegionFixed, 'the clue region moved').toBe(true);
  expect(result.gridScrolledInternally, 'the puzzle should scroll inside its own region').toBe(true);
  expect(result.cluesScrolledInternally).toBe(true);
});

test('every clue can be reached, keyboard up or down', async ({ page }) => {
  await openPuzzle(page, '?list=german&words=16&seed=shell1');
  const sweep = () => page.evaluate(async () => {
    const clues = document.querySelector('.clues');
    let missed = 0, checked = 0, worst = null;
    for(const li of [...document.querySelectorAll('.clue-list li')]){
      li.dispatchEvent(new Event('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
      const active = document.querySelector('.clue-list li.active');
      const a = active.getBoundingClientRect(), pane = clues.getBoundingClientRect();
      const heading = active.closest('.clue-col').querySelector('h2').getBoundingClientRect();
      checked++;
      if(a.top < pane.top - 1 || a.bottom > pane.bottom + 1 || a.top < heading.bottom - 1){
        missed++; if(!worst) worst = active.textContent.slice(0, 30);
      }
    }
    return { checked, missed, worst };
  });

  const down = await sweep();
  expect(down.missed, `${down.missed}/${down.checked} unreachable, e.g. ${down.worst}`).toBe(0);

  await raiseKeyboard(page, 336);
  const up = await sweep();
  expect(up.missed, `${up.missed}/${up.checked} unreachable with the keyboard up, e.g. ${up.worst}`).toBe(0);
});

test('the current clue is brought back into view when the keyboard changes the space', async ({ page }) => {
  await openPuzzle(page, '?list=german&words=16&seed=shell1');
  await page.evaluate(async () => {
    const items = [...document.querySelectorAll('.clue-list li')];
    items[items.length - 2].dispatchEvent(new Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
  });
  await raiseKeyboard(page, 336);
  // The pane shrinks under the keyboard, so a clue that was in view can fall out of it.
  const visible = await page.evaluate(() => {
    const pane = document.querySelector('.clues').getBoundingClientRect();
    const a = document.querySelector('.clue-list li.active').getBoundingClientRect();
    return a.top >= pane.top - 1 && a.bottom <= pane.bottom + 1;
  });
  expect(visible).toBe(true);
});

test('the wide layout is left alone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('/index.html?list=german&words=20&seed=desk2', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0);
  const desktop = await page.evaluate(() => ({
    wrapPosition: getComputedStyle(document.querySelector('.wrap')).position,
    bodyOverflow: getComputedStyle(document.body).overflow,
    appHeightSet: !!getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim()
  }));
  // The fixed shell is for hand-held screens; a desktop keeps an ordinary scrolling page.
  expect(desktop.wrapPosition).toBe('static');
  expect(desktop.bodyOverflow).toBe('visible');
  expect(desktop.appHeightSet).toBe(false);
  await context.close();
});

test('the shell sits exactly over what is visible, keyboard or no keyboard', async ({ page }) => {
  await openPuzzle(page, '?list=german&words=16&seed=fit3');
  const check = () => page.evaluate(() => {
    const vv = window.visualViewport;
    const top = vv.offsetTop, bottom = vv.offsetTop + vv.height;
    const wrap = document.querySelector('.wrap').getBoundingClientRect();
    const header = document.querySelector('header.app-head').getBoundingClientRect();
    const clues = document.querySelector('.clues').getBoundingClientRect();
    return {
      titleVisible: header.top >= top - 1,
      coversTop: wrap.top <= top + 1,
      coversBottom: wrap.bottom >= bottom - 1,
      slackUnderClues: Math.round(bottom - clues.bottom)
    };
  });

  const down = await check();
  expect(down.titleVisible).toBe(true);
  expect(down.coversTop && down.coversBottom).toBe(true);
  expect(down.slackUnderClues, 'wasted space below the clues').toBeLessThanOrEqual(20);

  // A fixed element is placed against the layout viewport, and Safari scrolls that to reveal the
  // focused field. Unless the shell follows, the title goes off the top of the screen.
  await page.evaluate(() => {
    const real = window.visualViewport;
    const fake = { height: 336, offsetTop: 44, offsetLeft: 0, scale: 1,
      addEventListener: real.addEventListener.bind(real), removeEventListener: real.removeEventListener.bind(real) };
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
    real.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(200);

  const up = await check();
  expect(up.titleVisible, 'the title was pushed off the top').toBe(true);
  expect(up.coversTop && up.coversBottom, 'the shell drifted off the visible area').toBe(true);
  expect(up.slackUnderClues).toBeLessThanOrEqual(20);
});

test('the square being answered is put near the middle of the puzzle pane', async ({ page }) => {
  await openPuzzle(page, '?list=german&words=18&seed=ctr1');
  const result = await page.evaluate(async () => {
    const pane = document.getElementById('gridHost');
    const inputs = [...document.querySelectorAll('#grid .cell input')];
    const offsets = [];
    let outside = 0;
    for(let i = 0; i < 20; i++){
      inputs[Math.floor(i * inputs.length / 20)].dispatchEvent(new Event('mousedown', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 70));
      const active = document.querySelector('#grid .cell.active').getBoundingClientRect();
      const view = pane.getBoundingClientRect();
      if(active.top < view.top - 1 || active.bottom > view.bottom + 1) outside++;
      offsets.push(Math.abs((active.top + active.height / 2) - (view.top + view.height / 2)) / view.height);
    }
    offsets.sort((a, b) => a - b);
    return { outside, median: offsets[Math.floor(offsets.length / 2)], paneScrolls: pane.scrollHeight > pane.clientHeight };
  });
  expect(result.paneScrolls, 'this puzzle should be taller than its pane').toBe(true);
  expect(result.outside, 'a square ended up outside the pane').toBe(0);
  // Squares near the top and bottom of the grid cannot be centred without scrolling past the
  // end, so the median is the honest measure.
  expect(result.median, 'squares are not being centred').toBeLessThan(0.1);
});

test('acting from the options menu closes it', async ({ page }) => {
  await openPuzzle(page);
  await page.evaluate(() => { window.print = () => {}; });
  for(const id of ['checkBtn', 'generateBtn', 'printBtn']){
    await page.click('#hamburgerBtn');
    expect(await page.evaluate(() => !document.getElementById('optionsMenu').hidden), `menu did not open before ${id}`).toBe(true);
    await page.evaluate((button) => document.getElementById(button).click(), id);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.getElementById('optionsMenu').hidden), `${id} left the menu open`).toBe(true);
  }
});

