"use client";

import { icons } from "@acme/icons";

export function Icon({ name }: { name: string }) {
  const Glyph = icons[name] ?? icons.placeholder;
  return <Glyph aria-hidden />;
}
