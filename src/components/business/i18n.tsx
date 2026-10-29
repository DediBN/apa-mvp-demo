"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "en" | "he";

const STRINGS = {
  en: {
    appTitle: "Make your AI work your way",
    appSubtitle: "Describe a task in a sentence. We ask what we need, build a capability for it, check it, and show you how to install it.",
    langToggle: "עברית",
    steps: ["What do you need?", "Your rules", "Result & check", "Get it & install"],
    nextLabel: "Next:",
    // step 1
    s1Title: "What would you like the AI to do?",
    s1Hint: "One sentence is enough. We'll ask about the details.",
    s1Placeholder: "e.g. Prepare price quotes for me",
    s1Examples: "Or start from an example:",
    s1ExampleList: ["Prepare price quotes for me", "Check supplier invoices against what we agreed", "Draft replies to customer emails", "Turn meeting notes into a task list"],
    s1Attach: "Attach a document (optional)",
    s1AttachHint: "The Excel file you already work with, a price list, a policy or an example of good work. Excel, CSV, PDF, image or text.",
    s1Remove: "Remove",
    s1Reading: "Reading the document…",
    s1Primary: "Continue",
    s1Next: "we'll ask a few short questions about how you do this today.",
    s1Working: "Preparing your questions…",
    // step 2
    s2Title: "Your rules",
    s2Known: "What we already know from you",
    s2Sheets: "Sheets we will use",
    s2SheetsHint: "Only these sheets are sent on. Tap to add or remove one.",
    s2KnownEmpty: "Nothing yet — the questions below fill it in.",
    s2FromDoc: "from your document",
    s2Questions: "A few questions",
    s2Why: "Why we ask:",
    s2Your: "Your answer",
    s2UseSuggestion: "Use the suggestion:",
    s2Suggestion: "suggestion",
    s2Skip: "I don't know / skip",
    s2Skipped: "Skipped — we won't guess this",
    s2Summarize: "Summarize my rules",
    s2SummaryTitle: "Check your rules",
    s2SummaryHint: "Edit anything that is wrong, delete what doesn't apply, or add a rule. The AI will follow exactly this list.",
    s2Business: "Must be right",
    s2Format: "How it looks",
    s2Approved: "your approved suggestion",
    s2Add: "Add a rule",
    s2Delete: "Delete",
    s2Missing: "Open points — we will not guess these",
    s2MissingHint: "The capability will ask about them when they matter.",
    s2Approve: "I checked these rules and they are correct",
    s2Primary: "Approve and build",
    s2Next: "we build the capability and test it on two examples. It usually takes a few minutes.",
    s2Working: "Summarizing…",
    // step 3
    s3Title: "Result & check",
    s3Progress: ["Building your capability", "Preparing two test examples", "Running the examples", "Checking against your rules"],
    s3Example: "Test example",
    s3Generated: "Written by us from your description. It shows how the capability works, but it does not prove it fits your real data.",
    s3RefGenerated: "The price list or reference used here is a sample we made, not yours.",
    s3Output: "The result with your capability",
    s3Baseline: "Show the same request without the capability",
    s3HideBaseline: "Hide",
    s3Scores: "How it did against your rules",
    s3Correct: "Correct for your business",
    s3Format: "In the format you asked for",
    s3Missing: "Asked for missing information",
    s3Invented: "Made-up facts",
    s3BaselineNote: "Without the capability, the AI got only your request — the way you would type it today.",
    s3With: "With capability",
    s3Without: "Without",
    s3None: "no rules of this kind",
    s3VerdictBoth: "The capability was more correct and closer to your format than the AI without it.",
    s3VerdictCorrect: "The capability got the business rules right more often than the AI without it.",
    s3VerdictFormat: "Without the capability the AI was about as correct; the capability mainly improved the format.",
    s3VerdictNone: "No clear improvement on these two examples. The AI without it did about as well. The capability still keeps your rules consistent every time.",
    s3Details: "Details for those who want them",
    s3Options: "What we compared",
    s3Fit: "fit",
    s3Weak: "weak fit — tested, never recommended",
    s3Custom: "Built for you",
    s3BaselineName: "The AI without a capability",
    s3RuleChecks: "Rule by rule",
    s3SkillFile: "The capability file (SKILL.md)",
    s3Rule: "How we choose: only the capability built for you, or a library capability made for this same kind of task, can be recommended, and only if it actually did the task. A library capability replaces the one built for you only when it is clearly better.",
    s3Primary: "Get the capability",
    s3Next: "download it and install it in your AI tool, then try it once.",
    s3Failed: "Some runs failed:",
    s3Retry: "Try again",
    s3NotDoneTitle: "None of the options actually did the task",
    s3NotDone: "Every option declined or only explained what it would need. That is honest, but it is not a result, so we are not recommending anything to install. Change the request or attach the data it needs, and run again.",
    s3NotDoneVerdict: "No recommendation: a refusal is not a win.",
    fxNotTitle: "A skill can't do this on its own",
    fxFileTitle: "This works on your own file",
    fxNeeds: "What would make it work:",
    fxNotHint: "A skill is written instructions for your AI. It can't browse the web or fetch live data, so testing it here would only show refusals.",
    fxFileHint: "Attach the file you already work with (Excel is fine), or continue and we will test on a sample we make up.",
    fxChange: "Change the request",
    fxAttach: "Attach my file",
    fxAnyway: "Continue anyway",
    fxSample: "Continue with a sample",
    // step 4
    s4Title: "Get it & install",
    s4Recommended: "Your capability",
    s4Platform: "Where do you use AI?",
    s4Claude: "Claude",
    s4ChatGPT: "ChatGPT",
    s4Other: "Other",
    s4ClaudeSteps: [
      "Download the file below.",
      "In Claude, open Settings → Capabilities → Skills and choose Upload skill.",
      "Pick the downloaded file. On Team or Enterprise plans an admin may need to allow skills first."
    ],
    s4Download: "Download the capability (.zip)",
    s4ChatSteps: [
      "Copy the instructions below.",
      "In ChatGPT, create a GPT (Explore GPTs → Create) or a Project, and paste them into Instructions.",
      "This is the instructions version: it follows the same rules, but it is not a ChatGPT skill file."
    ],
    s4Copy: "Copy the instructions",
    s4Copied: "Copied",
    s4OtherSteps: ["Copy the instructions and paste them where your AI tool keeps custom instructions or a system prompt."],
    s4FirstUse: "First try",
    s4FirstUseHint: "After installing, send this message and check the result:",
    s4Check: "What to check:",
    s4Source: "Library capability — see the source",
    s4Restart: "Start a new task",
    errorGeneric: "Something went wrong. Please try again."
  },
  he: {
    appTitle: "שה־AI יעבוד בדרך שלכם",
    appSubtitle: "כתבו משימה במשפט אחד. נשאל מה שצריך, נבנה לה יכולת, נבדוק אותה ונראה לכם איך להתקין.",
    langToggle: "English",
    steps: ["מה רוצים לעשות?", "הכללים שלכם", "התוצאה והבדיקה", "קבלת היכולת והתקנה"],
    nextLabel: "השלב הבא:",
    s1Title: "מה תרצו שה־AI יעשה בשבילכם?",
    s1Hint: "מספיק משפט אחד. על הפרטים נשאל אנחנו.",
    s1Placeholder: "למשל: תכין לי הצעות מחיר",
    s1Examples: "או התחילו מדוגמה:",
    s1ExampleList: ["תכין לי הצעות מחיר", "תבדוק חשבוניות ספקים מול מה שסוכם", "תנסח תשובות למיילים של לקוחות", "תהפוך סיכום ישיבה לרשימת משימות"],
    s1Attach: "צרפו מסמך (לא חובה)",
    s1AttachHint: "קובץ האקסל שאתם כבר עובדים איתו, מחירון, מדיניות או דוגמה לעבודה טובה. אקסל, CSV, PDF, תמונה או טקסט.",
    s1Remove: "הסרה",
    s1Reading: "קוראים את המסמך…",
    s1Primary: "המשך",
    s1Next: "נשאל כמה שאלות קצרות על איך אתם עושים את זה היום.",
    s1Working: "מכינים את השאלות…",
    s2Title: "הכללים שלכם",
    s2Known: "מה שכבר ידוע לנו מכם",
    s2Sheets: "הגיליונות שנשתמש בהם",
    s2SheetsHint: "רק הגיליונות האלה נשלחים הלאה. לחצו כדי להוסיף או להוריד.",
    s2KnownEmpty: "עדיין כלום. השאלות למטה ישלימו את זה.",
    s2FromDoc: "מהמסמך שלכם",
    s2Questions: "כמה שאלות",
    s2Why: "למה שואלים:",
    s2Your: "התשובה שלכם",
    s2UseSuggestion: "להשתמש בהצעה:",
    s2Suggestion: "הצעה",
    s2Skip: "לא יודע/ת, לדלג",
    s2Skipped: "דילגתם. לא ננחש את זה",
    s2Summarize: "סכמו לי את הכללים",
    s2SummaryTitle: "בדקו את הכללים שלכם",
    s2SummaryHint: "תקנו מה שלא מדויק, מחקו מה שלא רלוונטי או הוסיפו כלל. ה־AI יעבוד בדיוק לפי הרשימה הזו.",
    s2Business: "חייב להיות נכון",
    s2Format: "איך זה נראה",
    s2Approved: "הצעה שאישרתם",
    s2Add: "הוספת כלל",
    s2Delete: "מחיקה",
    s2Missing: "נקודות פתוחות. את אלה לא ננחש",
    s2MissingHint: "היכולת תשאל עליהן כשהן נחוצות.",
    s2Approve: "בדקתי את הכללים והם נכונים",
    s2Primary: "אישור ובנייה",
    s2Next: "נבנה את היכולת ונבדוק אותה על שתי דוגמאות. זה לוקח בדרך כלל כמה דקות.",
    s2Working: "מסכמים…",
    s3Title: "התוצאה והבדיקה",
    s3Progress: ["בונים את היכולת שלכם", "מכינים שתי דוגמאות לבדיקה", "מריצים את הדוגמאות", "בודקים מול הכללים שלכם"],
    s3Example: "דוגמה לבדיקה",
    s3Generated: "כתבנו אותה לפי התיאור שלכם. היא מראה איך היכולת עובדת, אבל לא מוכיחה התאמה לנתונים האמיתיים שלכם.",
    s3RefGenerated: "המחירון או המסמך שבדוגמה הם דוגמה שהכנו, לא שלכם.",
    s3Output: "התוצאה עם היכולת שלכם",
    s3Baseline: "להציג את אותה בקשה בלי היכולת",
    s3HideBaseline: "הסתרה",
    s3Scores: "איך זה עמד בכללים שלכם",
    s3Correct: "נכון לעסק שלכם",
    s3Format: "בפורמט שביקשתם",
    s3Missing: "ביקש מידע חסר",
    s3Invented: "עובדות שהומצאו",
    s3BaselineNote: "בלי היכולת, ה־AI קיבל רק את הבקשה שלכם, כמו שהייתם מקלידים אותה היום.",
    s3With: "עם היכולת",
    s3Without: "בלי",
    s3None: "אין כללים מהסוג הזה",
    s3VerdictBoth: "עם היכולת התוצאה הייתה נכונה יותר וקרובה יותר לפורמט שלכם מאשר בלעדיה.",
    s3VerdictCorrect: "עם היכולת ה־AI עמד בכללים העסקיים שלכם יותר פעמים מאשר בלעדיה.",
    s3VerdictFormat: "גם בלי היכולת ה־AI היה נכון בערך באותה מידה. היכולת שיפרה בעיקר את הפורמט.",
    s3VerdictNone: "על שתי הדוגמאות האלה אין שיפור ברור. ה־AI בלי היכולת עשה עבודה דומה. היכולת עדיין שומרת על הכללים שלכם באופן קבוע.",
    s3Details: "פירוט למי שרוצה",
    s3Options: "מה השווינו",
    s3Fit: "התאמה",
    s3Weak: "התאמה חלשה. נבדק, אף פעם לא מומלץ",
    s3Custom: "נבנתה בשבילכם",
    s3BaselineName: "ה־AI בלי יכולת",
    s3RuleChecks: "כלל אחר כלל",
    s3SkillFile: "קובץ היכולת (SKILL.md)",
    s3Rule: "איך בוחרים: אפשר להמליץ רק על היכולת שנבנתה בשבילכם, או על יכולת מספרייה שנבנתה לאותו סוג משימה, ורק אם היא באמת ביצעה את המשימה. יכולת מספרייה מחליפה את זו שנבנתה בשבילכם רק כשהיא טובה יותר בבירור.",
    s3Primary: "קבלת היכולת",
    s3Next: "מורידים ומתקינים בכלי ה־AI שלכם, ומנסים פעם אחת.",
    s3Failed: "חלק מההרצות נכשלו:",
    s3Retry: "לנסות שוב",
    s3NotDoneTitle: "אף אחת מהאפשרויות לא ביצעה את המשימה",
    s3NotDone: "כל האפשרויות סירבו או רק הסבירו מה חסר להן. זה כן, אבל זו לא תוצאה, ולכן אנחנו לא ממליצים להתקין שום דבר. שנו את הבקשה או צרפו את הנתונים שהיא צריכה, ונריץ שוב.",
    s3NotDoneVerdict: "אין המלצה: סירוב הוא לא ניצחון.",
    fxNotTitle: "את זה סקיל לא יכול לעשות לבד",
    fxFileTitle: "זה עובד על הקובץ שלכם",
    fxNeeds: "מה יאפשר את זה:",
    fxNotHint: "סקיל הוא הוראות כתובות ל־AI שלכם. הוא לא גולש באינטרנט ולא מביא נתונים חיים, ולכן בדיקה כאן הייתה מראה רק סירובים.",
    fxFileHint: "צרפו את הקובץ שאתם כבר עובדים איתו (אקסל זה מצוין), או המשיכו ונבדוק על דוגמה שנכין.",
    fxChange: "לשנות את הבקשה",
    fxAttach: "לצרף את הקובץ שלי",
    fxAnyway: "להמשיך בכל זאת",
    fxSample: "להמשיך עם דוגמה",
    s4Title: "קבלת היכולת והתקנה",
    s4Recommended: "היכולת שלכם",
    s4Platform: "באיזה כלי AI אתם משתמשים?",
    s4Claude: "Claude",
    s4ChatGPT: "ChatGPT",
    s4Other: "אחר",
    s4ClaudeSteps: [
      "הורידו את הקובץ שלמטה.",
      "ב־Claude פתחו הגדרות ← Capabilities ← Skills ובחרו Upload skill.",
      "בחרו את הקובץ שהורדתם. בחשבונות Team או Enterprise ייתכן שמנהל צריך לאשר skills קודם."
    ],
    s4Download: "הורדת היכולת (zip.)",
    s4ChatSteps: [
      "העתיקו את ההוראות שלמטה.",
      "ב־ChatGPT צרו GPT (Explore GPTs ← Create) או Project, והדביקו אותן ב־Instructions.",
      "זו גרסת ההוראות: היא פועלת לפי אותם כללים, אבל אינה קובץ skill של ChatGPT."
    ],
    s4Copy: "העתקת ההוראות",
    s4Copied: "הועתק",
    s4OtherSteps: ["העתיקו את ההוראות והדביקו אותן במקום שבו כלי ה־AI שלכם שומר הוראות קבועות."],
    s4FirstUse: "ניסיון ראשון",
    s4FirstUseHint: "אחרי ההתקנה שלחו את ההודעה הזו ובדקו את התוצאה:",
    s4Check: "מה לבדוק:",
    s4Source: "יכולת מספרייה. לצפייה במקור",
    s4Restart: "משימה חדשה",
    errorGeneric: "משהו השתבש. נסו שוב."
  }
};

export type Strings = (typeof STRINGS)["en"];
// Keeps the two languages in step: a key missing from Hebrew is a type error.
const _check: Strings = STRINGS.he;
void _check;

const LangContext = createContext<{ lang: Lang; t: Strings; setLang: (l: Lang) => void } | undefined>(undefined);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("apa-lang");
      if (saved === "he" || saved === "en") setLang(saved);
    } catch {
      // storage unavailable: keep English
    }
  }, []);
  const value = useMemo(
    () => ({
      lang,
      t: STRINGS[lang],
      setLang: (l: Lang) => {
        setLang(l);
        try {
          window.localStorage.setItem("apa-lang", l);
        } catch {
          // ignore
        }
      }
    }),
    [lang]
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
