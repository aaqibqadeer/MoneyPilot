"use client";

/** Last-resort boundary when the root layout itself fails. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <p style={{ fontWeight: 600 }}>MoneyPilot hit an error</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 16px" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
