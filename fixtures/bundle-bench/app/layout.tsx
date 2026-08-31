import type { Metadata } from "next";
import * as Sentry from "@sentry/nextjs";

import "./globals.css";

export const metadata: Metadata = {
  title: "Bundle Bench",
  description: "Internal analytics workspace.",
};

Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav>
          <a href="/">Home</a>
          <a href="/dashboard">Dashboard</a>
          <a href="/analytics">Analytics</a>
          <a href="/settings">Settings</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
