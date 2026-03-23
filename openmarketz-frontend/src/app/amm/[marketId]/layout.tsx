import type { Metadata } from "next";
import { ReactNode } from "react";
import { getMarketJsonLd, getMarketMetadata, getMarketSeoSnapshot } from "@/lib/server/marketSeo";

type AmmMarketLayoutProps = {
  children: ReactNode;
  params: Promise<{ marketId: string }>;
};

export async function generateMetadata({ params }: AmmMarketLayoutProps): Promise<Metadata> {
  const { marketId } = await params;
  const snapshot = await getMarketSeoSnapshot(marketId);

  if (!snapshot) {
    return {
      title: "Market Not Found",
      description: "This OpenMarketz market was not found.",
      robots: {
        index: false,
        follow: false,
      },
      alternates: {
        canonical: "/open",
      },
    };
  }

  return getMarketMetadata(snapshot);
}

export default async function AmmMarketLayout({ children, params }: AmmMarketLayoutProps) {
  const { marketId } = await params;
  const snapshot = await getMarketSeoSnapshot(marketId);

  if (!snapshot) {
    return children;
  }

  const jsonLd = JSON.stringify(getMarketJsonLd(snapshot)).replace(/</g, "\\u003c");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      {children}
    </>
  );
}
