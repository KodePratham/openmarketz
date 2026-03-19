import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenMarketz",
  description: "Prediction markets on Monad",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${fraunces.variable} ${geistMono.variable} antialiased`}
      >
        <div className="border-b-2 border-black bg-[#7259ff] px-4 py-3 text-center text-sm font-semibold text-white">
          We&apos;re a permissionless prediction markets platform operating on MONAD testnet. More updates are shipping quickly. If you want to contribute or help us get to mainnet, contact <a href="https://twitter.com/prathamkode" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">@prathamkode</a>.
        </div>
        {children}
      </body>
    </html>
  );
}
