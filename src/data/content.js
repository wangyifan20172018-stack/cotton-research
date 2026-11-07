import { news, notes } from "virtual:research-content";

export const allNotes = notes;
export const allNews = news;

export const noteSymbols = [...new Set(allNotes.map((note) => note.symbol))].sort();
export const noteTags = [...new Set(allNotes.flatMap((note) => note.tags))]
  .sort((a, b) => a.localeCompare(b, "zh-CN"));

export function getNoteBySlug(slug) {
  return allNotes.find((note) => note.slug === slug) ?? null;
}

export function getLatestNotesForSymbol(symbol, limit = 3) {
  return allNotes
    .filter((note) => note.symbol === symbol.toUpperCase())
    .slice(0, limit);
}

export function filterNotes({ symbol = "all", tag = "all" } = {}) {
  return allNotes.filter((note) => {
    const symbolMatches = symbol === "all" || note.symbol === symbol;
    const tagMatches = tag === "all" || note.tags.includes(tag);
    return symbolMatches && tagMatches;
  });
}

export function formatContentDate(date) {
  return date.replaceAll("-", ".");
}
