// Development only: saves the app's own outputs (sentences, themes, problem statements, similarities) to
// eval/runs/demo_export.json for the offline evaluation in eval/match_eval.py. No labels pass through here.
// Outside `next dev` it answers 404.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.join(process.cwd(), "..", "eval", "runs", "demo_export.json"); // cwd is site/ under next dev

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const body = await req.text();
  try {
    JSON.parse(body);
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, body);
  return Response.json({ saved: "eval/runs/demo_export.json", bytes: body.length });
}
