# TODO

Findings from the gameplay and UX review that are not yet done. Roughly in the
order I would tackle them; the numbering matches the review.

## 0. Where things stand — 2026-09-20

Recap for coming back to after time away. Everything below is on branch
`review-fixes`, nothing pushed.

### Decisions waiting on Ben

1. ~~Phone mode control~~ **Built 2026-09-20**: tabs on a wide screen, a
   chip in the title row on a phone, one sheet (Continue/New per kind) from the
   chip and from the options menu; one puzzle in progress per kind, parked and
   restored whole.
2. ~~Breakpoint~~ **Done**: phone layout below 600px wide *or* 480px tall.
3. ~~iOS landscape overlay~~ **Built**: a "turn your phone upright" notice on
   a touch screen wider than tall and under 480px high.
4. ~~Broken "schauen" forms~~ **Done**, corrected in place under a sanctioned
   one-time break of the append-only rule (README, section 7).
5. ~~Skip bias~~ **Done 2026-09-28**: option C, smart mode only. Shareable and
   daily keep over-drawing for density. See 7a for the measurements.
6. ~~Long titles on a phone~~ **Done**: short label for bundled lists,
   ellipsis for loaded files; header 148px → 48px for the long-titled list.

### Things to play-test

- **Smart mode**: leave a puzzle half done, start another, see the missed words
  come back; solve one and see "N up" on the finish screen; check the tagline
  counts move; check a shared link still opens the same puzzle for someone else.
- **Hints**: the second clue now sits under the first, and is the *least* like
  it; where no different clue exists the rung is skipped and a letter is
  offered instead (after an attempt). Check the "also:" line reads well on a
  phone.
- **Settled squares**: a hint letter or a green-checked letter cannot be typed
  over or deleted; typing at one flows to the next open square; Backspace steps
  over them; a reload brings them back read-only and marked. Check it does not
  get in the way when a word is mostly settled.
- **Undo**: it is a stack now, ten deep. New, New, New, then Undo three times.
  Check the button no longer moves the grid when it appears.
- **The new example-sentence clues** in B1 and the German-to-English list: 627
  of them, written by hand and checked by machine only for giveaways and
  difference. Errors of German are possible and would be worth a note.

## 1. Nothing is remembered, so nothing is trained

The only thing kept between sessions is the puzzle you are in the middle of:

    localStorage: crossword-trainer-state, crossword-trainer-lists

There is no record of which words have been seen, which were answered unaided,
or which were repeatedly missed. Word selection is uniformly random *by design*
— `pickRandomSubset` deliberately avoids favouring easy-to-interlock vocabulary,
which is right for variety — but it means a word failed five times is exactly as
likely to come up as one known cold. The finish screen reports a time and
nothing about the vocabulary.

For something called a trainer this is the central gap. The groundwork is
already in place: words are keyed by answer, bank order is stable, puzzles are
seeded and reproducible.

**Settled: this goes in a separate mode, and does not change the existing one.**
A personalised draw and a shareable seed cannot both hold — if selection depends
on private history, a link stops naming the same puzzle for two people. So there
are three modes rather than one behaviour:

| Mode | Draw | Shareable |
| --- | --- | --- |
| Shareable | uniform, seeded — exactly as today | yes, by link |
| Smart | weighted by this reader's record | no |
| Daily | uniform, seeded from the date | yes, implicitly — same puzzle for everyone |

Daily is a variant of shareable rather than of smart: same uniform draw, with the
seed derived from the date instead of chosen at random. It is in the Later pile
below. Nothing about smart mode may alter what an existing link opens.

**Settled, for smart mode (2026-09-15):**

- *Scheduler:* Leitner boxes, five of them. Solved unaided moves a word up one
  box; a miss sends it back to box 1. The draw is weighted toward low boxes.
  Chosen over per-word review dates because a puzzle draws fifteen words at once
  and cannot honour individual dates; boxes also give the reader something
  legible to be shown.
- *Outcomes, three-way:* solved unaided → up. Solved with any hint → stays put.
  Wrong after Check, or still blank when the puzzle is left → down. A puzzle
  abandoned half-done therefore does teach the record something.
- *Bias:* about two-thirds of the draw from words that are due (low box, or long
  unseen), the remaining third uniform from the whole list, so variety survives
  and new words keep arriving.
- *Skip bias in this mode:* "drawn but not placed" is recorded like any other
  outcome, which is option C of 7a for free. Shareable mode still needs B.
- *Record storage:* per list, one entry per word, keyed by the word's answer.
  Index was the plan — smaller, and safe under the append-only convention — but
  the bank is derived from the file with duplicates merged and one-letter entries
  dropped, so its indices are a step removed from anything a list author sees,
  and a record that survives someone reordering a custom file is worth a few
  kilobytes. Bundled lists are keyed by id, custom ones by fingerprint. Kept in
  localStorage alongside the puzzle state; it never leaves the device.
- *Identity:* a smart puzzle has no shareable seed, because its word choice is
  private history. Placement is still seeded so the puzzle resumes after a
  reload. `?mode=smart` in the URL means "open smart mode on this list", not "open
  this puzzle".

**Built** (see Done). What is left of it:

- Show each word's box in the clue list, or on the finish screen, so the reader
  can see a word climbing. The finish screen says "12 up, 2 back" and no more.
- A way to see and to clear the record. There is none; it can only be cleared
  by clearing the browser's storage.
- The uniform third of a smart draw is placement's to keep or drop, exactly as
  in shareable mode, and the same skip bias applies — measured at eight missed
  words handed to a twelve-word pool, only four or five come back in the puzzle;
  the rest are recorded as skipped and lead the next draw. So the record
  converges, but over two or three puzzles rather than one. 7a option B would
  close that.
- "Only words I have missed" (7) is now a one-line change to the draw share.

## 1a. Where the mode is chosen — DECIDED for desktop, phone layout OPEN

**Settled 2026-09-16: F on laptop and desktop** — tabs, one puzzle in progress
per mode, switching non-destructive. Tablet and phablet take the desktop tabs
too unless the phone plan below says otherwise. The phone presentation is still
to be chosen; the *model* (one puzzle per mode) is the same on every screen, only
the control differs. Ben has said the UI may differ between small phone,
tablet/phablet and desktop.

The smart/shareable choice is a `<select>` in the options menu. It works, and it
is probably the wrong place. Options considered, none chosen:

| | For | Against |
| --- | --- | --- |
| **A. Select in the menu** (now) | Sits with the other "what puzzle" settings; no toolbar cost, which matters on a phone; the preference is visible when you look. | Hidden — nobody finds smart mode; a setting that *acts* (regenerates) is a surprise; the most important choice in the app is a modal detour on a phone. |
| **B. One button per mode** — "New crossword" and "Practise" (and later "Today's") | Verbs, not settings: the puzzle you get is what you pressed; discoverable; one tap; scales to three. On a phone they fold into the menu as the buttons already do. | Toolbar space on a desktop; two or three primary actions compete; there is still hidden state, because the finish screen's "New puzzle" has to pick one — whichever was pressed last. |
| **C. Popup on New crossword** | The choice is made when it matters and can be explained in place; everyone sees it once. | An interstitial on the commonest action in the app — the same objection that ruled out a confirm on Undo. "Remember my choice" reintroduces hidden state and needs a home, which is A again. |
| **D. Segmented control in the toolbar** ("Random / Smart") | Always visible; reads as state, so not regenerating on change is natural; one tap. | Toolbar space; on a phone it folds into the menu and becomes A. |
| **E. Split button** "New crossword ▾" | One button's footprint; scales to three; the default is what you did last. | Fiddly on touch; the caret is a small target and hides the alternatives. |
| **F. Tabs, one puzzle in progress per mode** | The three-mode future fits exactly; switching is not destructive — the practice puzzle and the one a friend sent coexist; the most discoverable of all. | The most work: saved state per mode, and 30–40px of vertical space on a phone that section 4 fought for. |

F chosen for desktop (above). B, C, D and E are out.

### Phone plan — OPTIONS, not yet chosen

The phone shell is title row (list name + options button), grid pane, clue pane;
the tagline is hidden and every button is in the menu. With the keyboard up
about a third of the screen is left, so any permanent row costs a tenth of the
puzzle. Two things a phone user needs: to *see* which mode's puzzle is on
screen, and — rarely, since a mode is lived in for weeks — to switch.

| | For | Against |
| --- | --- | --- |
| **P1. Mode chip in the title row** — "Smart ▾" beside the options button; tap opens a small sheet listing each mode with its puzzle's state ("Smart · 7 of 15", "Shareable · solved", "Today's · not started") | Zero height: the row exists already. Mode always visible. Scales to three. The sheet doubles as a progress view | Width: the title has to fit on one line beside it, which it does not today for the long-titled list (below). A new element in a row Ben asked to keep spare |
| **P2. Segmented control at the top of the options menu** | Zero height; consistent with the phone rule that everything lives in the menu | Mode not visible without opening the menu — you cannot tell which puzzle you are looking at |
| **P3. Swipe between mode pages, with dots** | Zero chrome; native on a phone; the grid has no horizontal scroll on a phone, so the gesture is free | Undiscoverable without teaching; dots are a poor label for three named things; switching is rare, so a gesture is over-provision |
| **P4. Bottom tab bar** | The conventional phone pattern; thumb reach | 50px plus safe-area exactly where the keyboard rises; a typing app cannot spend the bottom edge |
| **P5. Compact tab strip** (desktop tabs, shrunk) | Identical mental model to desktop | 28–32px permanently for a rare action; the height section 4 fought for |
| **P6. Options button shows the mode** — its label becomes "Smart" | Zero height, zero new elements | Muddles two things: the button opens settings, the label describes a puzzle. The options button also stops looking like one |

Leaning: **P1, with P2 as the second road to the same sheet.** P1 is the only
option that is both free of height and shows the mode at a glance; P2 costs
nothing and catches anyone who looks in the menu first. P4 and P5 spend height
we do not have; P3 solves a frequency problem we do not have; P6 muddles.

Prerequisite for P1: **the title must fit on one line on a phone.** The page
shows the file's `metadata.title`, and "Deutsch B1: Fragen auf Deutsch,
Antworten auf Englisch" wraps to three lines at 375px and pushes the options
button onto a fourth — 148px of header against 94px with a short title. On a
phone use the short label from LISTS ("Deutsch B1 → Englisch") where there is
one, and truncate with an ellipsis where there is not (a loaded file). Worth
doing whichever option is chosen.

Tablet, phablet and landscape phone all sit above the 640px breakpoint and get
the desktop tabs. A landscape phone has 375px of height and a tab row is a tenth
of it; if that proves painful, gate the tab row on a minimum height as well and
fall back to the phone control. Not worth deciding until seen.

### Addenda, 2026-09-16

**P7. Interstitial on New crossword, phone only** (Ben's suggestion). Under the
one-puzzle-per-mode model, New makes a puzzle *in the active mode*, so a dialog
on New can only ask "new puzzle in which mode?" — it is not a way to *look at*
the other mode's puzzle without replacing it, and a separate switch is still
needed for that. For: no title-row space; room to explain each mode in place,
with each puzzle's state beside it; desktop untouched. Against: a tap on the
commonest action, whose answer is the same 95% of the time once someone lives
in smart mode; does not show which mode's puzzle is on screen, which is the
need a phone user has most; the keyboard drops when a dialog opens. A worthwhile
hybrid: the P1 sheet carries both *Continue* and *New* per mode, so it explains
and shows state the way P7 would, opened from the chip rather than from New.

**Does the short label leave room for a chip?** Measured at 375px, title at
24px, options button 40px: English / Deutsch A2 / Deutsch B1 leave ~150px,
enough for "Shareable ▾" (93px) with margin. "Deutsch B1 → Englisch" is 270px
and leaves 21px; at 360px, nothing. So the short-label fix is necessary and not
sufficient for that list. Choices: a still-shorter phone label ("B1 → Englisch",
~186px, leaves ~105px at 375 and ~90 at 360, which fits "Smart ▾" but not
"Shareable ▾"); or a smaller title on phones; or let the chip win and the title
truncate with an ellipsis (`min-width:0` on the h1, `flex-shrink:0` on the
chip) as the safety net whatever else is done. Recommend the safety net plus
the shorter label.

**Breakpoint.** Material's window size classes put *compact width* below 600dp
and *compact height* below 480dp; Apple's size classes make every iPhone
compact-width in portrait and every iPad regular. Bootstrap breaks at 576 and
768, Tailwind at 640 and 768. Today's phones top out around 440pt wide (iPhone
Pro Max) and 412dp (Pixel XL); iPad mini portrait is 744pt; unfolded foldables
sit at 673dp (Pixel Fold) and above. So: **phone control below 600px wide, or
below 480px tall** — the height test is what catches a landscape phone (an
iPhone Pro Max is 956×440 on its side), and it is Material's own line. Our
current 640 is defensible but 600 is the documented consensus and separates
phablets from small tablets cleanly; nothing sits between 600 and 640 in
practice.

**Forcing portrait.** Not possible on iPhone: Safari does not implement
`screen.orientation.lock()` and iOS ignores the manifest's `orientation` member
(Apple's manifest support is partial and undocumented). On Android an installed
PWA honours `"orientation": "portrait"` in the manifest, and `portrait` includes
`portrait-secondary` (upside-down) where the device allows it — so adding the
member is free and correct, it just does nothing on iOS. The iOS fallback is a
"turn your phone" overlay under `(orientation: landscape) and (max-height:
480px)`; cheap, and honest about the limit. Not doing anything is also fine, per
Ben: landscape with the keyboard up is hopeless anyway.

### Model, same on every screen

- Saved state becomes one puzzle per mode plus which is active. Migrate the
  current single-puzzle save by filing it under its own `params.mode`, so
  nobody loses a puzzle in progress to the upgrade.
- The address describes the visible puzzle, as now: switching tabs rewrites it.
- Undo restores the discarded puzzle into its own mode and switches to it.
- The word list and word count controls act on the active mode's next puzzle;
  each puzzle carries its own list, so the title may change with the tab.
- Each tab shows its puzzle's state (a dot or "7/15"), on desktop as well.
- Daily is the third tab when it comes; the layout should leave room for it
  and nothing more.

## 4. Phone ergonomics — mostly done

The grid and the clues have a scrolling pane each, the controls have folded into
the options menu, and the grid is always narrow enough for the screen. What is
left:

- **Cells are 30px**, against 44pt/48dp touch minimums, so tapping an exact
  square is fiddly. Either larger cells with the grid pane scrolled, or a zoomed
  view of the current word.
- **A single current-clue line** might serve better than a clue pane while the
  keyboard is up, when there is only about a third of the screen to share.

## Later, deliberately

Things worth having that are not worth having yet.

- **Send a puzzle to somebody who does not have the list.** Compress the answers
  *and* their clues into the URL fragment (`#…`, never sent to a server, and
  comfortably long). About 800 bytes raw for fifteen words, perhaps 400
  compressed. Self-contained, works offline, needs no word list at the other end.
  A separate feature from ordinary sharing rather than an extension of it: the
  recipient has a puzzle but nothing to build a second one from.

- **A daily puzzle.** One puzzle per date, the same for everybody, seeded from the
  date rather than at random. Agreed as an easy win and wanted, but the design is
  not worked out: which list it draws from, what happens when you open it twice,
  whether yesterday's is still reachable, and whether a streak is counted. Needs
  workshopping before it is built.

- **Improve a finished grid by moving words about.** Once a puzzle is built, try
  relocating individual words and keep whatever raises the crossing count. More
  work than the generator changes already made, and less certain to pay off, so
  it waits until those have been measured.

## 5. Nothing happens while you are solving

Completing a word correctly produces no feedback at all: the clue is not marked,
the squares do not change. There is no progress count, and the timer only
appears at the end.

- Mark a clue done when its word is completely filled.
- A quiet "7 of 15" somewhere.
- Let "Check answers" work on the current word as well as the whole grid; at
  present it marks every wrong letter in the puzzle, which is a blunt
  instrument and the only setting on offer.

## 7. One difficulty lever, and still-thin crossings

Word count is the only control. Interlock, 40 trials per size, after ranking
attempts by crossings and over-drawing the pool by half:

| words | crossings/word | checked letters | isolated words | grid fill |
| --- | --- | --- | --- | --- |
| 15 | 2.38 | 23.3% | 0% | 40.5% |
| 30 | 2.35 | 23.4% | 0% | 40.2% |

Up from 1.99 and 17.1% at fifteen words, with isolated words gone. Still a long
way from a professional grid, where every letter is checked — but that gap is
structural, not a defect: a professional works grid-first, designing a symmetric
black-square pattern and filling it from a lexicon of a hundred thousand entries
with backtracking. This works word-first, from a fixed handful of specific words
that must all appear. Closing the gap much further means either a far larger word
list or giving up the guarantee that the words you asked for are the words you
get.

- Filter by word length, or by level within a list.
- "Only words I have missed" — which is 1 again, from the other end.

## 7a. Skip bias from over-drawing — DONE, option C, smart mode only

**Decided 2026-09-28: C for the smart puzzle; shareable and daily keep over-drawing.**
The intents differ, so the generators should. A shareable or daily puzzle is a
crossword to enjoy once, and a denser grid is the better crossword. The smart
puzzle is for somebody working through a list again and again, and there
coverage beats density: a word never shown is a word never learned.

The bias: to build a denser grid the generator draws about 22 words to place 15
and keeps whichever interlock best. The 7 it drops are the awkward ones - odd
letters, awkward lengths - and they are the same words every time, which is
exactly the vocabulary most worth practising.

Built, in smart mode only:

- A refusal is recorded against the word, like a miss or a hint (`applySkip`).
- It is cleared the moment the word appears in a puzzle: the debt is paid.
- A word the grid has refused and the reader has never met gets a priority band
  of its own, above the merely-due and below anything the reader actually got
  wrong. Without that band it never even gets *drawn*: some 760 words are due at
  any moment and a small nudge never clears them.
- On the next draw it is not a candidate but a **requirement**: the engine takes
  an optional `required` set and tries those words first, while the grid is
  still open. Ranking attempts by how many they seated changed nothing on its
  own - an awkward word was never seated by *any* attempt, so there was nothing
  better to choose. Order is what decides, placement being greedy.

Measured over a simulated year of one 15-word puzzle a day against Deutsch B1,
solving 80% unaided:

| refusals allowed | words met | drawn but never once placed | crossings/word | checked letters |
| --- | --- | --- | --- | --- |
| 1 (chosen) | 958/1000 | 0 | 2.25 | 20.2% |
| 2 | 896/1000 | 60 | 2.37 | 21.8% |
| 3 | 867/1000 | 88 | 2.39 | 22.2% |
| before this work | 847/1000 | 95 | 2.38 | 23.1% |

One refusal is where the bias disappears rather than merely shrinks. It costs
2.38 → 2.25 crossings per word and 23.1% → 20.2% checked letters, in smart mode
alone - less than option B would have cost everywhere (2.22 and 19.6%, measured
2026-09-20), and B would have taken that from the shareable puzzle too.

A and B are therefore not needed. B's measurement is kept above in case the
daily puzzle ever wants it.

## 8. Smaller things

- **Tab moves square by square, not clue to clue.** Every major crossword uses
  Tab for the next clue. The highlight now follows focus, so it is coherent, but
  it is still not the convention.
- Finishing a word jumps to the next clue *number*, which may be in the other
  direction and is disorienting.
- Enter and Escape do nothing in the grid.
- Both print checkboxes sit in the options menu permanently, though they only
  matter at print time.
- The tagline says "1000 words available" while the puzzle uses 15. "15 of 1000"
  would read as less of an unkept promise.
- The English list has English clues for English answers — an ordinary crossword,
  and the odd one out in a project called CrossLanguageWord.
- Two clues are shared by same-length answers and so cannot be resolved:
  "a german preposition" → AUF/BEI, and "might make you laugh, cry, or shout" →
  EMOTION/FEELING. Data fixes, not code.

## Done

- 1 — the trainer now trains. A per-list record of how every word went, Leitner
  boxes with waiting times, and a smart mode whose draw is two-thirds the words
  most due and one-third uniform. Outcomes are judged when a puzzle is solved or
  left, taken back by Undo, and never counted twice. Shareable mode is untouched:
  a seed still names one puzzle for everyone, whatever the record says.

- 3 — losing a puzzle to a stray keystroke, with no way back. Undo, plus a
  debounce on the word count.
- 6 — clues printing their own answer. 1.31 free answers per puzzle → 0.01.
- Tab leaving the highlight behind on the previous word.
- Most of 4 — the double scroll jump when changing square, and the clues being
  a screenful below the puzzle on a phone. Each now has its own scrolling pane,
  and the page does not move at all when you change square. The clue pane has a
  floor deep enough to read, the current clue scrolls clear of the sticky
  heading, the controls fold into the options menu on a narrow screen (168px of
  chrome down to 94px), and a puzzle built for a wider screen is rebuilt to fit
  rather than scrolling sideways. The layout is now a fixed shell of three
  regions that cannot be scrolled off, pinned to the visible area so the
  keyboard cannot hide the clues, with the current square centred in its pane.
- Installable, and works with no network at all (README section 10).
- 2 — no way to find out a word you did not know. A hint ladder: another clue
  first, then letters from the front of the word, gated on having attempted it,
  counted, and reported at the end along with the word that gave most trouble.
- 8, first item — a seed now names one puzzle, because the link carries the width
  it was built at. Where that width does not fit the screen, the choice between
  the exact puzzle and a fitted one is put to the reader.
