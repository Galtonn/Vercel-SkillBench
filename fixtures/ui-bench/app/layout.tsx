import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Northwind Admin",
  description: "Internal account settings.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <a href="/">Home</a>
            <a href="/dashboard">Dashboard</a>
            <a href="/settings">Settings</a>
            <a href="/about">About</a>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
