import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Feedback to Roadmap",
  description:
    "Turn a CSV of reviews or tickets into ranked problems, each backed by verified quotes. Runs in your browser with your own free key.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes to <body> before React hydrates. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div>
              <Link href="/" className="text-lg font-semibold text-slate-900">
                Feedback to Roadmap
              </Link>
              <p className="text-sm text-slate-600">
                From messy feedback to ranked problems, with a receipt for every claim.
              </p>
            </div>
            <nav className="flex gap-4 text-sm">
              <Link href="/#how-it-works" className="text-slate-600 hover:text-slate-900">
                How it works
              </Link>
              <Link href="/key-test" className="text-slate-600 hover:text-slate-900">
                Your API key
              </Link>
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        {/* Required credit, from docs/data_credit.md */}
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl space-y-1 px-4 py-5 text-xs text-slate-500">
            <p>
              Demo data: AWARE dataset by N. Alturaief, H. Aljamaan and M. Baslyman (ASEW 2021,{" "}
              <a className="underline" href="https://doi.org/10.1109/ASEW52652.2021.00049">
                doi:10.1109/ASEW52652.2021.00049
              </a>
              ), via Hugging Face (
              <a className="underline" href="https://huggingface.co/datasets/scholl99/aware">
                scholl99/aware
              </a>
              , MIT licence). Reviews by App Store users.
            </p>
            <p>Your file and your API key stay in your browser. No accounts, no server-side storage.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
