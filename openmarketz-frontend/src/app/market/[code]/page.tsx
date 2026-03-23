import { redirect } from "next/navigation";

type LegacyMarketRouteProps = {
  params: Promise<{ code: string }>;
};

export default async function LegacyMarketRoute({ params }: LegacyMarketRouteProps) {
  const { code } = await params;
  const normalized = String(code || "").trim().toUpperCase();

  if (normalized) {
    redirect(`/amm/${normalized}`);
  }

  redirect("/open");
}
