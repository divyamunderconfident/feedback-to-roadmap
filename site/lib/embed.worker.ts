// Runs in a Web Worker so the page stays responsive: embeds texts in the browser, then groups them into themes.
// The model downloads once from Hugging Face and the browser caches it. No API key or server is involved.
import { pipeline, type ProgressInfo } from "@huggingface/transformers";
import { chooseK, MAX_THEMES, summarize, type Theme } from "./cluster";

export type WorkerMessage =
  | { type: "progress"; phase: "download" | "embed" | "cluster"; done: number; total: number }
  | { type: "done"; k: number; scores: Record<number, number>; themes: Theme[] }
  | { type: "error"; message: string };

const MODEL = "Xenova/all-MiniLM-L6-v2";
const BATCH = 32;
// all-MiniLM-L6-v2 was trained on inputs of up to 256 tokens (about 1,000 characters of English); longer text
// only adds cost. shortcut: cuts by characters, not tokens; cut by tokens if non-English text needs it.
const MAX_CHARS = 1000;

const post = (m: WorkerMessage) => postMessage(m);

onmessage = async ({ data: texts }: MessageEvent<string[]>) => {
  try {
    const extract = await pipeline("feature-extraction", MODEL, {
      dtype: "q8",
      progress_callback: (p: ProgressInfo) => {
        if (p.status === "progress_total") post({ type: "progress", phase: "download", done: p.loaded, total: p.total });
      },
    });

    // Each batch is padded to its longest text, so embed in length order and put vectors back in row order.
    const order = texts.map((_, i) => i).sort((a, b) => texts[a].length - texts[b].length);
    const vectors: number[][] = new Array(texts.length);
    for (let i = 0; i < order.length; i += BATCH) {
      const batch = order.slice(i, i + BATCH);
      const out = await extract(
        batch.map((j) => texts[j].slice(0, MAX_CHARS)),
        { pooling: "mean", normalize: true },
      );
      (out.tolist() as number[][]).forEach((v, b) => (vectors[batch[b]] = v));
      post({ type: "progress", phase: "embed", done: i + batch.length, total: texts.length });
    }

    const { k, scores, clustering } = chooseK(vectors, 1, (k) =>
      post({ type: "progress", phase: "cluster", done: k, total: MAX_THEMES }),
    );
    post({ type: "done", k, scores, themes: summarize(vectors, clustering) });
  } catch (e) {
    post({ type: "error", message: (e as Error).message });
  }
};
