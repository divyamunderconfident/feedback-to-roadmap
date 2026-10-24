// Receipts: a claim is shown only if every quote it gives appears word for word in the review it cites.

export type Evidence = { review: string; quote: string }; // review is an ID like "r124" (row 124)
export type Claim = { claim: string; evidence: Evidence[] };

export const reviewId = (row: number) => `r${row + 1}`;
export const rowOf = (id: string) => (/^r\d+$/.test(id) ? Number(id.slice(1)) - 1 : -1);

// Case, spacing and curly vs straight quote marks are ignored; everything else must match.
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

// reviewText(row) gives the full text of a review, or undefined for a row that does not exist.
export function verifyClaims(claims: Claim[], reviewText: (row: number) => string | undefined) {
  const ok = (e: Evidence) => {
    const text = reviewText(rowOf(e.review));
    const quote = normalize(e.quote);
    return text !== undefined && quote !== "" && normalize(text).includes(quote);
  };
  const shown = claims.filter((c) => c.evidence.length > 0 && c.evidence.every(ok));
  return { shown, hidden: claims.length - shown.length };
}
