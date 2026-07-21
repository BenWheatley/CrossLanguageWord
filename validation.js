import { normalizeWord } from "./unicode.js";

export function validateWordList(data) {
  if (!data || !Array.isArray(data.words)) {
    throw new Error("Missing words array");
  }

  const seen = new Set();

  for (const entry of data.words) {
    if (!entry.word || !Array.isArray(entry.clues)) {
      throw new Error("Invalid word entry");
    }

    const word = normalizeWord(entry.word);

    if (seen.has(word)) {
      throw new Error(`Duplicate word: ${word}`);
    }

    seen.add(word);

    if ([...word].length < 2) {
      throw new Error(`Word too short: ${word}`);
    }
  }

  return true;
}