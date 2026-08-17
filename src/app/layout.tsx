import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { IBM_Plex_Mono, IBM_Plex_Sans, Rajdhani } from "next/font/google";

import "./globals.css";
import { ALLIANZ_TAG, SERVER_ID } from "@/lib/allianz";

const display = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${ALLIANZ_TAG} Command`,
  description: `Kommandozentrale der Allianz ${ALLIANZ_TAG} · Server #${SERVER_ID}`,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // `lang` muss die tatsächliche Sprache nennen – daran hängen Vorlesehilfen
  // und die Übersetzungsangebote des Browsers.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-ground">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
