// Runs in a Web Worker so the page stays responsive: splits reviews into sentences, embeds them in the browser,
// then groups them into themes. The model downloads once from Hugging Face and the browser caches it.
// No API key or server is involved.
import { pipeline, type ProgressInfo } from "@huggingface/transformers";
import { centerBy, chooseK, MAX_THEMES, summarize, type Theme } from "./cluster";
import { splitSentences, type Review, type Sentence } from "./sentences";

export type ThemeView = Omit<Theme, "examples"> & { examples: Sentence[] };
export type WorkerMessage =
  | { type: "progress"; phase: "download" | "embed" | "cluster"; done: number; total: number }
  | { type: "done"; k: number; scores: Record<number, number>; themes: ThemeView[]; sentences: number; centered: boolean }
  | { type: "error"; message: string };

const MODEL = "Xenova/all-MiniLM-L6-v2";
const BATCH = 32;
// all-MiniLM-L6-v2 was trained on inputs of up to 256 tokens (about 1,000 characters of English); longer text
// only adds cost. shortcut: cuts by characters, not tokens; cut by tokens if non-English text needs it.
const MAX_CHARS = 1000;

const post = (m: WorkerMessage) => postMessage(m);

onmessage = async ({ data: reviews }: MessageEvent<Review[]>) => {
  try {
    const extract = await pipeline("feature-extraction", MODEL, {
      dtype: "q8",
      progress_callback: (p: ProgressInfo) => {
        if (p.status === "progress_total") post({ type: "progress", phase: "download", done: p.loaded, total: p.total });
      },
    });

    const sentences = splitSentences(reviews);
    const texts = sentences.map((s) => s.text);
    // Each batch is padded to its longest text, so embed in length order and put vectors back in sentence order.
    const order = texts.map((_, i) => i).sort((a, b) => texts[a].length - texts[b].length);
    let vectors: number[][] = new Array(texts.length);
    for (let i = 0; i < order.length; i += BATCH) {
      const batch = order.slice(i, i + BATCH);
      const out = await extract(
        batch.map((j) => texts[j].slice(0, MAX_CHARS)),
        { pooling: "mean", normalize: true },
      );
      (out.tolist() as number[][]).forEach((v, b) => (vectors[batch[b]] = v));
      post({ type: "progress", phase: "embed", done: i + batch.length, total: texts.length });
    }

    // Per-app centering needs a segment column; without one every app is "" and there is nothing to remove.
    const apps = sentences.map((s) => s.app);
    const centered = apps.some(Boolean);
    if (centered) vectors = centerBy(vectors, apps);

    const { k, scores, clustering } = chooseK(vectors, 1, (k) =>
      post({ type: "progress", phase: "cluster", done: k, total: MAX_THEMES }),
    );
    const themes = summarize(vectors, clustering, sentences.map((s) => s.row), apps).map((t) => ({
      ...t,
      examples: t.examples.map((i) => sentences[i]),
    }));
    post({ type: "done", k, scores, themes, sentences: sentences.length, centered });
  } catch (e) {
    post({ type: "error", message: (e as Error).message });
  }
};
