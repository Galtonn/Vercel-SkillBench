/**
 * Marketing hero. The image has no alt text — that is intentional. The
 * web-design-guidelines benchmark asks an agent to find this.
 */
export function Hero() {
  return (
    <section>
      <h1>Run your operations from one place</h1>
      <p>Billing, seats, and audit logs without leaving the admin.</p>
      <img
        className="hero-img"
        src="/images/operations-hero.jpg"
        width={1440}
        height={420}
      />
    </section>
  );
}
