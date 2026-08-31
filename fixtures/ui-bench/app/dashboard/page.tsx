"use client";

/**
 * Dashboard with two planted issues:
 *
 * 1. Heading hierarchy skips from h1 to h4.
 * 2. "Open invoice" is a clickable div, not a button or a link.
 */
export default function DashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>
      <h4>Outstanding invoices</h4>
      <p>3 invoices are waiting on finance.</p>
      <div
        className="fake-button"
        onClick={() => {
          window.location.href = "/settings";
        }}
      >
        Open invoice
      </div>
    </main>
  );
}
