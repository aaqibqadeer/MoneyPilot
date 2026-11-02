import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Providers } from "@/components/providers";
import { ThemeStyle } from "@/components/theme-style";
import { DEFAULT_THEME, isThemeName } from "@/lib/themes";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "MoneyPilot", template: "%s · MoneyPilot" },
  description: "Personal finance with an AI co-pilot.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1f2b" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const t = (await cookies()).get("mp_theme")?.value;
  const theme = isThemeName(t) ? t : DEFAULT_THEME;
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <ThemeStyle />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
