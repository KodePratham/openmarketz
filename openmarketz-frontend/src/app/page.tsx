"use client";

import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  isAddress,
  formatEther,
  parseEther,
} from "ethers";
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import EthereumProvider from "@walletconnect/ethereum-provider";
import {
  getInAppNativeBalance,
  getOrCreateInAppWallet,
  sendInAppTransfer,
} from "../lib/temp-wallet/inAppWallet";

const CODE_LENGTH = 10;
const MONAD_CHAIN_ID = 10143;
const MONAD_CHAIN_ID_HEX = "0x279f";
const MONAD_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "0xD2Dac9f3379F3936d1B69038c6C236Fd9f3d2c9b";

const vaultAbi = [
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function getBalance(address user) view returns (uint256)",
  "function getLockedBalance(address user) view returns (uint256)",
  "function getMinDepositAmount() view returns (uint256)",
  "function getVaultTotalHoldings() view returns (uint256)",
] as const;

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

type WalletConnectProvider = Awaited<ReturnType<typeof EthereumProvider.init>>;

const hasRequestMethod = (value: unknown): value is Eip1193Provider => {
  return Boolean(value && typeof (value as Eip1193Provider).request === "function");
};

const hasWalletConnectSession = (provider: WalletConnectProvider) => {
  return Boolean(provider.connected || provider.session);
};

const getWalletConnectAccounts = (provider: WalletConnectProvider): string[] => {
  if (Array.isArray(provider.accounts) && provider.accounts.length > 0) {
    return provider.accounts.filter((account): account is string => typeof account === "string");
  }

  const namespaces = provider.session?.namespaces;
  if (!namespaces) {
    return [];
  }

  const accounts = Object.values(namespaces)
    .flatMap((namespace) => namespace.accounts ?? [])
    .map((entry) => (typeof entry === "string" ? entry.split(":").pop() ?? "" : ""))
    .filter((entry): entry is string => Boolean(entry));

  return accounts;
};

const normalizeChainId = (chainId: unknown): string => {
  if (typeof chainId === "string") {
    const trimmed = chainId.trim();
    if (trimmed.toLowerCase().startsWith("0x")) {
      return trimmed.toLowerCase();
    }

    if (/^\d+$/.test(trimmed)) {
      return `0x${BigInt(trimmed).toString(16)}`;
    }

    return "";
  }

  if (typeof chainId === "number") {
    if (Number.isFinite(chainId) && chainId >= 0) {
      return `0x${Math.trunc(chainId).toString(16)}`;
    }
    return "";
  }

  if (typeof chainId === "bigint") {
    return `0x${chainId.toString(16)}`;
  }

  return "";
};

export default function Home() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [externalWalletSource, setExternalWalletSource] = useState<"metamask" | "walletconnect" | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionStep, setConnectionStep] = useState<"idle" | "metamask" | "walletconnect">("idle");
  const [inAppWalletAddress, setInAppWalletAddress] = useState<string | null>(null);
  const [inAppWalletBalance, setInAppWalletBalance] = useState("0.0");
  const [inAppWalletMessage, setInAppWalletMessage] = useState<string | null>(null);
  const [inAppWalletError, setInAppWalletError] = useState<string | null>(null);
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferAmount, setTransferAmount] = useState("0.001");
  const [isTransferBusy, setIsTransferBusy] = useState(false);

  const [depositAmount, setDepositAmount] = useState("0.01");
  const [withdrawAmount, setWithdrawAmount] = useState("0.005");
  const [vaultFreeBalance, setVaultFreeBalance] = useState("0.0");
  const [vaultLockedBalance, setVaultLockedBalance] = useState("0.0");
  const [vaultHoldings, setVaultHoldings] = useState("0.0");
  const [minDeposit, setMinDeposit] = useState("0.0");
  const [isVaultBusy, setIsVaultBusy] = useState(false);
  const [vaultMessage, setVaultMessage] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const [codeDigits, setCodeDigits] = useState<string[]>(Array.from({ length: CODE_LENGTH }, () => ""));
  const providerRef = useRef<WalletConnectProvider | null>(null);
  const injectedProviderRef = useRef<Eip1193Provider | null>(null);
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  const hasWalletConnectProjectId = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);
  const walletConnectAppName = process.env.NEXT_PUBLIC_APP_NAME ?? "OpenMarketz";
  const walletConnectAppDescription = process.env.NEXT_PUBLIC_APP_DESCRIPTION ?? "OpenMarketz frontend";
  const walletConnectAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const handleAccountChange = (accounts: unknown) => {
    if (Array.isArray(accounts) && typeof accounts[0] === "string") {
      setWalletAddress(accounts[0] ?? null);
      setExternalWalletSource("metamask");
      return;
    }

    setWalletAddress(null);
    setExternalWalletSource(null);
    setInAppWalletAddress(null);
    setInAppWalletBalance("0.0");
    setVaultFreeBalance("0.0");
    setVaultLockedBalance("0.0");
  };

  const handleDisconnect = () => {
    setWalletAddress(null);
    setExternalWalletSource(null);
    setInAppWalletAddress(null);
    setInAppWalletBalance("0.0");
    setVaultFreeBalance("0.0");
    setVaultLockedBalance("0.0");
  };

  const refreshInAppWalletData = async (mainWallet: string) => {
    const inApp = getOrCreateInAppWallet(mainWallet);
    setInAppWalletAddress(inApp.address);

    const nativeBalanceRaw = await getInAppNativeBalance({
      inAppAddress: inApp.address,
      chainId: MONAD_CHAIN_ID,
      rpcUrl: MONAD_RPC_URL,
    });

    setInAppWalletBalance(formatEther(nativeBalanceRaw));
    if (inApp.created) {
      setInAppWalletMessage("In-app wallet linked to your main wallet.");
    }
  };

  const ensureMonadNetwork = async (provider: Eip1193Provider) => {
    const currentChain = await provider.request({ method: "eth_chainId" });
    if (normalizeChainId(currentChain) === MONAD_CHAIN_ID_HEX) {
      return;
    }

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: MONAD_CHAIN_ID_HEX }],
      });
    } catch (switchError) {
      const code = Number((switchError as { code?: number | string })?.code);
      if (code !== 4902) {
        throw switchError;
      }

      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: MONAD_CHAIN_ID_HEX,
            chainName: "Monad Testnet",
            nativeCurrency: {
              name: "MON",
              symbol: "MON",
              decimals: 18,
            },
            rpcUrls: [MONAD_RPC_URL],
            blockExplorerUrls: ["https://testnet.monadexplorer.com"],
          },
        ],
      });
    }
  };

  const getVaultReader = () => {
    const provider = new JsonRpcProvider(MONAD_RPC_URL, MONAD_CHAIN_ID);
    return new Contract(VAULT_ADDRESS, vaultAbi, provider);
  };

  const refreshVaultData = async () => {
    if (!walletAddress || !isAddress(VAULT_ADDRESS)) {
      return;
    }

    const vault = getVaultReader();
    const [freeBalanceRaw, lockedBalanceRaw, minDepositRaw, holdingsRaw] = await Promise.all([
      vault.getBalance(walletAddress),
      vault.getLockedBalance(walletAddress),
      vault.getMinDepositAmount(),
      vault.getVaultTotalHoldings(),
    ]);

    setVaultFreeBalance(formatEther(freeBalanceRaw));
    setVaultLockedBalance(formatEther(lockedBalanceRaw));
    setMinDeposit(formatEther(minDepositRaw));
    setVaultHoldings(formatEther(holdingsRaw));
  };

  const getActiveSigner = async () => {
    if (externalWalletSource === "walletconnect") {
      const walletConnectProvider = providerRef.current;
      if (!walletConnectProvider || !hasWalletConnectSession(walletConnectProvider)) {
        throw new Error("WalletConnect session is not active. Reconnect your wallet.");
      }

      await ensureMonadNetwork(walletConnectProvider as unknown as Eip1193Provider);
      const browserProvider = new BrowserProvider(walletConnectProvider as unknown as Eip1193Provider);
      return browserProvider.getSigner();
    }

    const injected = getMetaMaskProvider();
    if (!injected) {
      throw new Error("No wallet connected. Connect MetaMask or WalletConnect first.");
    }

    await ensureMonadNetwork(injected);
    const browserProvider = new BrowserProvider(injected);
    return browserProvider.getSigner();
  };

  const getMetaMaskProvider = () => {
    if (typeof window === "undefined") {
      return null;
    }

    const maybeWindow = window as EthereumWindow;
    const injected = maybeWindow.ethereum;
    if (!hasRequestMethod(injected)) {
      return null;
    }

    if (Array.isArray(injected.providers) && injected.providers.length > 0) {
      const availableProviders = injected.providers.filter(hasRequestMethod);
      const metaMaskProvider = availableProviders.find((provider) => provider?.isMetaMask);
      return metaMaskProvider ?? availableProviders[0] ?? null;
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
            setExternalWalletSource("metamask");
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
        if (!hasWalletConnectSession(provider)) {
          return;
        }

        const accounts = getWalletConnectAccounts(provider);
        if (!isMounted) {
          return;
        }

        if (accounts[0]) {
          setWalletAddress(accounts[0]);
          setExternalWalletSource("walletconnect");
          setConnectionError(null);
        }
      } catch (walletConnectError) {
        console.warn("Unable to restore WalletConnect session", walletConnectError);
        const provider = providerRef.current;
        if (provider && typeof provider.disconnect === "function") {
          try {
            await provider.disconnect();
          } catch (disconnectError) {
            console.warn("Could not clear stale WalletConnect session", disconnectError);
          }
        }
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
      chains: [MONAD_CHAIN_ID],
      rpcMap: {
        [MONAD_CHAIN_ID]: MONAD_RPC_URL,
      },
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
      if (accounts[0]) {
        setExternalWalletSource("walletconnect");
      }
      setConnectionError(null);
    });

    provider.on("disconnect", () => {
      setWalletAddress(null);
      setExternalWalletSource((current) => (current === "walletconnect" ? null : current));
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
          await ensureMonadNetwork(injected);
          const accounts = (await injected.request({ method: "eth_requestAccounts" })) as string[];
          attachInjectedListeners(injected);
          injectedProviderRef.current = injected;
          setWalletAddress(accounts[0] ?? null);
          setExternalWalletSource("metamask");
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

      let accounts = getWalletConnectAccounts(provider);
      if (!accounts[0] && typeof provider.enable === "function") {
        accounts = (await provider.enable()) as string[];
      }

      if (!accounts[0] && typeof provider.request === "function") {
        accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      }

      if (!accounts[0]) {
        throw new Error("WalletConnect did not return an account.");
      }

      setWalletAddress(accounts[0] ?? null);
      setExternalWalletSource("walletconnect");
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

  const handleRefreshVault = async () => {
    try {
      setVaultError(null);
      await refreshVaultData();
      if (walletAddress) {
        await refreshInAppWalletData(walletAddress);
      }
      setVaultMessage("Vault data refreshed.");
    } catch (error) {
      console.error("Vault refresh failed", error);
      setVaultError("Could not load vault balances. Verify RPC and contract address.");
    }
  };

  const handleDeposit = async () => {
    try {
      setIsVaultBusy(true);
      setVaultError(null);
      setVaultMessage(null);

      const signer = await getActiveSigner();
      const contract = new Contract(VAULT_ADDRESS, vaultAbi, signer);
      const value = parseEther(depositAmount);
      const minDepositRaw = await contract.getMinDepositAmount();

      if (value < minDepositRaw) {
        setVaultError(`Deposit must be at least ${formatEther(minDepositRaw)} MON.`);
        return;
      }

      const tx = await contract.deposit({ value });
      await tx.wait();

      await handleRefreshVault();
      setVaultMessage(`Deposit confirmed: ${depositAmount} MON.`);
    } catch (error) {
      console.error("Deposit failed", error);
      setVaultError("Deposit transaction failed or was rejected.");
    } finally {
      setIsVaultBusy(false);
    }
  };

  const handleWithdraw = async () => {
    try {
      setIsVaultBusy(true);
      setVaultError(null);
      setVaultMessage(null);

      const signer = await getActiveSigner();
      const contract = new Contract(VAULT_ADDRESS, vaultAbi, signer);
      const amount = parseEther(withdrawAmount);
      const tx = await contract.withdraw(amount);
      await tx.wait();

      await handleRefreshVault();
      setVaultMessage(`Withdraw confirmed: ${withdrawAmount} MON.`);
    } catch (error) {
      console.error("Withdraw failed", error);
      setVaultError("Withdraw transaction failed or was rejected.");
    } finally {
      setIsVaultBusy(false);
    }
  };

  const handleInAppTransfer = async () => {
    if (!walletAddress) {
      setInAppWalletError("Connect your main wallet first.");
      return;
    }

    try {
      setIsTransferBusy(true);
      setInAppWalletError(null);
      setInAppWalletMessage(null);

      const txHash = await sendInAppTransfer({
        primaryAddress: walletAddress,
        to: transferRecipient,
        valueWei: parseEther(transferAmount),
        chainId: MONAD_CHAIN_ID,
        rpcUrl: MONAD_RPC_URL,
      });

      await refreshInAppWalletData(walletAddress);
      setInAppWalletMessage(`In-app transfer confirmed: ${txHash.slice(0, 12)}...`);
    } catch (error) {
      console.error("In-app transfer failed", error);
      setInAppWalletError((error as Error)?.message ?? "In-app transfer failed.");
    } finally {
      setIsTransferBusy(false);
    }
  };

  useEffect(() => {
    if (!isAddress(VAULT_ADDRESS)) {
      setVaultError("Invalid NEXT_PUBLIC_VAULT_ADDRESS value.");
      return;
    }

    if (!walletAddress) {
      return;
    }

    void handleRefreshVault();
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    setInAppWalletError(null);
    void refreshInAppWalletData(walletAddress).catch((error) => {
      console.error("In-app wallet setup failed", error);
      setInAppWalletError("Could not initialize in-app wallet.");
    });
  }, [walletAddress]);

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
    <div className="relative min-h-screen w-full bg-[#f5f0e8] text-black font-sans selection:bg-[#ed7d31]/30">
      <header className="relative z-10 flex w-full items-center justify-between border-b-[3px] border-black bg-[#fdf8f0] px-6 py-6 md:px-12">
        <p className="text-2xl font-black tracking-tight text-black">openmarketz.xyz</p>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={handleConnectWallet}
            disabled={isConnecting}
            className="rounded-xl border-[3px] border-black bg-[#ed7d31] px-6 py-3 text-base font-black text-black shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0px_rgba(0,0,0,1)]"
          >
            {walletLabel}
          </button>
          {connectionError ? <p className="max-w-xs text-right text-xs font-semibold text-[#9d1b1b]">{connectionError}</p> : null}
        </div>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-96px)] items-start justify-center px-6 pb-14 pt-10">
        <section className="w-full max-w-6xl rounded-2xl border-[3px] border-black bg-[#fffdfa] p-8 shadow-[8px_8px_0px_rgba(0,0,0,1)] md:p-12">
          <p className="mb-8 text-center text-base font-black tracking-[0.2em] text-black uppercase">Market Access</p>

          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-center md:gap-6">
            <span className="flex h-16 shrink-0 items-center justify-center rounded-xl border-[3px] border-black bg-[#17a398] px-8 text-xl font-black tracking-widest text-black shadow-[4px_4px_0px_rgba(0,0,0,1)]">
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
                  className="h-16 w-full rounded-xl border-[3px] border-black bg-white text-center text-3xl font-black text-black shadow-[4px_4px_0px_rgba(0,0,0,1)] outline-none transition-transform focus:translate-x-[2px] focus:translate-y-[2px] focus:bg-[#ffe9d7] focus:shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                />
              ))}
            </div>
          </div>

          <p className="mt-10 text-center text-lg font-bold text-black">Enter your 10-digit market code to continue.</p>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <article className="rounded-2xl border-[3px] border-black bg-[#f4fbfa] p-6 shadow-[6px_6px_0px_rgba(0,0,0,1)]">
              <h2 className="text-xl font-black uppercase tracking-wide">Wallet Connection</h2>
              <p className="mt-2 text-sm font-semibold text-[#333]">
                Connect MetaMask or WalletConnect as your main wallet. Your in-app wallet is auto-linked to that address.
              </p>

              <div className="mt-4 space-y-2 text-sm font-semibold">
                <p>
                  Wallet: {walletAddress ?? "Not connected"}
                </p>
                <p>
                  Source: <span className="font-black uppercase">{externalWalletSource ?? "none"}</span>
                </p>
                <p>
                  In-app wallet: {inAppWalletAddress ?? "Not initialized"}
                </p>
                <p>
                  In-app balance: {inAppWalletBalance} MON
                </p>
              </div>

              <p className="mt-3 text-xs font-semibold text-[#7a3d00]">
                Withdrawals use your main wallet signer (gas from user wallet). App-to-app transfers use in-app wallet signing without popup.
              </p>
              {inAppWalletMessage ? <p className="mt-3 text-xs font-semibold text-[#0f6c63]">{inAppWalletMessage}</p> : null}
              {inAppWalletError ? <p className="mt-3 text-xs font-semibold text-[#9d1b1b]">{inAppWalletError}</p> : null}
            </article>

            <article className="rounded-2xl border-[3px] border-black bg-[#fff6ec] p-6 shadow-[6px_6px_0px_rgba(0,0,0,1)]">
              <h2 className="text-xl font-black uppercase tracking-wide">In-App Wallet</h2>
              <p className="mt-2 text-sm font-semibold text-[#333]">Contract: {VAULT_ADDRESS}</p>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-semibold">
                <p className="rounded-lg border-[2px] border-black bg-white px-3 py-2">Free: {vaultFreeBalance} MON</p>
                <p className="rounded-lg border-[2px] border-black bg-white px-3 py-2">Locked: {vaultLockedBalance} MON</p>
                <p className="rounded-lg border-[2px] border-black bg-white px-3 py-2">Min deposit: {minDeposit} MON</p>
                <p className="rounded-lg border-[2px] border-black bg-white px-3 py-2">Vault total: {vaultHoldings} MON</p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wide">Top Up In-App Wallet</label>
                  <input
                    value={depositAmount}
                    onChange={(event) => setDepositAmount(event.target.value)}
                    className="w-full rounded-lg border-[3px] border-black bg-white px-3 py-2 text-sm font-semibold outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleDeposit}
                    disabled={isVaultBusy}
                    className="rounded-lg border-[3px] border-black bg-[#17a398] px-4 py-2 text-sm font-black shadow-[3px_3px_0px_rgba(0,0,0,1)] disabled:opacity-60"
                  >
                    Add Funds
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wide">Cash Out To Wallet</label>
                  <input
                    value={withdrawAmount}
                    onChange={(event) => setWithdrawAmount(event.target.value)}
                    className="w-full rounded-lg border-[3px] border-black bg-white px-3 py-2 text-sm font-semibold outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={isVaultBusy}
                    className="rounded-lg border-[3px] border-black bg-[#f7d046] px-4 py-2 text-sm font-black shadow-[3px_3px_0px_rgba(0,0,0,1)] disabled:opacity-60"
                  >
                    Withdraw Funds
                  </button>
                  <p className="text-[11px] font-semibold text-[#7a3d00]">Gas is paid by your connected main wallet only.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRefreshVault}
                className="mt-4 rounded-lg border-[3px] border-black bg-white px-4 py-2 text-sm font-black shadow-[3px_3px_0px_rgba(0,0,0,1)]"
              >
                Refresh Vault Data
              </button>

              {vaultMessage ? <p className="mt-3 text-xs font-semibold text-[#0f6c63]">{vaultMessage}</p> : null}
              {vaultError ? <p className="mt-3 text-xs font-semibold text-[#9d1b1b]">{vaultError}</p> : null}
            </article>

            <article className="rounded-2xl border-[3px] border-black bg-[#eef5ff] p-6 shadow-[6px_6px_0px_rgba(0,0,0,1)] lg:col-span-2">
              <h2 className="text-xl font-black uppercase tracking-wide">Permissionless App To App Transfer</h2>
              <p className="mt-2 text-sm font-semibold text-[#333]">
                Sends MON directly from the linked in-app wallet without opening MetaMask or WalletConnect confirmation.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input
                  value={transferRecipient}
                  onChange={(event) => setTransferRecipient(event.target.value)}
                  placeholder="Recipient address"
                  className="w-full rounded-lg border-[3px] border-black bg-white px-3 py-2 text-sm font-semibold outline-none"
                />
                <input
                  value={transferAmount}
                  onChange={(event) => setTransferAmount(event.target.value)}
                  placeholder="Amount in MON"
                  className="w-full rounded-lg border-[3px] border-black bg-white px-3 py-2 text-sm font-semibold outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleInAppTransfer}
                disabled={isTransferBusy}
                className="mt-4 rounded-lg border-[3px] border-black bg-[#6dd3ff] px-4 py-2 text-sm font-black shadow-[3px_3px_0px_rgba(0,0,0,1)] disabled:opacity-60"
              >
                Send From In-App Wallet
              </button>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
