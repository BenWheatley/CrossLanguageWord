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

- Record a per-answer outcome: solved unaided / needed checking / hinted. Hints
  per word and attention per word are already tracked for the end-of-puzzle
  summary; they are thrown away when the puzzle changes, and want keeping.
- Weight selection toward words with a poor record, without abandoning variety
  altogether — a mostly-random draw with a modest bias is probably right.
- Show something about vocabulary, not just elapsed time, when a puzzle is done.

Depends on nothing. Feeds on 2.

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
