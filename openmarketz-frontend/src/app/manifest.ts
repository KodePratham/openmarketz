import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OpenMarketz | Testnet Prediction Markets",
    short_name: "OpenMarketz",
    description: "Trade and create prediction markets on Sepolia with USDC collateral.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7259ff",
    icons: [
      {
        src: "/Open-logo.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/Open-logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
