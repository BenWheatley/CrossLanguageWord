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

## 7. One difficulty lever, and thin crossings

Word count is the only control. Measured interlock, 25 trials per size:

| words | crossings/word | isolated words | grid fill |
| --- | --- | --- | --- |
| 15 | 1.96 | 3.2% | 41.8% |
| 30 | 2.09 | 1.1% | 38.6% |

Respectable for arbitrary word lists, but most letters are unchecked, so an
unknown word usually cannot be inferred from its crossings the way it can in a
dense crossword. That is inherent to building from a supplied list rather than a
curated grid — and it is part of why 2 matters.

- Filter by word length, or by level within a list.
- "Only words I have missed" — which is 1 again, from the other end.

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
