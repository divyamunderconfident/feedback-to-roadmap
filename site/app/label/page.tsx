// Dev-only hand-labelling tool: a 404 everywhere except `next dev`.
import { notFound } from "next/navigation";
import LabelClient from "./LabelClient";

export default function LabelPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <LabelClient />
    </div>
  );
}
