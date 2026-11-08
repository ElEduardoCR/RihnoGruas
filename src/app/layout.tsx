import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// SF Pro en dispositivos Apple; Inter como respaldo en Windows/Android.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Grúas Rhino", template: "%s · Grúas Rhino" },
  description: "Administra tu flotilla con Rhino: un asistente que te guía y ejecuta operaciones desde el chat y WhatsApp.",
};

export const viewport: Viewport = {
  themeColor: "#f6f6f7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${inter.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
