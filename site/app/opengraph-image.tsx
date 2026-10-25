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
          background: "radial-gradient(900px 420px at 50% -80px, #99f6e4, #f8fafc 70%)",
          color: "#0f172a",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 600 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 10,
              background: "#0f766e",
              color: "white",
              fontSize: 18,
            }}
          >
            F→R
          </div>
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
        <div style={{ display: "flex", fontSize: 24, color: "#0f766e" }}>
          Live demo on 3,542 real App Store reviews · runs in your browser
        </div>
      </div>
    ),
    size,
  );
}
