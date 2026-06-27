import { useEffect, useState } from 'react';
import './PainScreen.css';

interface Headline {
  source: string;
  text: string;
  date: string;
}

const HEADLINES: Headline[] = [
  { source: 'Reuters',        text: 'Samsung bans ChatGPT after engineers leak proprietary source code to the model',               date: 'May 2023' },
  { source: 'The Verge',      text: 'Italian regulator blocks ChatGPT over privacy concerns after user data exposed',               date: 'Mar 2023' },
  { source: 'Bloomberg',      text: 'Wall Street banks ban staff from using ChatGPT with client data amid compliance fears',        date: 'Feb 2023' },
  { source: 'FT',             text: 'NHS trusts warn clinicians not to enter patient data into AI chatbots',                        date: 'Jun 2023' },
  { source: 'Haaretz',        text: 'Israeli law firms restrict AI use after attorneys paste privileged case files into ChatGPT',   date: 'Sep 2023' },
  { source: 'WSJ',            text: 'JPMorgan restricts employee access to ChatGPT citing data leakage risk',                      date: 'Mar 2023' },
  { source: 'TechCrunch',     text: 'OpenAI confirms bug exposed ChatGPT users\' conversation history and payment info',            date: 'Mar 2023' },
  { source: 'Calcalist',      text: 'Bank of Israel warns financial institutions: AI tools pose systemic data exposure risk',       date: 'Jan 2024' },
];

const STATS = [
  { value: '85%', label: 'of enterprises restrict or block AI tools' },
  { value: '₪2.4M', label: 'average cost of an AI-related data breach' },
  { value: '1 in 3', label: 'employees have pasted sensitive data into ChatGPT' },
];

interface PainScreenProps {
  onContinue: () => void;
}

export default function PainScreen({ onContinue }: PainScreenProps) {
  const [visible, setVisible] = useState<number[]>([]);
  const [statsVisible, setStatsVisible] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);

  useEffect(() => {
    // Reveal headlines one by one
    HEADLINES.forEach((_, i) => {
      setTimeout(() => {
        setVisible(prev => [...prev, i]);
      }, 400 + i * 350);
    });

    // Stats after headlines
    setTimeout(() => setStatsVisible(true), 400 + HEADLINES.length * 350 + 400);

    // CTA after stats
    setTimeout(() => setCtaVisible(true), 400 + HEADLINES.length * 350 + 1200);
  }, []);

  return (
    <div className="pain-screen">
      {/* Header */}
      <div className="pain-header">
        <div className="pain-logo">APA<span>.</span></div>
        <p className="pain-tagline">Zero-Trust AI Gateway</p>
      </div>

      {/* Headline feed */}
      <div className="pain-body">
        <div className="pain-feed-label">
          <span className="pain-dot" />
          ENTERPRISE AI DATA EXPOSURE — INCIDENTS
        </div>

        <div className="pain-feed">
          {HEADLINES.map((h, i) => (
            <div
              key={i}
              className={`pain-headline ${visible.includes(i) ? 'pain-headline--visible' : ''}`}
            >
              <span className="pain-source">{h.source}</span>
              <span className="pain-text">{h.text}</span>
              <span className="pain-date">{h.date}</span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className={`pain-stats ${statsVisible ? 'pain-stats--visible' : ''}`}>
          {STATS.map((s, i) => (
            <div key={i} className="pain-stat">
              <div className="pain-stat-value">{s.value}</div>
              <div className="pain-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className={`pain-cta ${ctaVisible ? 'pain-cta--visible' : ''}`}>
          <p className="pain-cta-text">
            There is a third option.
          </p>
          <button className="pain-cta-btn" onClick={onContinue}>
            See how APA solves this →
          </button>
        </div>
      </div>
    </div>
  );
}
