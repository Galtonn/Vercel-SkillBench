import { AccountForm } from "./account-form";

export default function SettingsPage() {
  return (
    <main>
      <h1>Account settings</h1>
      <p>Update the email we use for invoices and incident notices.</p>
      <AccountForm />
    </main>
  );
}
