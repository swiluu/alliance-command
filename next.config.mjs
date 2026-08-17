import createNextIntlPlugin from "next-intl/plugin";

// Ohne Sprach-Präfix in der Adresse: die Sprache kommt aus dem Konto bzw. dem
// Cookie, nicht aus dem Pfad. Siehe src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions sind in Next 14 stabil; hier nur das Body-Limit anheben,
    // weil ein Stapel Screenshots für die VS-Erfassung mehrere Dutzend Megabyte erreicht.
    serverActions: {
      bodySizeLimit: "48mb",
    },
  },
};

export default withNextIntl(nextConfig);
