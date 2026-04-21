import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VU MIF Naujienų Portalas",
  description: "Vilniaus universiteto Matematikos ir informatikos fakulteto naujienų informacinė sistema",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lt">
      <body>{children}</body>
    </html>
  );
}
