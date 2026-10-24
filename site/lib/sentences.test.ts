import { describe, expect, it } from "vitest";
import { splitSentences } from "./sentences";

const review = (text: string, row = 0, app = "gmail") => ({ row, text, app });

describe("splitSentences", () => {
  it("splits a review into sentences that keep its row and app", () => {
    const out = splitSentences([
      review("The app crashes every time I open it. Sync between my devices is very slow!", 7, "word"),
    ]);
    expect(out).toEqual([
      { row: 7, app: "word", text: "The app crashes every time I open it." },
      { row: 7, app: "word", text: "Sync between my devices is very slow!" },
    ]);
  });

  it("drops sentences under 5 words, counting contractions as one word", () => {
    const out = splitSentences([review("Thank you! Photos won't show. I'm done. It won't load my old notes.")]);
    expect(out.map((s) => s.text)).toEqual(["It won't load my old notes."]);
  });

  it("does not count punctuation or emoji as words", () => {
    expect(splitSentences([review("Great app - 10/10 !!! 👍👍")])).toEqual([]);
  });

  it("keeps a review with no sentence punctuation as one sentence", () => {
    const out = splitSentences([review("search never finds the note i need")]);
    expect(out.map((s) => s.text)).toEqual(["search never finds the note i need"]);
  });

  it("keeps each review's sentences with that review", () => {
    const out = splitSentences([
      review("Login fails on every single attempt.", 0, "a"),
      review("Too expensive for what you actually get.", 1, "b"),
    ]);
    expect(out.map((s) => [s.row, s.app])).toEqual([
      [0, "a"],
      [1, "b"],
    ]);
  });
});
