// Public landing page. The skill tool itself lives at /app.
import type { Metadata } from "next";
import { Landing } from "../components/landing/landing";

export const metadata: Metadata = {
  title: "APA Skills — Your AI, ready for your business",
  description: "Say what you need in your own words. APA Skills builds a skill for it, tests it on your own file, and shows you how to install it in the AI you already use."
};

export default function LandingPage() {
  return <Landing />;
}
