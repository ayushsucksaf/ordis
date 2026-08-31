import type { Metadata, Viewport } from "next";
import "./globals.css";
import PWARegister from "./PWARegister";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0d0d0d",
};

export const metadata: Metadata = {
  title: "ORDIS - Mobile IDE",
  description: "Monochrome dark mobile coding IDE for Android",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#0d0d0d", color: "#e6e6e6", overflow: "hidden" }}>
        <PWARegister />
        {children}
      </body>
    </html>
  );
}