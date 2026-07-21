export function parseURLParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    words: p.get("words") ? parseInt(p.get("words"), 10) : null,
    wordList: p.get("wordList")
  };
}