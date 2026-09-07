"use client";

// Deliberately dependency-free: next-intl may not initialize when this renders,
// and globals.css may itself be the thing that failed. Inline styles only.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
          Une erreur est survenue · Something went wrong
        </h1>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            border: "1px solid #d4d4d8",
            background: "#ffffff",
            font: "inherit",
            cursor: "pointer",
          }}
        >
          Réessayer · Try again
        </button>
      </body>
    </html>
  );
}
