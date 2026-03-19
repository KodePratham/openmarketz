"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function OpenPage() {
  const router = useRouter();
  const [openCode, setOpenCode] = useState("");
  const [status, setStatus] = useState("");

  function openByCode(e: FormEvent) {
    e.preventDefault();
    const normalized = openCode.trim().toUpperCase();
    if (!/^OPEN\d{10}$/.test(normalized)) {
      setStatus("Enter a valid OPEN code (OPEN + 10 digits).");
      return;
    }
    router.push(`/amm/${normalized}`);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="shell-card gum-hero p-5 sm:p-8">
        <p className="gum-kicker">Open</p>
        <h1 className="font-display mt-2 text-3xl font-black sm:text-5xl">Enter an OPEN code</h1>
        <p className="text-muted mt-3 text-sm">Jump directly into a market and start trading.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/" className="ghost-button px-4 py-2 text-sm">Home</Link>
          <Link href="/create" className="ghost-button px-4 py-2 text-sm">Create</Link>
          <Link href="/my-markets" className="ghost-button px-4 py-2 text-sm">My Markets</Link>
        </div>
      </header>

      <section className="shell-card gum-panel p-4 sm:p-6">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={openByCode}>
          <input value={openCode} onChange={(e) => setOpenCode(e.target.value)} className="field w-full px-3 py-2.5" placeholder="OPEN1234567890" />
          <button className="cta-button px-5 py-2.5 text-sm" type="submit">Open Market</button>
        </form>
        {status ? <p className="text-muted mt-3 text-sm">{status}</p> : null}
      </section>
    </main>
  );
}
