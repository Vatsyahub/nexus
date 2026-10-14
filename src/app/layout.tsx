import type { Metadata } from "next";
import { Barlow_Condensed, Cormorant_Garamond, DM_Sans } from "next/font/google";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { COMPANY_NAME, HUB_NAME } from "@/lib/types";
import { hubThemeBootScript, sessionAllowsDarkKnight } from "@/lib/hub-theme";
import "./globals.css";

const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

/** Wordmark only — pairs with DM Sans / Barlow, softer than the UI display face */
const brand = Cormorant_Garamond({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${HUB_NAME} | ${COMPANY_NAME}`,
  description: `Contract tracking hub for ${COMPANY_NAME}`,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const themeBoot = hubThemeBootScript(sessionAllowsDarkKnight(session));

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body
        className={`${display.variable} ${brand.variable} ${body.variable} font-sans antialiased`}
      >
        <Providers session={session}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
