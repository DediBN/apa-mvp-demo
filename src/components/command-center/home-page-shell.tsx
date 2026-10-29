"use client";

import { useEffect } from "react";
import { CommandShell } from "./command-shell";
import { UIModeProvider, useUIMode } from "./ui-mode-context";
import { BusinessFlow } from "../business/business-flow";
import { LangProvider, useLang } from "../business/i18n";

function HeaderModeToggle() {
  const { mode, setMode } = useUIMode();
  const item = (active: boolean) =>
    `rounded px-2 py-1 uppercase tracking-[0.12em] transition ${active ? "bg-command-panelElevated text-command-action" : "text-command-muted hover:text-command-text"}`;

  return (
    <div className="inline-flex items-center rounded-lg border border-command-border bg-command-panel px-2 py-1.5 font-mono text-xs" dir="ltr">
      <button type="button" onClick={() => setMode("business")} aria-pressed={mode === "business"} className={item(mode === "business")}>
        Business
      </button>
      <span className="px-1 text-command-muted" aria-hidden="true">
        |
      </span>
      <button type="button" onClick={() => setMode("technology")} aria-pressed={mode === "technology"} className={item(mode === "technology")}>
        Technology
      </button>
    </div>
  );
}

function LanguageToggle() {
  const { lang, setLang, t } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "he" : "en")}
      className="inline-flex min-h-[36px] items-center rounded-lg border border-command-border bg-command-panel px-3 text-sm text-command-text hover:border-command-action"
      lang={lang === "en" ? "he" : "en"}
    >
      {t.langToggle}
    </button>
  );
}

function HomePageContent() {
  const { mode, setMode } = useUIMode();
  const { t, lang, setLang } = useLang();
  // ?lang=he|en sets the language (the landing page passes it); the tool opens in the technical view by default,
  // ?mode=business opens the plain-language view.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const l = q.get("lang");
    if (l === "he" || l === "en") setLang(l);
    if (q.get("mode") === "business") setMode("business");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const business = mode === "business";

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 md:px-8 md:py-10" data-ui-mode={mode}>
      <section className="mb-6 command-card p-5 md:p-6 animate-fadeUp" dir={business && lang === "he" ? "rtl" : "ltr"}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <a href="/" className="font-mono text-xs uppercase tracking-[0.22em] text-command-action" dir="ltr">
              APA Skills
            </a>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-command-text md:text-3xl">{business ? t.appTitle : "Skill Command Center"}</h1>
            <p className="mt-2 max-w-2xl text-sm text-command-muted md:text-base">
              {business ? t.appSubtitle : "Describe a business need — find, test and install the right Claude skill for it."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {business ? <LanguageToggle /> : null}
            <HeaderModeToggle />
          </div>
        </div>
      </section>

      {business ? <BusinessFlow /> : <CommandShell />}
    </main>
  );
}

export function HomePageShell() {
  return (
    <LangProvider>
      <UIModeProvider initialMode="technology">
        <HomePageContent />
      </UIModeProvider>
    </LangProvider>
  );
}
