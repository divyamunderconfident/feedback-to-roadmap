// The image shown when a link to the site is shared. Generated at build time; text only, no external assets.
import { ImageResponse } from "next/og";

export const alt = "Feedback to Roadmap: ranked problems from messy feedback, with a receipt for every claim";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "radial-gradient(900px 420px at 50% -80px, #bae6fd, #f5f9ff 70%)",
          color: "#0f172a",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 600 }}>
          {/* Same mark as app/icon.svg */}
          <svg width="52" height="52" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill="#2563eb" />
            <circle cx="8.5" cy="10" r="1.75" fill="#fff" opacity="0.55" />
            <circle cx="8.5" cy="16" r="1.75" fill="#fff" opacity="0.55" />
            <circle cx="8.5" cy="22" r="1.75" fill="#fff" opacity="0.55" />
            <rect x="13" y="8.5" width="12.5" height="3" rx="1.5" fill="#fff" />
            <rect x="13" y="14.5" width="9" height="3" rx="1.5" fill="#fff" opacity="0.85" />
            <rect x="13" y="20.5" width="5.5" height="3" rx="1.5" fill="#fff" opacity="0.7" />
          </svg>
          Feedback to Roadmap
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 1000 }}>
            Find the problems your users keep raising, with a receipt for every claim.
          </div>
          <div style={{ fontSize: 28, color: "#475569" }}>
            Ranked themes · sizes computed in code · quotes checked word for word
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#2563eb" }}>
          Live demo on 3,542 real App Store reviews · runs in your browser
        </div>
      </div>
    ),
    size,
  );
}
