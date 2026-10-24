// Development only: serves the hand-check sample (without similarity scores or bands) and saves each answer to
// eval/labels/theme_check.csv. Reads the app's own exported run; no AWARE labels are involved. 404 outside next dev.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSample, readAnswers, toCsv, toPublic, type Export } from "@/lib/themeCheck";

const ROOT = path.join(process.cwd(), ".."); // cwd is site/ under next dev
const EXPORT = path.join(ROOT, "eval", "runs", "demo_export.json");
const LABELS = path.join(ROOT, "eval", "labels", "theme_check.csv");

const dev = () => process.env.NODE_ENV === "development";
const notFound = () => new Response("Not found", { status: 404 });

async function load() {
  const items = buildSample(JSON.parse(await readFile(EXPORT, "utf-8")) as Export);
  const answers = readAnswers(await readFile(LABELS, "utf-8").catch(() => ""));
  return { items, answers };
}

export async function GET() {
  if (!dev()) return notFound();
  const { items, answers } = await load();
  return Response.json({ items: items.map(toPublic), answers });
}

export async function POST(req: Request) {
  if (!dev()) return notFound();
  const { id, onTopic } = (await req.json()) as { id?: unknown; onTopic?: unknown };
  const { items, answers } = await load();
  if (typeof onTopic !== "boolean" || !items.some((i) => i.id === id))
    return Response.json({ error: "Expected a sample item id and onTopic true or false." }, { status: 400 });
  answers[id as string] = onTopic;
  await mkdir(path.dirname(LABELS), { recursive: true });
  await writeFile(LABELS, toCsv(items, answers));
  return Response.json({ answered: Object.keys(answers).length });
}
