import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acme Connector Sandbox",
  description: "Minimal Next.js sandbox for exercising the connectors service.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
