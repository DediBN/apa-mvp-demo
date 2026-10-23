// Public landing page for small and mid-sized businesses. The skill tool itself lives at /app.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "APA Skills — ה-AI שלכם יכול לעשות הרבה יותר",
  description: "ספרו במילים פשוטות מה אתם צריכים, ותוך כשמונה דקות ה-AI שלכם יודע לעשות את זה."
};

const css = `@import url("https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&family=Frank+Ruhl+Libre:wght@700;900&display=swap");
.lp{--font-heebo:"Heebo";--font-frank:"Frank Ruhl Libre"}
.lp .wrap{max-width:1120px;margin:0 auto;padding:0 24px;box-sizing:border-box}
.lp a:hover{opacity:.9}
.lp .two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
.lp .three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.lp .four{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.lp .five{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
@media (max-width:900px){.lp .four{grid-template-columns:repeat(2,minmax(0,1fr))}.lp .five,.lp .three{grid-template-columns:repeat(1,minmax(0,1fr))}}
@media (max-width:640px){.lp .two,.lp .four{grid-template-columns:repeat(1,minmax(0,1fr))}.lp .hero-title{font-size:38px !important}}`;

export default function LandingPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
<div dir="rtl" lang="he" className="lp" style={{ minHeight: "100vh",  fontFamily: "var(--font-heebo), system-ui, sans-serif", color: "#17212E", background: "#FFFFFF", lineHeight: "1.6" }}>

<header style={{ background: "#F3F6F4", padding: "72px 0 80px", borderBottom: "1px solid #DDE5E1" }}>
<div className="wrap" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
<div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#0F5F57", display: "flex", alignItems: "center", justifyContent: "center" }}>
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.4 5.2L20 9l-4 4 1 5.6L12 16l-5 2.6L8 13 4 9l5.6-.8z"></path></svg>
</div>
<span style={{ fontWeight: "700", fontSize: "18px" }}>APA Skills</span>
</div>
<h1 className="hero-title" style={{ margin: "0", fontFamily: "var(--font-frank), serif", fontWeight: "900", fontSize: "56px", lineHeight: "1.15", maxWidth: "820px" }}>ה-AI שלכם יודע לעשות הרבה יותר ממה שאתם מבקשים ממנו.</h1>
<p style={{ margin: "0", fontSize: "21px", maxWidth: "720px", color: "#33404F" }}>ספרו לנו במילים פשוטות איזו עבודה אתם רוצים שהוא יעשה. תוך כשמונה דקות הוא יודע לעשות אותה, לפי הכללים, המחירים והסגנון של העסק שלכם.</p>
<div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px" }}>
<a href="/app" style={{ display: "inline-flex", alignItems: "center", minHeight: "48px", padding: "0 28px", borderRadius: "12px", background: "#0F5F57", color: "#FFFFFF", fontWeight: "700", fontSize: "17px", textDecoration: "none" }}>התחילו עכשיו</a>
<a href="#how" style={{ display: "inline-flex", alignItems: "center", minHeight: "48px", padding: "0 24px", borderRadius: "12px", border: "1.5px solid #0F5F57", color: "#0F5F57", fontWeight: "700", fontSize: "17px", textDecoration: "none" }}>איך זה עובד</a>
</div>
<p style={{ margin: "0", fontSize: "15px", color: "#4B5866" }}>בלי קוד. בלי מונחים טכניים. בלי לחפש לבד.</p>
</div>
</header>

<section style={{ padding: "88px 0 72px" }}>
<div className="wrap" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
<div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "760px" }}>
<span style={{ fontSize: "15px", fontWeight: "700", color: "#0F5F57" }}>הבעיה</span>
<h2 style={{ margin: "0", fontFamily: "var(--font-frank), serif", fontSize: "38px", lineHeight: "1.2" }}>רוב העסקים משתמשים ב-AI כמו במנוע חיפוש חכם</h2>
<p style={{ margin: "0", fontSize: "18px", color: "#33404F" }}>שואלים שאלה, מקבלים תשובה יפה. ברכה ליום הולדת, מייל מנומס, אולי בוט שעונה ללקוחות. זה נחמד, אבל זה לא חוסך שעות עבודה.</p>
</div>
<div className="three">
<div style={{ background: "#FFFFFF", border: "1px solid #DDE5E1", borderRadius: "16px", padding: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
<strong style={{ fontSize: "19px" }}>מסבירים מההתחלה, כל פעם מחדש</strong>
<p style={{ margin: "0", fontSize: "16px", color: "#4B5866" }}>ה-AI לא זוכר את המחירון, את התנאים ואת הפורמט שלכם. כל משימה מתחילה בהסבר ארוך.</p>
</div>
<div style={{ background: "#FFFFFF", border: "1px solid #DDE5E1", borderRadius: "16px", padding: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
<strong style={{ fontSize: "19px" }}>תוצאה שונה בכל פעם</strong>
<p style={{ margin: "0", fontSize: "16px", color: "#4B5866" }}>אותה בקשה, שני עובדים, שתי תשובות שונות. אי אפשר לבנות על זה תהליך.</p>
</div>
<div style={{ background: "#FFFFFF", border: "1px solid #DDE5E1", borderRadius: "16px", padding: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
<strong style={{ fontSize: "19px" }}>תשובה כללית, לא תשובה שלכם</strong>
<p style={{ margin: "0", fontSize: "16px", color: "#4B5866" }}>הצעת מחיר שנשמעת טוב אבל לא לפי הכללים שלכם, היא עוד עבודה ולא פחות עבודה.</p>
</div>
</div>
<p style={{ margin: "0", fontSize: "18px", fontWeight: "500", background: "#F3F6F4", borderRadius: "14px", padding: "20px 24px" }}>הפתרון קיים כבר היום: "יכולות" שמלמדות את ה-AI תהליך עבודה שלם (בעולם הטכני קוראים להן skills). הבעיה היא להגיע אליהן.</p>
</div>
</section>

<section style={{ padding: "72px 0", background: "#F7F7F8", borderTop: "1px solid #E6E7EA", borderBottom: "1px solid #E6E7EA" }}>
<div className="wrap" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
<div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "800px" }}>
<span style={{ fontSize: "15px", fontWeight: "700", color: "#9A3412" }}>הדרך הקיימת</span>
<h2 style={{ margin: "0", fontFamily: "var(--font-frank), serif", fontSize: "38px", lineHeight: "1.2" }}>ככה נראה היום "ללמד את ה-AI לעשות משהו"</h2>
<p style={{ margin: "0", fontSize: "18px", color: "#33404F" }}>המסלול נבנה למתכנתים. כל שלב דורש ידע טכני, וכל טעות מחזירה להתחלה.</p>
</div>
<div className="four">
<div style={{ background: "#FFFFFF", border: "1px dashed #B8BCC4", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "13px", fontWeight: "700", color: "#6B7280" }}>שלב 1</span>
<strong style={{ fontSize: "16px" }}>להבין מה זה בכלל</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>Skills, GPTs, Projects, Gems, Agents, MCP. כל פלטפורמה קוראת לזה אחרת.</p>
</div>
<div style={{ background: "#FFFFFF", border: "1px dashed #B8BCC4", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "13px", fontWeight: "700", color: "#6B7280" }}>שלב 2</span>
<strong style={{ fontSize: "16px" }}>לחפש בספריות</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>באחת הספריות הגדולות יש יותר מ-800,000 skills. רובם באנגלית, ונראים כמעט אותו דבר.</p>
</div>
<div style={{ background: "#FFFFFF", border: "1px dashed #B8BCC4", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "13px", fontWeight: "700", color: "#6B7280" }}>שלב 3</span>
<strong style={{ fontSize: "16px" }}>לקרוא קבצי הגדרה</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>לפתוח את GitHub, למצוא קובץ SKILL.md, להבין YAML ולנחש אם הוא מתאים לעסק שלכם.</p>
</div>
<div style={{ background: "#FFFFFF", border: "1px dashed #B8BCC4", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "13px", fontWeight: "700", color: "#6B7280" }}>שלב 4</span>
<strong style={{ fontSize: "16px" }}>לבדוק שהוא בטוח</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>מחקר על כ-31 אלף skills מצא דפוס שדורש בדיקת אבטחה בכרבע מהם.</p>
<span style={{ alignSelf: "flex-start", fontSize: "12px", fontWeight: "700", color: "#9A3412", background: "#FDEBE3", borderRadius: "999px", padding: "2px 10px" }}>סיכון</span>
</div>
<div style={{ background: "#FFFFFF", border: "1px dashed #B8BCC4", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "13px", fontWeight: "700", color: "#6B7280" }}>שלב 5</span>
<strong style={{ fontSize: "16px" }}>לארוז ולהתקין</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>להוריד, לדחוס לקובץ ZIP ששם התיקייה בו תואם בדיוק, להעלות בהגדרות ולהפעיל הרשאות.</p>
</div>
<div style={{ background: "#FFFFFF", border: "1px dashed #B8BCC4", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "13px", fontWeight: "700", color: "#6B7280" }}>שלב 6</span>
<strong style={{ fontSize: "16px" }}>לבדוק שזה באמת עוזר</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>להשוות מול ה-AI בלי התוספת, על עבודה אמיתית. אין כלי פשוט שעושה את זה בשבילכם.</p>
<span style={{ alignSelf: "flex-start", fontSize: "12px", fontWeight: "700", color: "#9A3412", background: "#FDEBE3", borderRadius: "999px", padding: "2px 10px" }}>לרוב מדלגים</span>
</div>
<div style={{ background: "#FFFFFF", border: "1px dashed #B8BCC4", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "13px", fontWeight: "700", color: "#6B7280" }}>שלב 7</span>
<strong style={{ fontSize: "16px" }}>לא מצאתם? לכתוב לבד</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>לנסח הוראות מדויקות, כללים, חריגים ופורמט. זו עבודה של מהנדס, לא של מנהלת משרד.</p>
</div>
<div style={{ background: "#FFFFFF", border: "1px dashed #B8BCC4", borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "13px", fontWeight: "700", color: "#6B7280" }}>שלב 8</span>
<strong style={{ fontSize: "16px" }}>ולחזור על הכול</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>כל גרסה חדשה של ה-AI יכולה לשנות את התוצאה. מה שעבד אתמול צריך בדיקה מחדש.</p>
</div>
</div>
<div className="three">
<div style={{ borderRadius: "14px", padding: "18px 20px", background: "#FFFFFF", border: "1px solid #E6E7EA" }}>
<strong style={{ fontSize: "16px" }}>או: לשכור יועץ AI</strong>
<p style={{ margin: "4px 0 0", fontSize: "14px", color: "#4B5866" }}>פרויקט, תיאומים וחשבונית. ומה שהוא בנה נשאר אצלו בראש.</p>
</div>
<div style={{ borderRadius: "14px", padding: "18px 20px", background: "#FFFFFF", border: "1px solid #E6E7EA" }}>
<strong style={{ fontSize: "16px" }}>או: לשלוח עובד לקורס</strong>
<p style={{ margin: "4px 0 0", fontSize: "14px", color: "#4B5866" }}>שבועות של לימוד, ועדיין צריך לעשות את כל השלבים למעלה.</p>
</div>
<div style={{ borderRadius: "14px", padding: "18px 20px", background: "#FFFFFF", border: "1px solid #E6E7EA" }}>
<strong style={{ fontSize: "16px" }}>או: להשאיר את זה כמו שזה</strong>
<p style={{ margin: "4px 0 0", fontSize: "14px", color: "#4B5866" }}>וממשיכים להסביר ל-AI מההתחלה, כל יום.</p>
</div>
</div>
</div>
</section>

<section id="how" style={{ padding: "88px 0 72px" }}>
<div className="wrap" style={{ display: "flex", flexDirection: "column", gap: "36px" }}>
<div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "780px" }}>
<span style={{ fontSize: "15px", fontWeight: "700", color: "#0F5F57" }}>הפתרון שלנו</span>
<h2 style={{ margin: "0", fontFamily: "var(--font-frank), serif", fontSize: "38px", lineHeight: "1.2" }}>אתם אומרים מה אתם צריכים. אנחנו עושים את כל השאר.</h2>
<p style={{ margin: "0", fontSize: "18px", color: "#33404F" }}>שלושה צעדים מצדכם. כל השלבים המסובכים קורים מאחורי הקלעים, אוטומטית.</p>
</div>
<div className="three">
<div style={{ background: "#0F5F57", color: "#FFFFFF", borderRadius: "18px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}>
<span style={{ fontFamily: "var(--font-frank), serif", fontSize: "44px", fontWeight: "900", lineHeight: "1" }}>1</span>
<strong style={{ fontSize: "21px" }}>ספרו</strong>
<p style={{ margin: "0", fontSize: "16px", color: "#E3F1EE" }}>"אני רוצה שכל הצעת מחיר תיבנה לפי המחירון שלנו, עם הנחת כמות ותנאי תשלום שוטף 30."</p>
</div>
<div style={{ background: "#0F5F57", color: "#FFFFFF", borderRadius: "18px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}>
<span style={{ fontFamily: "var(--font-frank), serif", fontSize: "44px", fontWeight: "900", lineHeight: "1" }}>2</span>
<strong style={{ fontSize: "21px" }}>אשרו</strong>
<p style={{ margin: "0", fontSize: "16px", color: "#E3F1EE" }}>אנחנו מתרגמים את הבקשה להגדרה ברורה. אתם קוראים, מתקנים אם צריך, ומאשרים.</p>
</div>
<div style={{ background: "#0F5F57", color: "#FFFFFF", borderRadius: "18px", padding: "28px", display: "flex", flexDirection: "column", gap: "10px" }}>
<span style={{ fontFamily: "var(--font-frank), serif", fontSize: "44px", fontWeight: "900", lineHeight: "1" }}>3</span>
<strong style={{ fontSize: "21px" }}>עובדים</strong>
<p style={{ margin: "0", fontSize: "16px", color: "#E3F1EE" }}>מקבלים יכולת מוכנה, עם הוראות התקנה של שלוש לחיצות, ומשתמשים בה מאותו יום.</p>
</div>
</div>
</div>
</section>

<section style={{ padding: "72px 0", background: "#F3F6F4", borderTop: "1px solid #DDE5E1", borderBottom: "1px solid #DDE5E1" }}>
<div className="wrap" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
<div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "780px" }}>
<span style={{ fontSize: "15px", fontWeight: "700", color: "#0F5F57" }}>מה קורה בשמונה הדקות</span>
<h2 style={{ margin: "0", fontFamily: "var(--font-frank), serif", fontSize: "38px", lineHeight: "1.2" }}>מהבקשה שלכם ליכולת שעובדת</h2>
</div>
<div className="five">
<div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "20px", borderTop: "4px solid #0F5F57", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "14px", fontWeight: "700", color: "#0F5F57" }}>דקה 0</span>
<strong style={{ fontSize: "17px" }}>אתם מתארים</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>בעברית, במילים שלכם. אפשר לצרף דוגמה מהעבודה: מחירון, חשבונית, מייל.</p>
</div>
<div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "20px", borderTop: "4px solid #0F5F57", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "14px", fontWeight: "700", color: "#0F5F57" }}>דקה 1</span>
<strong style={{ fontSize: "17px" }}>אתם מאשרים</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>הגדרה קצרה: מה ה-AI יעשה, לפי אילו כללים, ואיך תיראה התוצאה.</p>
</div>
<div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "20px", borderTop: "4px solid #0F5F57", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "14px", fontWeight: "700", color: "#0F5F57" }}>דקות 2–4</span>
<strong style={{ fontSize: "17px" }}>אנחנו מחפשים וכותבים</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>סורקים את הספריות הגדולות, בוחרים את המתאימות, וכותבים גם יכולת שנתפרה במיוחד בשבילכם.</p>
</div>
<div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "20px", borderTop: "4px solid #0F5F57", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "14px", fontWeight: "700", color: "#0F5F57" }}>דקות 4–7</span>
<strong style={{ fontSize: "17px" }}>אנחנו בודקים</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>כל אפשרות עושה את אותה עבודה, ומושווית ל-AI שלכם בלי תוספת. מנצחת רק מי שעושה עבודה טובה יותר.</p>
</div>
<div style={{ background: "#0F5F57", color: "#FFFFFF", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
<span style={{ fontSize: "14px", fontWeight: "700", color: "#CFE9E3" }}>דקה 8</span>
<strong style={{ fontSize: "17px" }}>אתם מקבלים</strong>
<p style={{ margin: "0", fontSize: "14px", color: "#E3F1EE" }}>היכולת המנצחת, ההשוואה שמראה למה היא נבחרה, והוראות התקנה פשוטות.</p>
</div>
</div>
<p style={{ margin: "0", fontSize: "14px", color: "#4B5866" }}>הזמנים משוערים ותלויים באורך הדוגמאות. אין לכם דוגמה לשתף? נבדוק על דוגמאות שנכין בשבילכם לפי התיאור שלכם.</p>
</div>
</section>

<section style={{ padding: "88px 0 72px" }}>
<div className="wrap" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
<div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "780px" }}>
<span style={{ fontSize: "15px", fontWeight: "700", color: "#0F5F57" }}>לדוגמה</span>
<h2 style={{ margin: "0", fontFamily: "var(--font-frank), serif", fontSize: "38px", lineHeight: "1.2" }}>עבודות שחוזרות בכל עסק</h2>
</div>
<div className="two">
<div style={{ border: "1px solid #DDE5E1", borderRadius: "16px", padding: "22px 24px", display: "flex", flexDirection: "column", gap: "6px" }}>
<strong style={{ fontSize: "18px" }}>הצעות מחיר</strong>
<p style={{ margin: "0", fontSize: "15px", color: "#4B5866" }}>לפי המחירון, ההנחות ותנאי התשלום שלכם, באותו פורמט בכל פעם.</p>
</div>
<div style={{ border: "1px solid #DDE5E1", borderRadius: "16px", padding: "22px 24px", display: "flex", flexDirection: "column", gap: "6px" }}>
<strong style={{ fontSize: "18px" }}>בדיקת חשבוניות ספקים</strong>
<p style={{ margin: "0", fontSize: "15px", color: "#4B5866" }}>מול המחיר שסוכם: חיוב כפול, מחיר שגוי, כמות שלא תואמת.</p>
</div>
<div style={{ border: "1px solid #DDE5E1", borderRadius: "16px", padding: "22px 24px", display: "flex", flexDirection: "column", gap: "6px" }}>
<strong style={{ fontSize: "18px" }}>מענה לפניות לקוחות</strong>
<p style={{ margin: "0", fontSize: "15px", color: "#4B5866" }}>בטון של העסק, לפי מדיניות ההחזרות והאחריות שלכם, עם מה שמותר ומה שאסור להבטיח.</p>
</div>
<div style={{ border: "1px solid #DDE5E1", borderRadius: "16px", padding: "22px 24px", display: "flex", flexDirection: "column", gap: "6px" }}>
<strong style={{ fontSize: "18px" }}>סיכום ישיבות ומשימות</strong>
<p style={{ margin: "0", fontSize: "15px", color: "#4B5866" }}>החלטות, אחראים ותאריכים, בטבלה אחת שאפשר לשלוח מיד.</p>
</div>
</div>
</div>
</section>

<section style={{ padding: "0 0 72px" }}>
<div className="wrap">
<div className="two" style={{ background: "#17212E", color: "#FFFFFF", borderRadius: "20px", padding: "36px" }}>
<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
<strong style={{ fontSize: "20px" }}>למה אפשר לסמוך על זה</strong>
<p style={{ margin: "0", fontSize: "16px", color: "#D5DCE4" }}>כל המלצה נבחנת מול ה-AI שלכם בלי תוספת. אם שום יכולת לא עושה עבודה טובה יותר, נגיד לכם את זה.</p>
</div>
<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
<strong style={{ fontSize: "20px" }}>בלי הפתעות</strong>
<p style={{ margin: "0", fontSize: "16px", color: "#D5DCE4" }}>אנחנו לא מריצים קוד של אחרים, מסמנים כל יכולת שדורשת זהירות, ואתם מחליטים אם לשתף דוגמה אמיתית או לעבוד על דוגמה שנכין.</p>
</div>
</div>
</div>
</section>

<section id="start" style={{ padding: "80px 0 96px", background: "#F3F6F4", borderTop: "1px solid #DDE5E1" }}>
<div className="wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "18px", textAlign: "center" }}>
<h2 style={{ margin: "0", fontFamily: "var(--font-frank), serif", fontSize: "40px", lineHeight: "1.2" }}>בחרו תהליך אחד שגוזל לכם זמן.</h2>
<p style={{ margin: "0", fontSize: "19px", color: "#33404F", maxWidth: "640px" }}>נבנה לכם עליו יכולת, נראה לכם את ההבדל על העבודה שלכם, ותחליטו אם להמשיך.</p>
<div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px", marginTop: "6px" }}>
<a href="/app" style={{ display: "inline-flex", alignItems: "center", minHeight: "48px", padding: "0 28px", borderRadius: "12px", background: "#0F5F57", color: "#FFFFFF", fontWeight: "700", fontSize: "17px", textDecoration: "none" }}>נסו עכשיו, על התהליך שלכם</a>
</div>
</div>
</section>

</div>
    </>
  );
}
