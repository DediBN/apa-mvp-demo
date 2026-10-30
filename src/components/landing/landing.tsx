"use client";

// Landing page: one inviting box on top (say what you need, attach your Excel, go), the existing marketing below.
// English by default, Hebrew with the toggle or ?lang=he. The request and file go to the tool at /app, which starts
// right away.

import { FormEvent, useEffect, useRef, useState } from "react";
import { saveHandoff } from "../../lib/handoff";
import { LANDING_CSS, SECTIONS_EN, SECTIONS_HE } from "./marketing";

type Lang = "en" | "he";

const T = {
  en: {
    nav: ["What can it do?", "How is it today?", "How does it work?"],
    start: "Get started",
    toggle: "עברית",
    h1a: "Your AI,",
    h1b: "ready for your business.",
    lead: "Say what you need in your own words. We build it, test it on your own file and show you the result, for the AI you already use. No code, no technical know-how.",
    label: "What should your AI be able to do?",
    ph: "What should your AI do? For example: check my Excel every week and tell me which products are running low",
    attach: "Attach Excel or a file",
    remove: "Remove file",
    go: "Continue",
    works: "For Claude, ChatGPT and other AI tools",
    exLbl: "Or try a real example: a beauty studio's Excel file (made-up data)",
    loading: "Opening the example…",
    tooBig: "The file is too large to carry over. Attach it again in the next step.",
    footer: "Your AI. Your know-how. Your way of working."
  },
  he: {
    nav: ["מה אפשר לעשות?", "איך זה היום?", "איך זה עובד?"],
    start: "בואו נתחיל",
    toggle: "English",
    h1a: "ה־AI שלכם,",
    h1b: "מוכן לעסק שלכם.",
    lead: "ספרו במילים שלכם מה אתם צריכים. נבנה את זה, נבדוק את זה על הקובץ שלכם ונראה לכם את התוצאה, ב־AI שאתם כבר עובדים איתו. בלי קוד ובלי ידע טכני.",
    label: "מה ה־AI שלכם צריך לדעת לעשות?",
    ph: "מה ה־AI שלכם צריך לעשות? לדוגמה: לבדוק כל שבוע את האקסל שלי ולהגיד לי אילו מוצרים עומדים להיגמר",
    attach: "צרפו אקסל או קובץ",
    remove: "הסרת הקובץ",
    go: "המשך",
    works: "ל־Claude, ל־ChatGPT ולכלי AI אחרים",
    exLbl: "או נסו דוגמה אמיתית: קובץ האקסל של סטודיו לקוסמטיקה (נתונים בדויים)",
    loading: "פותחים את הדוגמה…",
    tooBig: "הקובץ גדול מכדי להעביר אותו. צרפו אותו שוב בשלב הבא.",
    footer: "ה־AI שלכם. הידע שלכם. דרך העבודה שלכם."
  }
};

const EXAMPLES: Array<{ key: string; label: Record<Lang, string>; request: Record<Lang, string> }> = [
  {
    key: "stock",
    label: { en: "Keep stock on every product", he: "מלאי קבוע לכל המוצרים" },
    request: {
      en: "Check my stock every week: which products are below minimum, what to order from each supplier and how much it will cost",
      he: "לבדוק את המלאי שלי כל שבוע: אילו מוצרים מתחת למינימום, מה להזמין מכל ספק וכמה זה יעלה"
    }
  },
  {
    key: "prices",
    label: { en: "Check supplier prices", he: "בדיקת מחירי ספקים" },
    request: {
      en: "Check my supplier prices every month and tell me who raised prices, by how much, and what it costs me",
      he: "לבדוק כל חודש את מחירי הספקים ולהגיד לי מי העלה מחירים, בכמה, וכמה זה עולה לי"
    }
  },
  {
    key: "calendar",
    label: { en: "Track the appointment calendar", he: "מעקב אחרי יומן התורים" },
    request: {
      en: "Track my appointment calendar (as of 27.10.2026): regular clients who haven't come back, double bookings, repeat no-shows, bookings that clash with a client's notes, and November birthdays",
      he: "לעקוב אחרי יומן התורים (נכון ל־27.10.2026): לקוחות קבועות שלא חזרו, תורים כפולים, אי־הגעות חוזרות, תורים שמתנגשים עם הערות הלקוחה, וימי הולדת בנובמבר"
    }
  }
];

const SAMPLE_URL = "/samples/studio-noa-demo.xlsx";
const SAMPLE_NAME = "Studio Noa (example).xlsx";
const HERO_CSS = `
.lp[dir=ltr]{direction:ltr}
.lp[dir=ltr] .tick{text-align:left}
.lp .langbtn{min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--ink);font:inherit;font-size:15px;cursor:pointer}
.lp .langbtn:hover{border-color:var(--green)}
.lp .hx{display:flex;flex-direction:column;align-items:center;text-align:center;gap:26px;padding:clamp(36px,8vh,96px) 0 48px}
.lp .hx h1{font-size:clamp(42px,6.6vw,92px);line-height:1.04;margin:0;letter-spacing:-1px}
.lp .hx h1 em{font-style:normal;color:var(--green)}
.lp .hx .lead{margin:0 auto;max-width:700px;font-size:clamp(18px,1.6vw,21px)}
.lp .composer{width:100%;max-width:780px;background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 20px 50px rgba(23,59,53,.10);padding:18px 18px 12px;display:flex;flex-direction:column;gap:10px;text-align:start}
.lp .composer textarea{width:100%;border:0;resize:none;background:transparent;font:inherit;font-size:19px;line-height:1.55;min-height:96px;outline:none;color:var(--ink)}
.lp .composer textarea::placeholder{color:#7d8b85}
.lp .crow{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.lp .cleft{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.lp .attach{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border-radius:12px;color:var(--muted);font-size:15px;font-weight:500;cursor:pointer}
.lp .attach:hover{background:var(--soft);color:var(--ink)}
.lp .chipfile{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 4px 0 12px;border-radius:999px;background:var(--soft);color:var(--deep);font-size:14px;font-weight:700;max-width:100%}
.lp[dir=rtl] .chipfile{padding:0 12px 0 4px}
.lp .chipfile span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px}
.lp .chipfile button{border:0;background:none;color:inherit;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:14px}
.lp .cright{display:flex;align-items:center;gap:12px}
.lp .works{font-size:13px;color:var(--muted)}
.lp .go{width:52px;height:52px;display:grid;place-items:center;border:0;border-radius:12px;background:var(--green);color:#fff;cursor:pointer;flex:none}
.lp .go:hover{background:var(--deep)}
.lp .go:disabled{background:#d6dcd3;color:var(--muted);cursor:not-allowed}
.lp[dir=rtl] .go svg{transform:scaleX(-1)}
.lp .hx-ex{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px;max-width:820px}
.lp .hx-ex .lbl{width:100%;font-size:14px;color:var(--muted);margin-bottom:2px}
.lp .exbtn{min-height:44px;padding:0 14px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);font:inherit;font-size:16px;font-weight:500;cursor:pointer}
.lp .exbtn:hover,.lp .exbtn[aria-pressed=true]{background:var(--soft);border-color:var(--green);color:var(--deep);font-weight:700}
.lp .hx-note{font-size:14px;color:var(--warn);background:var(--warnbg);border-radius:10px;padding:10px 14px}
.lp .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media(max-width:520px){.lp .works{display:none}.lp .hx{gap:20px}}
`;

export function Landing() {
  const [lang, setLang] = useState<Lang>("en");
  const [request, setRequest] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [example, setExample] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const t = T[lang];

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "he" || q === "en") setLang(q);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = lang === "he" ? "APA Skills — ה־AI שלכם, מוכן לעסק שלכם" : "APA Skills — Your AI, ready for your business";
  }, [lang]);

  // An example request follows the language switch.
  useEffect(() => {
    const ex = EXAMPLES.find((e) => e.key === example);
    if (ex) setRequest(ex.request[lang]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  async function pickExample(key: string) {
    const ex = EXAMPLES.find((e) => e.key === key);
    if (!ex) return;
    setExample(key);
    setRequest(ex.request[lang]);
    setNote(null);
    if (file?.name === SAMPLE_NAME) return;
    setBusy(true);
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      setFile(new File([blob], SAMPLE_NAME, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    } catch {
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!request.trim() || busy) return;
    setBusy(true);
    // The example key travels only while the example's own file and request are untouched.
    const fileOk = await saveHandoff(request.trim(), lang, file, example && file?.name === SAMPLE_NAME ? example : null);
    if (!fileOk) setNote(t.tooBig);
    window.location.href = `/app?start=1&lang=${lang}`;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS + HERO_CSS }} />
      <div className="lp" id="lp-root" dir={lang === "he" ? "rtl" : "ltr"} lang={lang}>
        <div className="topbar">
          <div className="wrap nav">
            <a href="#top" className="logo">
              <i>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3l2.4 5.2L20 9l-4 4 1 5.6L12 16l-5 2.6L8 13 4 9l5.6-.8z" />
                </svg>
              </i>
              APA <span>Skills</span>
            </a>
            <nav className="navlinks" aria-label={lang === "he" ? "ניווט ראשי" : "Main"}>
              <a href="#examples">{t.nav[0]}</a>
              <a href="#today">{t.nav[1]}</a>
              <a href="#how">{t.nav[2]}</a>
              <button type="button" className="langbtn" lang={lang === "he" ? "en" : "he"} onClick={() => setLang(lang === "he" ? "en" : "he")}>
                {t.toggle}
              </button>
            </nav>
          </div>
        </div>

        <main>
          <section className="wrap hx" id="top">
            <h1>
              {t.h1a}
              <br />
              <em>{t.h1b}</em>
            </h1>
            <p className="lead">{t.lead}</p>
            <form className="composer" onSubmit={submit} noValidate>
              <label htmlFor="need" className="sr">
                {t.label}
              </label>
              <textarea
                id="need"
                rows={3}
                value={request}
                placeholder={t.ph}
                onChange={(e) => {
                  setRequest(e.target.value);
                  setExample(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e as unknown as FormEvent);
                }}
              />
              <div className="crow">
                <div className="cleft">
                  <label className="attach" htmlFor="file">
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />
                    </svg>
                    <span>{t.attach}</span>
                  </label>
                  <input
                    ref={fileInput}
                    type="file"
                    id="file"
                    className="sr"
                    accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt,.md,.json,.pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      setExample(null);
                    }}
                  />
                  {file ? (
                    <span className="chipfile">
                      <span>{file.name}</span>
                      <button
                        type="button"
                        aria-label={t.remove}
                        onClick={() => {
                          setFile(null);
                          if (fileInput.current) fileInput.current.value = "";
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ) : null}
                </div>
                <div className="cright">
                  <span className="works">{t.works}</span>
                  <button className="go" type="submit" disabled={!request.trim() || busy} aria-label={t.go}>
                    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>
              </div>
            </form>
            <div className="hx-ex" role="group" aria-labelledby="exLbl">
              <span className="lbl" id="exLbl">
                {busy && example ? t.loading : t.exLbl}
              </span>
              {EXAMPLES.map((ex) => (
                <button key={ex.key} type="button" className="exbtn" aria-pressed={example === ex.key} onClick={() => pickExample(ex.key)}>
                  {ex.label[lang]}
                </button>
              ))}
            </div>
            {note ? (
              <p className="hx-note" role="alert">
                {note}
              </p>
            ) : null}
          </section>
          <div dangerouslySetInnerHTML={{ __html: lang === "he" ? SECTIONS_HE : SECTIONS_EN }} />
        </main>
        <footer>
          <div className="wrap footerrow">
            <a href="#top" className="logo">
              APA <span>Skills</span>
            </a>
            <span>{t.footer}</span>
          </div>
        </footer>
      </div>
    </>
  );
}
