import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "APA Command Center",
  description: "APA skill acquisition demo — find, test and install Claude skills"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
