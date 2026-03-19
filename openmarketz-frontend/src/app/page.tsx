import Link from "next/link";
export default function Home() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="shell-card gum-hero p-6 sm:p-10">
        <p className="gum-kicker">OpenMarketz</p>
        <h1 className="font-display mt-3 text-4xl font-black leading-tight sm:text-6xl">You are the oracle</h1>
        <p className="text-muted mt-4 max-w-2xl text-base">Trade and create crisp prediction markets on Monad with one code, one market, one truth source.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/create" className="cta-button px-5 py-2.5 text-sm">Create Market</Link>
          <Link href="/open" className="ghost-button px-5 py-2.5 text-sm">Open by Code</Link>
          <Link href="/my-markets" className="ghost-button px-5 py-2.5 text-sm">My Markets</Link>
        </div>
      </header>

      <section className="shell-card gum-panel p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="gum-feature-card p-4">
            <p className="gum-kicker">Step 1</p>
            <h2 className="mt-2 text-lg font-extrabold">Create</h2>
            <p className="text-muted mt-1 text-sm">Spin up an AMM market with a clear close time and seeded liquidity.</p>
          </article>
          <article className="gum-feature-card p-4">
            <p className="gum-kicker">Step 2</p>
            <h2 className="mt-2 text-lg font-extrabold">Share</h2>
            <p className="text-muted mt-1 text-sm">Send OPEN codes to your audience so they can join in a single click.</p>
          </article>
          <article className="gum-feature-card p-4">
            <p className="gum-kicker">Step 3</p>
            <h2 className="mt-2 text-lg font-extrabold">Manage</h2>
            <p className="text-muted mt-1 text-sm">Track markets you created and positions you invested in from one view.</p>
          </article>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="shell-card gum-panel p-5 sm:p-6">
          <h2 className="font-display text-2xl font-black">Creator Flow</h2>
          <p className="text-muted mt-2 text-sm">Launch a market, seed liquidity, publish the OPEN code, and resolve with confidence.</p>
          <Link href="/create" className="cta-button mt-4 inline-flex px-4 py-2 text-sm">Start Creating</Link>
        </article>
        <article className="shell-card gum-panel p-5 sm:p-6">
          <h2 className="font-display text-2xl font-black">Trader Flow</h2>
          <p className="text-muted mt-2 text-sm">Paste an OPEN code, trade YES or NO, track your positions, and redeem when resolved.</p>
          <Link href="/open" className="cta-button mt-4 inline-flex px-4 py-2 text-sm">Open a Market</Link>
        </article>
      </section>
    </main>
  );
}
