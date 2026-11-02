import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MoneyPilot",
    short_name: "MoneyPilot",
    description: "Personal finance with an AI co-pilot.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fbfb",
    theme_color: "#007974",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
