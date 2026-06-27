import { useState } from "react";
import { LandingScreen } from "./landing-screen";
import App from "../../App";

export function HomePageShell() {
  const [screen, setScreen] = useState<"landing" | "demo">("landing");

  if (screen === "landing") {
    return <LandingScreen onStart={() => setScreen("demo")} />;
  }

  return <App />;
}
