import type { JSX } from 'react';

interface Props {
  onSignal: (id: string) => void;
  currentSignal: string | null;
  t: (key: string) => string;
}

export function ConfidenceButtons({ onSignal, currentSignal, t }: Props): JSX.Element {
  const SIGNALS = [
    { id: 'confused', emoji: '😕', label: t('I feel confused') },
    { id: 'thinking', emoji: '🤔', label: t('I am thinking') },
    { id: 'good', emoji: '😊', label: t('I got it') },
  ];
  return (
    <div className="confidence-buttons">
      {SIGNALS.map(s => (
        <button
          key={s.id}
          className={`confidence-btn ${currentSignal === s.id ? 'active' : ''}`}
          onClick={() => onSignal(s.id)}
        >
          {s.emoji} {s.label}
        </button>
      ))}
    </div>
  );
}
