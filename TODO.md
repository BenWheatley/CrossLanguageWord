# TODO

Findings from the gameplay and UX review that are not yet done. Roughly in the
order I would tackle them; the numbering matches the review.

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

## 7a. Skip bias from over-drawing — REVISIT, no decision made yet

**Open question. Nothing has been implemented. Come back to this.**

Over-drawing the pool (7 above) buys the denser grid, but it introduces a bias
the uniform draw did not have. The generator now draws about 22 words to place
15, and placement keeps whichever fit together. A word that is hard to interlock
— unusual letters, no common vowel pattern, very short or very long — gets drawn
and then silently dropped, again and again. The draw is still uniform; what
survives it is not.

That matters more here than it would in a puzzle app, because awkward vocabulary
is disproportionately the vocabulary worth practising. The bias points the wrong
way.

Three ways out, none chosen:

- **A. Count the skips and use them as a tiebreak.** Record how many times each
  word has been drawn without being placed; prefer high counts on the next draw.
  Cheap, and it needs no other machinery. The risk is a queue of words that are
  never placeable at all, whose counts climb forever while they keep winning a
  draw they then lose again — so it needs a ceiling that forces a word into the
  *puzzle*, not merely the pool, after N skips.

- **B. Guarantee the drawn N and over-draw only the remainder.** Draw 15 that
  must appear plus ~7 optional, and let placement choose only among the optional
  ones. This removes the bias rather than compensating for it, which is the
  honest fix. It costs some of the density that over-drawing bought, because the
  guaranteed 15 have to be made to fit whatever they are.

- **C. Fold it into the learning record (1).** A skip becomes one signal among
  "got it wrong", "needed a hint", "not seen recently", and selection weighting
  handles all of them together. The right long-term home — a word skipped by the
  generator and a word the learner keeps missing both want the same treatment —
  but it cannot be built before 1 is.

**The mode split (1) narrows this.** In shareable mode the draw must be a pure
function of the seed, or a link stops opening the same puzzle for two people. A
and C both consult counts accumulated locally, so both would break that — they
are usable in smart mode only, and shareable mode would still need its own
answer. B changes only how the pool is drawn from a given seed, so it holds in
every mode. That is a real narrowing rather than a preference: B is the only one
of the three that can fix shareable mode at all.

**Recommendation: measure B first.** It is the only one of the three that removes
the bias instead of correcting for it after the fact, and the cost is a number we
can measure directly — rebuild the interlock table in 7 with the guarantee in
place and see what the density actually drops to. If the drop is small, B is
simply correct and A becomes unnecessary. If it is large, that number is what
justifies the extra machinery of A or C.

Note for whichever is built: skip counts are per word list, not global, and under
the append-only convention (README section 3) a word's position in its list is
stable forever — so they can be stored by index rather than by text, which is
much more compact than keying on the answer.

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
