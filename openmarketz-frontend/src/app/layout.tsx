import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans, Libre_Baskerville } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

const libreBaskerville = Libre_Baskerville({
  variable: "--font-libre-baskerville",
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
        className={`${instrumentSans.variable} ${libreBaskerville.variable} ${geistMono.variable} antialiased`}
      >
        <div className="border-b border-[#d8d2ff] bg-[#f2efff] px-4 py-3 text-center text-sm font-medium text-[#2a1f66]">
          We&apos;re a permissionless prediction markets platform operating on MONAD testnet. We hope to see a lot of changes in the upcoming days, if you wish to contribute to the project or help it get on the mainnet please contact <a href="https://twitter.com/prathamkode" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[#6e54ff]">@prathamkode</a>. We hope you enjoy!
        </div>
        {children}
      </body>
    </html>
  );
}
