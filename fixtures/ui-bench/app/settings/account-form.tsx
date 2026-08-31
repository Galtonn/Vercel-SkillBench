"use client";

import { useState } from "react";

import { IconButton } from "../../components/icon-button";

/**
 * Account settings form with three planted accessibility defects:
 *
 * 1. The email field has a placeholder and no <label> (and no aria-label).
 * 2. Submit is an icon-only button with no accessible name.
 * 3. "Save draft" is a clickable <div>, not a button.
 */
export function AccountForm() {
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <div className="form-row">
        <input
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
      </div>
      <div className="form-row">
        <div
          className="fake-button"
          onClick={() => {
            setDraft(true);
          }}
        >
          Save draft
        </div>
        {draft ? <span> Draft stored.</span> : null}
      </div>
      <IconButton />
    </form>
  );
}
