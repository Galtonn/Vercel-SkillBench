"use client";

import { useState } from "react";
import { Field, Toggle } from "@acme/ui-kit";

export function PreferencesForm() {
  const [emailDigest, setEmailDigest] = useState(true);
  const [theme, setTheme] = useState("system");

  return (
    <form>
      <Field label="Email digest">
        <Toggle checked={emailDigest} onChange={setEmailDigest} />
      </Field>
      <Field label="Theme">
        <select value={theme} onChange={(event) => setTheme(event.target.value)}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </Field>
    </form>
  );
}
