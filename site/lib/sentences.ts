// Splits reviews into sentences, so a review that raises several problems counts towards each of them.

export const MIN_WORDS = 5; // shorter sentences are mostly filler ("I'm done.", "Thank you!")

export type Review = { row: number; text: string; app: string };
export type Sentence = Review; // a sentence keeps its review's row and app

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export function splitSentences(reviews: Review[], locale = "en"): Sentence[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
  return reviews.flatMap(({ row, text, app }) =>
    [...segmenter.segment(text)]
      .map((s) => s.segment.trim())
      .filter((s) => words(s) >= MIN_WORDS)
      .map((s) => ({ row, text: s, app })),
  );
}
