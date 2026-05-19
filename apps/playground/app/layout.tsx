import type { ReactNode } from "react";

export const metadata = {
  title: "Specula Playground",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // The daemon's port — `SPECULA_PORT`, the same variable the daemon CLI
  // reads, with the same `5151` default. Set it once to move both ends.
  const speculaPort = process.env.SPECULA_PORT ?? "5151";
  return (
    <html lang="en">
      <body>
        {children}
        {/* Specula overlay — served by the daemon, dev only. */}
        {process.env.NODE_ENV !== "production" && (
          <script src={`http://127.0.0.1:${speculaPort}/specula.js`} async />
        )}
      </body>
    </html>
  );
}
