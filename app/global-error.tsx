"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Something went wrong</h1>
        <p style={{ marginTop: "0.5rem", color: "#5a6e6a" }}>
          The application crashed. Try refreshing.
        </p>
        {error.digest && <p style={{ marginTop: "0.5rem", color: "#8a9e9a" }}>Error ID: {error.digest}</p>}
        <button
          onClick={reset}
          style={{
            marginTop: "1rem",
            background: "#374a47",
            color: "#c1ffb4",
            padding: "0.5rem 1.25rem",
            borderRadius: "0.5rem",
            border: "none",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
