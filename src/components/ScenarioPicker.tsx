import { SCENARIO_ORDER, SCENARIOS } from '../scenarios';
import type { ScenarioKey } from '../scenarios';
import './ScenarioPicker.css';

interface Props {
  selected: ScenarioKey | null;
  onSelect: (key: ScenarioKey) => void;
  compact?: boolean;
  liveSelected?: boolean;
  onSelectLive: () => void;
}

export default function ScenarioPicker({
  selected, onSelect, compact = false, liveSelected = false, onSelectLive,
}: Props) {
  return (
    <div className={`scenario-picker${compact ? ' scenario-picker--compact' : ''}`}>
      {!compact && (
        <p className="scenario-picker__label">Choose a scenario to begin</p>
      )}
      <div className="scenario-picker__cards">
        {SCENARIO_ORDER.map(key => {
          const s = SCENARIOS[key];
          return (
            <button
              key={key}
              className={`scenario-card${selected === key ? ' scenario-card--active' : ''}`}
              onClick={() => onSelect(key)}
              aria-pressed={selected === key}
            >
              <span className="scenario-card__icon">{s.icon}</span>
              <span className="scenario-card__label">{s.cardLabel}</span>
              {!compact && (
                <span className="scenario-card__desc">{s.cardDesc}</span>
              )}
            </button>
          );
        })}

        {/* Live Mode card */}
        <button
          className={`scenario-card scenario-card--live${liveSelected ? ' scenario-card--live-active' : ''}`}
          onClick={onSelectLive}
          aria-pressed={liveSelected}
        >
          <span className="scenario-card__icon">⚡</span>
          <span className="scenario-card__label">Live</span>
          {!compact && (
            <>
              <span className="scenario-card__desc">Type your own prompt</span>
              <span className="scenario-card__live-badge">LIVE</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
