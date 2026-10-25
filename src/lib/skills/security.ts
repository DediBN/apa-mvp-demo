// Security signals for a directory skill, shown next to its score. We never run a skill's scripts, but a user who
// installs it in Claude would — so a skill that ships code, shell steps or a non-low audit result is flagged clearly.
export function securityWarning(riskFlags: string[] | undefined): string | null {
  const flags = riskFlags ?? [];
  const audit = flags.find((f) => /risk:\s*(high|medium|critical)/i.test(f));
  if (audit) return "Security audit flagged this skill — read it before installing";
  if (flags.some((f) => /contains code or shell steps/i.test(f))) return "Contains scripts or shell commands — review before installing";
  return null;
}
