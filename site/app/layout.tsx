import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Logo } from "./components/Logo";
import { RevealOnScroll } from "./components/RevealOnScroll";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

const TITLE = "Feedback to Roadmap: ranked problems from messy feedback";
const DESCRIPTION =
  "Turn reviews, tickets or survey answers into ranked problems, each backed by quotes checked word for word. Runs in your browser with your own free key; try the demo on 3,542 real App Store reviews.";

// Absolute URLs for the Open Graph image: Vercel sets the production domain at build time.
const site = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: TITLE, template: "%s · Feedback to Roadmap" },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: "Feedback to Roadmap" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes to <body> before React hydrates. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only rounded-md bg-white px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
        >
          Skip to content
        </a>
        <RevealOnScroll />
        <header className="border-b border-blue-100 bg-white/70 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
            <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-900">
              <Logo />
              Feedback to Roadmap
            </Link>
            <nav aria-label="Main" className="flex gap-5 text-sm">
              <Link href="/#results" className="text-slate-600 transition-colors hover:text-slate-900">
                Demo
              </Link>
              <Link href="/#how-it-works" className="text-slate-600 transition-colors hover:text-slate-900">
                How it works
              </Link>
              <Link href="/key-test" className="text-slate-600 transition-colors hover:text-slate-900">
                Your API key
              </Link>
            </nav>
          </div>
        </header>
        <div id="main" className="flex-1">
          {children}
        </div>
        {/* Required credit, from docs/data_credit.md */}
        <footer className="border-t border-blue-100 bg-white">
          <div className="mx-auto max-w-6xl space-y-1.5 px-5 py-6 text-xs leading-relaxed text-slate-500">
            <p>
              Demo data: AWARE dataset by N. Alturaief, H. Aljamaan and M. Baslyman (ASEW 2021,{" "}
              <a className="underline hover:text-slate-700" href="https://doi.org/10.1109/ASEW52652.2021.00049">
                doi:10.1109/ASEW52652.2021.00049
              </a>
              ), via Hugging Face (
              <a className="underline hover:text-slate-700" href="https://huggingface.co/datasets/scholl99/aware">
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
