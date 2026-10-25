"use client";

// Development only: hand-label whether sentences really fit their theme, one at a time. Answers are saved to
// eval/labels/theme_check.csv by /api/theme-check. The similarity score and band are never shown here.
import { useEffect, useState } from "react";
import type { PublicItem } from "@/lib/themeCheck";

export default function LabelClient() {
  const [items, setItems] = useState<PublicItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    fetch("/api/theme-check")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: { items: PublicItem[]; answers: Record<string, boolean> }) => {
        setItems(data.items);
        setAnswers(data.answers);
        const next = data.items.findIndex((i) => !(i.id in data.answers)); // carry on where you left off
        setIndex(next === -1 ? data.items.length : next);
      })
      .catch((e) => setError(`Could not load the sample: ${e.message}`));
  }, []);

  async function answer(onTopic: boolean) {
    const item = items[index];
    const res = await fetch("/api/theme-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id, onTopic }),
    });
    if (!res.ok) return setError(`Could not save the answer (${res.status}).`);
    setError("");
    setAnswers((a) => ({ ...a, [item.id]: onTopic }));
    setIndex((i) => i + 1);
  }

  const item = items[index];
  const done = Object.keys(answers).length;

  return (
    <main>
      <h1>Is this sentence on topic?</h1>
      <p>
        {done} of {items.length} labelled. Saved to eval/labels/theme_check.csv after each answer.
      </p>
      {error && <p role="alert">{error}</p>}
      {item ? (
        <>
          <p>
            <strong>Theme:</strong> {item.theme}
            <br />
            <strong>Problem:</strong> {item.problem}
          </p>
          <blockquote>“{item.text}”</blockquote>
          <p>
            <button onClick={() => answer(true)}>Yes, on topic</button>{" "}
            <button onClick={() => answer(false)}>No, off topic</button>{" "}
            {index > 0 && <button onClick={() => setIndex((i) => i - 1)}>Back</button>}
          </p>
          {item.id in answers && <p>Already answered: {answers[item.id] ? "yes" : "no"}. Answering again replaces it.</p>}
        </>
      ) : (
        items.length > 0 && (
          <p>
            All done. <button onClick={() => setIndex(items.length - 1)}>Back</button>
          </p>
        )
      )}
    </main>
  );
}
