import type { Metadata, Viewport } from "next";
import { getLocale } from "next-intl/server";
import { project } from "@/shared/config/project";
import { fontVariables } from "./fonts/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: project.name,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${fontVariables} antialiased`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
