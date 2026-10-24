// Splits reviews into sentences, so a review that raises several problems counts towards each of them.

export const MIN_WORDS = 5; // shorter sentences are mostly filler ("I'm done.", "Thank you!")

export type Review = { row: number; text: string; app: string };
export type Sentence = Review; // a sentence keeps its review's row and app

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole-word, case-insensitive match of any of the names; "-" and "_" in a name also match a space.
function namesRegex(names: string[]) {
  if (names.length === 0) return null;
  const alternatives = [...names]
    .sort((a, b) => b.length - a.length) // longest first, so "things-3" wins over "things"
    .map((n) => escape(n).replace(/[-_]/g, "[-_ ]"));
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, "giu");
}

// Text to embed: app names become "the app", so sentences group by what they say, not which app they name.
// Every app's full Segment value is replaced in every sentence. The first part of a multi-part value
// ("gmail" in "gmail-email-by-google") is replaced only in that app's own sentences, and only if it has
// 5+ letters, because short or common first parts ("free" in "free-tone-calling-texting") are ordinary words.
export function maskAppNames(sentences: Sentence[]): string[] {
  const apps = [...new Set(sentences.map((s) => s.app).filter(Boolean))];
  const full = namesRegex(apps);
  const firstParts = new Map(
    apps.flatMap((app) => {
      const parts = app.split(/[-_\s]+/);
      const first = parts[0];
      return parts.length > 1 && first.replace(/[^\p{L}]/gu, "").length >= 5 ? [[app, namesRegex([first])!]] : [];
    }),
  );
  return sentences.map(({ text, app }) => {
    const masked = full ? text.replace(full, "the app") : text;
    const own = firstParts.get(app);
    return own ? masked.replace(own, "the app") : masked;
  });
}

export function splitSentences(reviews: Review[], locale = "en"): Sentence[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
  return reviews.flatMap(({ row, text, app }) =>
    [...segmenter.segment(text)]
      .map((s) => s.segment.trim())
      .filter((s) => words(s) >= MIN_WORDS)
      .map((s) => ({ row, text: s, app })),
  );
}
