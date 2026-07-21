export function normalizeWord(word) {
  return word
    .normalize("NFC")
    .toUpperCase()
    .replace(/\s+/gu, "");
}

export function splitLetters(word) {
  return [...word.normalize("NFC")];
}

export function isRTL(text) {
  return /^[\u0590-\u08FF]/u.test(text);
}

export function letterEquals(a, b) {
  return a.normalize("NFC") === b.normalize("NFC");
}