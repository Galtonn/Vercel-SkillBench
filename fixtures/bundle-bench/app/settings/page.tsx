// Added in release 2.3.0 when the team adopted the shared design system.
import { SettingsLayout } from "@acme/ui-kit";

import { PreferencesForm } from "./preferences-form";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <SettingsLayout>
      <h1>Settings</h1>
      <PreferencesForm />
    </SettingsLayout>
  );
}
