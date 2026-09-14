import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

// İki sesli tipografi sistemi: Fraunces, YZ mülakatçının "konuştuğu" anlarda
// (sorular, karşılama/empty-state metinleri) sıcak bir insan tonu taşır;
// Manrope arayüz kromunda (butonlar, skorlar, nav) net ve ölçülü kalır.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DeepInsight Dashboard",
  description: "AI Destekli Mülakat Simülasyonu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${fraunces.variable} ${manrope.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
