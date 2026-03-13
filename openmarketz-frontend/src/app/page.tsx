"use client";

import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import EthereumProvider from "@walletconnect/ethereum-provider";

const CODE_LENGTH = 10;

type Eip1193Provider = {
  isMetaMask?: boolean;
  providers?: Eip1193Provider[];
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type EthereumWindow = Window & {
  ethereum?: Eip1193Provider;
};

export default function Home() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionStep, setConnectionStep] = useState<"idle" | "metamask" | "walletconnect">("idle");
  const [codeDigits, setCodeDigits] = useState<string[]>(Array.from({ length: CODE_LENGTH }, () => ""));
  const providerRef = useRef<Awaited<ReturnType<typeof EthereumProvider.init>> | null>(null);
  const injectedProviderRef = useRef<Eip1193Provider | null>(null);
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  const hasWalletConnectProjectId = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);
  const walletConnectAppName = process.env.NEXT_PUBLIC_APP_NAME ?? "OpenMarketz";
  const walletConnectAppDescription = process.env.NEXT_PUBLIC_APP_DESCRIPTION ?? "OpenMarketz frontend";
  const walletConnectAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const handleAccountChange = (accounts: unknown) => {
    if (Array.isArray(accounts) && typeof accounts[0] === "string") {
      setWalletAddress(accounts[0] ?? null);
      return;
    }

    setWalletAddress(null);
  };

  const handleDisconnect = () => {
    setWalletAddress(null);
  };

  const getMetaMaskProvider = () => {
    if (typeof window === "undefined") {
      return null;
    }

    const maybeWindow = window as EthereumWindow;
    const injected = maybeWindow.ethereum;
    if (!injected) {
      return null;
    }

    if (Array.isArray(injected.providers) && injected.providers.length > 0) {
      const metaMaskProvider = injected.providers.find((provider) => provider?.isMetaMask);
      return metaMaskProvider ?? injected.providers[0] ?? null;
    }

    return injected;
  };

  const attachInjectedListeners = (provider: Eip1193Provider) => {
    const previous = injectedProviderRef.current;
    if (previous) {
      previous.removeListener?.("accountsChanged", handleAccountChange);
      previous.removeListener?.("disconnect", handleDisconnect);
    }

    provider.on?.("accountsChanged", handleAccountChange);
    provider.on?.("disconnect", handleDisconnect);
  };

  useEffect(() => {
    let isMounted = true;

    const restoreWalletSession = async () => {
      const injected = getMetaMaskProvider();
      if (injected) {
        try {
          attachInjectedListeners(injected);
          injectedProviderRef.current = injected;
          const accounts = (await injected.request({ method: "eth_accounts" })) as string[];
          if (!isMounted) {
            return;
          }

          if (accounts[0]) {
            setWalletAddress(accounts[0]);
            setConnectionError(null);
            return;
          }
        } catch (injectedError) {
          console.warn("Unable to restore injected wallet session", injectedError);
        }
      }

      if (!hasWalletConnectProjectId) {
        return;
      }

      try {
        const provider = await getProvider();
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        if (!isMounted) {
          return;
        }

        if (accounts[0]) {
          setWalletAddress(accounts[0]);
          setConnectionError(null);
        }
      } catch (walletConnectError) {
        console.warn("Unable to restore WalletConnect session", walletConnectError);
      }
    };

    void restoreWalletSession();

    return () => {
      isMounted = false;
      const injected = injectedProviderRef.current;
      if (injected) {
        injected.removeListener?.("accountsChanged", handleAccountChange);
        injected.removeListener?.("disconnect", handleDisconnect);
      }
    };
  }, []);

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
      metadata: {
        name: walletConnectAppName,
        description: walletConnectAppDescription,
        url: walletConnectAppUrl,
        icons: ["/favicon.ico"],
      },
    });

    provider.on("accountsChanged", (accounts: string[]) => {
      setWalletAddress(accounts[0] ?? null);
      setConnectionError(null);
    });

    provider.on("disconnect", () => {
      setWalletAddress(null);
    });

    providerRef.current = provider;
    return provider;
  };

  const handleConnectWallet = async () => {
    try {
      setConnectionError(null);
      setIsConnecting(true);
      setConnectionStep("metamask");

      const injected = getMetaMaskProvider();
      if (injected?.isMetaMask) {
        try {
          const accounts = (await injected.request({ method: "eth_requestAccounts" })) as string[];
          attachInjectedListeners(injected);
          injectedProviderRef.current = injected;
          setWalletAddress(accounts[0] ?? null);
          return;
        } catch (metaMaskError) {
          if ((metaMaskError as { code?: number })?.code === 4001) {
            setConnectionError("MetaMask request was rejected.");
            return;
          }

          console.warn("MetaMask connection failed, falling back to WalletConnect", metaMaskError);
        }
      }

      if (!hasWalletConnectProjectId) {
        throw new Error("Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID");
      }

      setConnectionStep("walletconnect");
      const provider = await getProvider();
      await provider.connect();
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      setWalletAddress(accounts[0] ?? null);
    } catch (error) {
      console.error("Wallet connection failed", error);
      if ((error as { code?: number })?.code === 4001) {
        setConnectionError("Connection request was rejected in wallet.");
        return;
      }

      if ((error as Error)?.message === "Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID") {
        setConnectionError("WalletConnect is not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local.");
        return;
      }

      setConnectionError(
        "Connection failed. Please unlock MetaMask or configure NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID for WalletConnect.",
      );
    } finally {
      setConnectionStep("idle");
      setIsConnecting(false);
    }
  };

  const walletLabel = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : isConnecting
      ? connectionStep === "metamask"
        ? "Connecting MetaMask..."
        : "Connecting Wallet..."
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
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={handleConnectWallet}
            disabled={isConnecting}
            className="rounded-xl border-[3px] border-black bg-[#836ef9] px-6 py-3 text-base font-black text-black shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_rgba(0,0,0,1)]"
          >
            {walletLabel}
          </button>
          {connectionError ? <p className="max-w-xs text-right text-xs font-semibold text-[#9d1b1b]">{connectionError}</p> : null}
        </div>
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
