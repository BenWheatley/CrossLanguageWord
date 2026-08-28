```
 ==========================================================================
                            C R O S S W O R D
                              T R A I N E R
                    Cross-Language Vocabulary Puzzles

                              Version 1.0
                        Read Me First!  (2026-08)
 ==========================================================================
```

Thank you for choosing **Crossword Trainer**, the vocabulary crossword
generator for the language student. Please take a few moments to read this
document before use. It contains important information about system
requirements, operation, and licensing.

```
 CONTENTS
 --------------------------------------------------------------------------
   1.  Introduction
   2.  System Requirements
   3.  Installation
   4.  Getting Started
   5.  Keyboard Reference
   6.  Sharing a Puzzle
   7.  Using Your Own Word Lists
   8.  Printing
   9.  Saving Your Progress
  10.  Running the Test Suite
  11.  Known Limitations
  12.  Troubleshooting
  13.  Licence and Registration
 --------------------------------------------------------------------------
```

---

## 1. INTRODUCTION

Crossword Trainer builds a crossword from a vocabulary list. The clues are in
one language and the answers in another (or in the same one, if you prefer),
which makes it rather more useful for study than the puzzle in the weekend
newspaper.

Four word lists are included:

| List | Contents |
| --- | --- |
| English | 1000 English words, English clues |
| Deutsch A2 | 203 German words at CEFR level A2 |
| Deutsch B1 | 1000 German words at CEFR level B1 |
| Deutsch B1 → Englisch | German answers, English clues |

Every word carries at least two hand-written clues, and the program chooses
between them afresh for each puzzle, so the same word does not become
familiar by its clue alone.

A live copy runs at:

    https://benwheatley.github.io/CrossLanguageWord/

## 2. SYSTEM REQUIREMENTS

* A web browser of recent vintage. Firefox, Chrome, Edge and Safari have all
  been tested.
* A web server. **This is not optional** — see section 3.
* No plug-ins are required. No installation program is required. No
  registry entries are created. Nothing is transmitted anywhere; the program
  runs entirely on your own machine.

## 3. INSTALLATION

Copy the files to a folder and serve that folder over HTTP. From the folder
itself, any of the following will do:

```bash
python3 -m http.server 8000
```

Then direct your browser to `http://localhost:8000/`.

**Please note:** opening `index.html` directly from disk (a `file://`
address) will *not* work. Browsers refuse to let a local page read the word
list files alongside it, and you will be greeted by an error message rather
than a puzzle. This is a security measure on the browser's part and not a
fault in the program. Should you find yourself in this situation anyway, the
**Load…** option described in section 7 will still function.

## 4. GETTING STARTED

The program generates a puzzle as soon as it loads, so there is nothing to
configure before you begin.

Click a square and type. The highlighted squares show the word you are
currently answering, and the matching clue is highlighted in the list beside
the grid. Filling the last square of a word advances you to the next one.

The button bearing three horizontal lines opens the options panel, where you
may choose a different word list or a different number of words (from 2 to
120 — see section 11). Changing either generates a fresh puzzle at once.

**Check answers** marks the squares you have filled: correct squares turn
green, incorrect squares gain a red border. Squares you have left empty are
not marked, so you may check your work part-way through without being
scolded for it.

Complete the whole grid correctly and the program will say so.

## 5. KEYBOARD REFERENCE

```
  Type a letter . . . . . . . Fill the square, advance to the next
  Arrow keys  . . . . . . . . Move between squares
  Backspace . . . . . . . . . Clear this square, or step back and clear
  Delete  . . . . . . . . . . Clear this square
  Space . . . . . . . . . . . Switch between Across and Down
```

Squares that begin both an Across and a Down word belong to two answers at
once. The highlighted squares always show which of the two you are currently
filling in; click the square again, or press the space bar, to switch to the
other. Arriving at such a square fresh presents a small menu asking which you
meant.

Accented characters may be typed however your keyboard normally produces
them, including by dead key (`¨` then `u` for `ü`). The program waits for the
composition to finish before advancing, so the accent is not left stranded.

## 6. SHARING A PUZZLE

Every puzzle has a seed, and the address in your browser's location bar
always names it:

    index.html?list=german&words=15&seed=4rd6k1

Send that address to someone else and they will get **the same puzzle** —
the same grid, the same words, and the same clues — on whatever machine and
whatever browser they happen to be using. Write the seed on the blackboard
and a class of thirty will all be solving the same crossword.

This works because the program uses its own random number generator rather
than the browser's. The browser's cannot be seeded and is not guaranteed to
behave alike on two machines; ours is specified down to the arithmetic, and
is checked against known values every time the test suite runs.

**New crossword** moves on to a new seed. Nothing is lost — the old address
is in your browser history, and typing the old seed back into the address
bar returns you to that puzzle.

## 7. USING YOUR OWN WORD LISTS

Choose **Load…** from the word list menu and select a file. The format is
plain JSON:

```json
{
  "metadata": { "title": "My Vocabulary", "language": "de", "version": 1 },
  "words": [
    { "word": "Fenster", "clues": [ "You look through it", "Glass in a wall" ] },
    { "word": "Tür",     "clues": [ "You walk through it", "It has a handle" ] }
  ]
}
```

Points to observe:

* `word` is the answer, and goes in the grid. `clues` is a list, and the
  program picks one of them per puzzle — supply at least two if you can.
* Words of fewer than two letters are skipped, as they cannot cross anything.
* Should the same word appear twice in your file, the two entries are merged
  and their clues pooled. It will not appear in the grid twice.
* Accented characters are accepted in either Unicode normalisation form, so a
  file written on a Macintosh works as well as one written elsewhere.
* Capitalisation in the file is not significant; the grid is capitalised.

### Puzzles from your own list

A list of your own has no address to be fetched from, so the link identifies it
by checksum instead:

    index.html?list=custom&words=15&seed=4rd6k1&sum=14w665o0j4d

Lists you load are kept, so returning to such a link simply works. Where they
are not to hand — another computer, a link from somebody else, a browser whose
storage has been cleared — the program asks you for the file and checks that
what you offer is the list the puzzle was made from. Several lists may be kept
at once, and a link finds the right one among them.

The checksum covers the words, their order, and the clues. It has to cover the
clues as well as the words: the grid is decided by the answers alone, but which
clue is shown for each word depends on how many clues that word has and on their
wording, so a list matching only on words could rebuild the same grid and put
different clues beside it. A checksum that said "this is the list" and then
produced different clues would be worse than one that said "this is not".

Should you offer a file with the same words but clues edited since — a typo put
right, a clue reworded — the program says so and carries on, since the grid will
be identical and only some wording may differ. A file with different words is
refused.

## 8. PRINTING

**Print** produces a clean copy of the puzzle with the interface furniture
removed. The grid is scaled to the paper, so a puzzle generated on a wide
screen still fits the page.

The answer key is printed at the foot of the sheet in a pale grey and upside
down, in the manner of a puzzle magazine — turn the sheet to read it. Its
heading and dividing rule stay the right way up so you can see what it is
without turning anything.

Two options in the panel affect printing:

* **Show my typed answers when printing** prints the grid as you have filled
  it in rather than blank. Leave it off to print a fresh puzzle for someone
  else to solve.
* **Print the answer key at the foot of the sheet** is on by default. Turn it
  off when the solver should not be handed the answers along with the
  puzzle.

## 9. SAVING YOUR PROGRESS

Your puzzle and everything you have typed into it are saved continuously in
the browser's own storage. Close the tab, close the browser, come back
tomorrow, and you will be returned to the same grid with your answers intact.

Saving is silent and requires nothing of you. If your browser forbids it —
private browsing modes usually do — the program carries on without it.

## 10. RUNNING THE TEST SUITE

Serve the folder as in section 3 and visit `tests/` in your browser. The
tests run in the page and report as they go. They require no Node, no npm and
no build step; they are script tags and a static server, the same as the
program itself.

The suite exercises the generator directly and also drives the real
`index.html` inside an off-screen frame, so the thing under test is the thing
you actually run.

A few cases need a genuine top-level page reload, which a frame cannot provide;
those live in `tests/ci/` and run under Playwright. Everything that can be
tested in the frame stays in the page above, so there is only one suite to keep
up to date.

The same page is run automatically on every push, in Chromium, Firefox and
WebKit, by the workflow in `.github/workflows/tests.yml`. That arrangement
uses Playwright merely to open the page and read the result, so there is only
ever one suite — no second copy in another format to fall out of step with
this one. To run it that way yourself:

```bash
npm ci && npx playwright install --with-deps && npx playwright test
```

None of which the program itself requires. It remains script tags and a
static server.

## 11. KNOWN LIMITATIONS

* **Puzzles are limited to 120 words.** Generation time climbs steeply with
  the word count — far faster than the count itself — and 120 already
  produces more crossword than fits comfortably on a page.
* **Generation is not interruptible.** A large puzzle will occupy the browser
  for a moment while it is built. This is normal.
* **Your best time is not remembered between sessions.** It is shown for
  comparison within a sitting only.
* **Nothing is remembered about which words you found hard.** Words are drawn at
  random from the list, so practice is not directed at your weak spots.
* **There is no way to reveal an answer.** If a word defeats you, the program
  will not tell you what it was.
* **Reading a clue on a telephone means scrolling away from the grid.** The
  clue list sits below the puzzle, so the two are not on screen together.
* **A very large word list of your own may not be kept between sessions.** Lists
  are kept so you can return to their puzzles; when there is not room, the
  least recently used are dropped and the program asks for the file again.

Planned work and known gaps are listed in `TODO.md`.

## 12. TROUBLESHOOTING

> **"Could not load german.json"**
> The page is being opened from disk rather than served. See section 3.

> **The puzzle has fewer words than I asked for.**
> Not every word can be made to cross another. The program says so in the
> status line when this happens. Press **New crossword** for another
> arrangement.

> **A link I was sent gave me a different puzzle.**
> Check the address survived intact — some chat programs truncate long links,
> and the seed is at the end.

> **My own word list produced an odd grid.**
> Very long words dominate a small grid. Either raise the word count or
> shorten the entries.

## 13. LICENCE AND REGISTRATION

Copyright © 2026 Ben Wheatley. **All rights reserved.**

This software and its accompanying word lists are made available for you to
look at and to use. They are **not** placed in the public domain, and no
licence to copy, modify, redistribute, or incorporate them into other work —
commercial or otherwise — is granted by their presence here.

If you would like to use any part of this project for anything, please get in
touch and ask. The answer is quite likely to be yes.

    Ben Wheatley
    https://github.com/BenWheatley
    Please open an issue at https://github.com/BenWheatley/CrossLanguageWord/issues

See the accompanying `LICENSE` file for the full text.

```
 ==========================================================================
   Thank you for reading. Enjoy the puzzles, and mind the compound nouns.
 ==========================================================================
```
