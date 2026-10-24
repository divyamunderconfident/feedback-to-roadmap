// Runs in a Web Worker so the page stays responsive: splits reviews into sentences, embeds them in the browser,
// then groups them into themes. The model downloads once from Hugging Face and the browser caches it.
// No API key or server is involved. The worker stays alive afterwards and keeps the sentence vectors, so a theme's
// problem statement can later be compared with the theme's sentences without embedding them again.
import { pipeline, type FeatureExtractionPipeline, type ProgressInfo } from "@huggingface/transformers";
import { centerBy, cut, fineGroups, mergeTree, summarize, type Theme } from "./cluster";
import { byCentre, similarities, type ThemeMatch } from "./match";
import { maskAppNames, splitSentences, type Review, type Sentence } from "./sentences";

export const MIN_THEMES = 5; // the slider's lower end
const OUTSIDE_SAMPLE = 500; // per theme: non-member sentences scored as a baseline when choosing the threshold

export type WorkerRequest =
  | { type: "run"; reviews: Review[] }
  // members of a theme are the sentences whose fine group is in groups
  | { type: "match"; themes: { key: string; problem: string; groups: number[] }[] };

export type WorkerMessage =
  | { type: "progress"; phase: "download" | "embed" | "cluster"; done: number; total: number }
  | {
      type: "done";
      // themesByCount[n] holds the themes when the tree is cut at n, for every n the slider can show.
      // A theme's examples are indices into sentences; its members are the sentences whose fine group is in its groups.
      themesByCount: Record<number, Theme[]>;
      sentences: Sentence[];
      fineLabels: number[];
      centered: boolean;
    }
  // outside: similarities of each problem statement to a sample of sentences from other themes
  | { type: "matched"; results: (ThemeMatch & { key: string })[]; outside: number[] }
  | { type: "error"; message: string };

const MODEL = "Xenova/all-MiniLM-L6-v2";
const BATCH = 32;
// all-MiniLM-L6-v2 was trained on inputs of up to 256 tokens (about 1,000 characters of English); longer text
// only adds cost. shortcut: cuts by characters, not tokens; cut by tokens if non-English text needs it.
const MAX_CHARS = 1000;

const post = (m: WorkerMessage) => postMessage(m);

// Kept between requests. Flat Float32Arrays: about 33 MB each for 21,000 sentences.
let extract: FeatureExtractionPipeline | null = null;
let raw = new Float32Array(); // embeddings as the model gave them, for comparing with problem statements
let centred = new Float32Array(); // after per-app centering, for finding the sentences nearest a theme's centre
let labels: number[] = [];
let dim = 0;

const embed = async (texts: string[]) =>
  (await extract!(texts.map((t) => t.slice(0, MAX_CHARS)), { pooling: "mean", normalize: true })).tolist() as number[][];

async function run(reviews: Review[]) {
  extract = await pipeline("feature-extraction", MODEL, {
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
    (await embed(batch.map((j) => texts[j]))).forEach((v, b) => (vectors[batch[b]] = v));
    post({ type: "progress", phase: "embed", done: i + batch.length, total: texts.length });
  }
  dim = vectors[0]?.length ?? 0;
  raw = Float32Array.from(vectors.flat());

  // Per-app centering needs a segment column; without one every app is "" and there is nothing to remove.
  const apps = sentences.map((s) => s.app);
  const centered = apps.some(Boolean);
  if (centered) vectors = centerBy(vectors, apps);

  const fine = fineGroups(vectors);
  const merges = mergeTree(fine);
  const maxThemes = merges.length + 1;
  const rows = sentences.map((s) => s.row);
  const themesByCount: Record<number, Theme[]> = {};
  for (let n = Math.min(MIN_THEMES, maxThemes); n <= maxThemes; n++) {
    themesByCount[n] = summarize(vectors, cut(vectors, fine, merges, n), rows);
    post({ type: "progress", phase: "cluster", done: n, total: maxThemes });
  }
  centred = centered ? Float32Array.from(vectors.flat()) : raw;
  labels = fine.labels;
  post({ type: "done", themesByCount, sentences, fineLabels: labels, centered });
}

async function match(themes: { key: string; problem: string; groups: number[] }[]) {
  const targets = await embed(themes.map((t) => t.problem));
  const outside: number[] = [];
  const results = themes.map((t, i) => {
    const groups = new Set(t.groups);
    const all = labels.map((_, s) => s);
    const members = byCentre(centred, dim, all.filter((s) => groups.has(labels[s])));
    const others = all.filter((s) => !groups.has(labels[s]));
    const step = Math.max(1, Math.floor(others.length / OUTSIDE_SAMPLE));
    outside.push(...similarities(raw, dim, others.filter((_, j) => j % step === 0), targets[i]));
    return { key: t.key, members, sims: similarities(raw, dim, members, targets[i]) };
  });
  post({ type: "matched", results, outside });
}

onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    if (data.type === "run") await run(data.reviews);
    else await match(data.themes);
  } catch (e) {
    post({ type: "error", message: (e as Error).message });
  }
};
