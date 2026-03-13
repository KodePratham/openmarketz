"use client";

import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from "react";
import { useRef, useState } from "react";
import EthereumProvider from "@walletconnect/ethereum-provider";

const CODE_LENGTH = 10;

export default function Home() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [codeDigits, setCodeDigits] = useState<string[]>(Array.from({ length: CODE_LENGTH }, () => ""));
  const providerRef = useRef<Awaited<ReturnType<typeof EthereumProvider.init>> | null>(null);
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  const getProvider = async () => {
    if (providerRef.current) {
      return providerRef.current;
    }

    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
    if (!projectId) {
      throw new Error("Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID");
    }

    const provider = await EthereumProvider.init({
      projectId,
      chains: [1],
      showQrModal: true,
      methods: ["eth_sendTransaction", "personal_sign", "eth_signTypedData", "eth_signTypedData_v4"],
    });

    provider.on("accountsChanged", (accounts: string[]) => {
      setWalletAddress(accounts[0] ?? null);
    });

    provider.on("disconnect", () => {
      setWalletAddress(null);
    });

    providerRef.current = provider;
    return provider;
  };

  const handleConnectWallet = async () => {
    try {
      setIsConnecting(true);
      const provider = await getProvider();
      await provider.connect();
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      setWalletAddress(accounts[0] ?? null);
    } catch (error) {
      console.error("WalletConnect connection failed", error);
      alert("Wallet connection failed. Please set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const walletLabel = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : isConnecting
      ? "Connecting..."
      : "Connect Wallet";

  const handleDigitChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value.replace(/\D/g, "");
    if (!nextValue) {
      const updatedDigits = [...codeDigits];
      updatedDigits[index] = "";
      setCodeDigits(updatedDigits);
      return;
    }

    const updatedDigits = [...codeDigits];
    let writeAt = index;

    for (const char of nextValue.slice(0, CODE_LENGTH - index)) {
      updatedDigits[writeAt] = char;
      writeAt += 1;
    }

    setCodeDigits(updatedDigits);

    if (writeAt < CODE_LENGTH) {
      digitRefs.current[writeAt]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !codeDigits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      digitRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      event.preventDefault();
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pastedDigits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH).split("");
    if (!pastedDigits.length) {
      return;
    }

    const updatedDigits = Array.from({ length: CODE_LENGTH }, (_, idx) => pastedDigits[idx] ?? "");
    setCodeDigits(updatedDigits);
    digitRefs.current[Math.min(pastedDigits.length, CODE_LENGTH) - 1]?.focus();
  };

  return (
    <div className="relative min-h-screen w-full bg-[#f4f4f0] text-black font-sans selection:bg-[#836ef9]/30">
      <header className="relative z-10 flex w-full items-center justify-between border-b-[3px] border-black bg-white px-6 py-6 md:px-12">
        <p className="text-2xl font-black tracking-tight text-black">openmarketz.xyz</p>
        <button
          type="button"
          onClick={handleConnectWallet}
          disabled={isConnecting}
          className="rounded-xl border-[3px] border-black bg-[#836ef9] px-6 py-3 text-base font-black text-black shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_rgba(0,0,0,1)]"
        >
          {walletLabel}
        </button>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-96px)] items-center justify-center px-6 pb-14">
        <section className="w-full max-w-4xl rounded-2xl border-[3px] border-black bg-white p-8 shadow-[8px_8px_0px_rgba(0,0,0,1)] md:p-12">
          <p className="mb-8 text-center text-base font-black tracking-[0.2em] text-black uppercase">Market Access</p>

          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-center md:gap-6">
            <span className="flex h-16 shrink-0 items-center justify-center rounded-xl border-[3px] border-black bg-[#836ef9] px-8 text-xl font-black tracking-widest text-black shadow-[4px_4px_0px_rgba(0,0,0,1)]">
              OPEN
            </span>

            <div className="grid grid-cols-5 gap-3 sm:grid-cols-10 md:gap-3 w-full max-w-2xl">
              {codeDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(element) => {
                    digitRefs.current[idx] = element;
                  }}
                  aria-label={`Code digit ${idx + 1}`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={digit}
                  onChange={(event) => handleDigitChange(idx, event)}
                  onKeyDown={(event) => handleDigitKeyDown(idx, event)}
                  onPaste={handleDigitPaste}
                  className="h-16 w-full rounded-xl border-[3px] border-black bg-white text-center text-3xl font-black text-black shadow-[4px_4px_0px_rgba(0,0,0,1)] outline-none transition-transform focus:translate-x-[2px] focus:translate-y-[2px] focus:bg-[#f0e6ff] focus:shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                />
              ))}
            </div>
          </div>

          <p className="mt-10 text-center text-lg font-bold text-black">Enter your 10-digit market code to continue.</p>
        </section>
      </main>
    </div>
  );
}
