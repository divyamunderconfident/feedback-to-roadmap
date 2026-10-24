// Runs in a Web Worker so the page stays responsive: splits reviews into sentences, embeds them in the browser,
// then groups them into themes. The model downloads once from Hugging Face and the browser caches it.
// No API key or server is involved.
import { pipeline, type ProgressInfo } from "@huggingface/transformers";
import { centerBy, cut, fineGroups, mergeTree, summarize, type Theme } from "./cluster";
import { maskAppNames, splitSentences, type Review, type Sentence } from "./sentences";

export const MIN_THEMES = 5; // the slider's lower end

export type ThemeView = Omit<Theme, "examples"> & { examples: Sentence[] };
export type WorkerMessage =
  | { type: "progress"; phase: "download" | "embed" | "cluster"; done: number; total: number }
  // themesByCount[n] holds the themes when the tree is cut at n, for every n the slider can show
  | { type: "done"; themesByCount: Record<number, ThemeView[]>; sentences: number; centered: boolean }
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
    const texts = maskAppNames(sentences); // embedded text only; sentences keep their original text for display
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

    const fine = fineGroups(vectors);
    const merges = mergeTree(fine);
    const maxThemes = merges.length + 1;
    const rows = sentences.map((s) => s.row);
    const themesByCount: Record<number, ThemeView[]> = {};
    for (let n = Math.min(MIN_THEMES, maxThemes); n <= maxThemes; n++) {
      themesByCount[n] = summarize(vectors, cut(vectors, fine, merges, n), rows, apps).map((t) => ({
        ...t,
        examples: t.examples.map((i) => sentences[i]),
      }));
      post({ type: "progress", phase: "cluster", done: n, total: maxThemes });
    }
    post({ type: "done", themesByCount, sentences: sentences.length, centered });
  } catch (e) {
    post({ type: "error", message: (e as Error).message });
  }
};
