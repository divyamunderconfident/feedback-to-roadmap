import { describe, expect, it } from "vitest";
import { maskAppNames, splitSentences } from "./sentences";

describe("maskAppNames", () => {
  const s = (text: string, app: string) => ({ row: 0, text, app });

  it("replaces the full Segment value anywhere, as whole words, ignoring case", () => {
    const out = maskAppNames([s("Discord beats Facebook.", "discord"), s("I left FACEBOOK for discordant reasons.", "facebook")]);
    expect(out).toEqual(["the app beats the app.", "I left the app for discordant reasons."]);
  });

  it("matches a slug with spaces in place of dashes", () => {
    expect(maskAppNames([s("Microsoft Word keeps crashing.", "microsoft-word")])).toEqual(["the app keeps crashing."]);
  });

  it("replaces a first part of 5+ letters only in the app's own sentences", () => {
    const out = maskAppNames([
      s("Gmail search is slow.", "gmail-email-by-google"),
      s("I moved here from Gmail.", "whatsapp-messenger"),
    ]);
    expect(out).toEqual(["the app search is slow.", "I moved here from Gmail."]);
  });

  it("does not replace a short first part such as free", () => {
    expect(maskAppNames([s("The free version has ads.", "free-tone-calling-texting")])).toEqual([
      "The free version has ads.",
    ]);
  });

  it("leaves the original sentence unchanged and skips sentences with no app", () => {
    const sentences = [s("Evernote lost my notes.", "evernote-notes-organizer"), s("Evernote lost my notes.", "")];
    expect(maskAppNames(sentences)).toEqual(["the app lost my notes.", "Evernote lost my notes."]);
    expect(sentences[0].text).toBe("Evernote lost my notes.");
  });
});

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
