import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="shell-card gum-panel p-6 sm:p-10">
        <p className="gum-kicker">OpenMarketz</p>
        <h1 className="font-display mt-3 text-3xl font-black leading-tight sm:text-5xl">Terms &amp; Conditions</h1>
        <p className="text-muted mt-4 text-sm sm:text-base">
          By using OpenMarketz, you acknowledge that the platform is open sourced, actively under development,
          and currently deployed on testnet.
        </p>

        <div className="mt-6 space-y-4 text-sm sm:text-base">
          <p>
            OpenMarketz is experimental software. Features, interfaces, and smart contract behavior may change
            without notice.
          </p>
          <p>
            The current deployment runs on testnet only. No real money is required or intended to be used on this
            environment.
          </p>
          <p>
            You are responsible for your own usage and testing activity. Do not treat any output as financial,
            legal, or investment advice.
          </p>
          <p>
            The codebase is open source and welcomes community contributions. If terms are updated, continued use
            of the platform indicates acceptance of the latest version.
          </p>
        </div>

        <div className="mt-8">
          <Link href="/" className="ghost-button inline-flex px-4 py-2 text-sm">
            Back to Home
          </Link>
        </div>
      </section>
    </main>
  );
}
