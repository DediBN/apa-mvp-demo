import type { Scenario } from '../scenarios';

export interface StageProps {
  active: boolean;
  done: boolean;
  scenario: Scenario | null;
  onComplete: () => void;
}
