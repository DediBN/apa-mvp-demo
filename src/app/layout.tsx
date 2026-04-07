import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "APA Command Center",
  description: "APA MVP Meta-Agent orchestration demo"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
