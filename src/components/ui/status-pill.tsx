interface StatusPillProps {
  label: string;
  tone?: "neutral" | "pass" | "fail" | "action";
}

const toneClassMap: Record<NonNullable<StatusPillProps["tone"]>, string> = {
  neutral: "border-command-border text-command-muted",
  pass: "border-command-pass/40 text-command-pass",
  fail: "border-command-fail/40 text-command-fail",
  action: "border-command-action/50 text-command-action"
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${toneClassMap[tone]}`}>
      {label}
    </span>
  );
}
