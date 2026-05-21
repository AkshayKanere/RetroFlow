import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRetro } from '../context/RetroContext';
import Card from './Card';

const COLUMN_CONFIG = {
  well: { label: 'Went Well', color: 'var(--color-well)' },
  didnt: { label: "Didn't Go Well", color: 'var(--color-didnt)' },
  action: { label: 'Action Items', color: 'var(--color-action)' },
};

export default function Column({ column }) {
  const socket = useSocket();
  const { state } = useRetro();
  const [text, setText] = useState('');
  const [sectionSummary, setSectionSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [rephraseLoading, setRephraseLoading] = useState(false);
  const config = COLUMN_CONFIG[column];

  const visibleCards = state.cards
    .filter((c) => c.column === column && !c.group_id)
    .sort((a, b) => {
      if (state.retro?.phase === 'voting' || state.retro?.phase === 'discussion') {
        const diff = (state.voteCounts[b.id] || 0) - (state.voteCounts[a.id] || 0);
        if (diff !== 0) return diff;
      }
      return new Date(a.created_at) - new Date(b.created_at);
    });

  const cardCount = visibleCards.length;
  const retroId = state.retro?.id;
  const phase = state.retro?.phase;

  useEffect(() => {
    if (cardCount === 0 || !retroId || (phase !== 'discussion' && phase !== 'ended')) {
      setSectionSummary('');
      return;
    }
    setSummaryLoading(true);
    fetch(`/api/retros/${retroId}/section-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column }),
    })
      .then((res) => res.json())
      .then((data) => setSectionSummary(data.summary || ''))
      .catch(() => setSectionSummary(''))
      .finally(() => setSummaryLoading(false));
  }, [phase, retroId, column, cardCount]);

  function handleAddCard(e) {
    e.preventDefault();
    if (!text.trim()) return;
    socket.emit('add-card', { column, text: text.trim() });
    setText('');
  }

  function handleRephrase() {
    if (!text.trim() || rephraseLoading) return;
    setRephraseLoading(true);
    fetch('/api/rephrase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    })
      .then((res) => res.json())
      .then((data) => { if (data.rephrased) setText(data.rephrased); })
      .catch(() => {})
      .finally(() => setRephraseLoading(false));
  }

  const containerStyle = {
    background: 'var(--bg-secondary)',
    borderRadius: 10,
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const headerStyle = {
    background: config.color,
    color: '#fff',
    padding: '10px 16px',
    fontWeight: 600,
    fontSize: 14,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const bodyStyle = {
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flex: 1,
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 260px)',
  };

  const inputRow = {
    display: 'flex',
    gap: 8,
    padding: '0 12px 12px',
  };

  const inputStyle = {
    flex: 1,
    padding: '8px 12px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
  };

  const addBtnStyle = {
    padding: '8px 16px',
    background: config.color,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
  };

  const rephraseBtnStyle = {
    padding: '8px 12px',
    background: 'var(--border)',
    color: 'var(--text-primary)',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
  };

  const lockedStyle = {
    color: 'var(--text-secondary)',
    fontSize: 12,
    textAlign: 'center',
    padding: '8px 12px 12px',
  };

  const summaryStyle = {
    padding: '4px 12px 0',
    fontSize: 12,
    fontStyle: 'italic',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span>{config.label}</span>
        <span style={{ opacity: 0.8, fontSize: 12 }}>{visibleCards.length}</span>
      </div>
      {cardCount > 0 && (
        <div style={summaryStyle}>
          {summaryLoading ? 'Summarizing...' : sectionSummary}
        </div>
      )}
      <div style={bodyStyle}>
        {visibleCards.map((card) => (
          <Card key={card.id} card={card} column={column} />
        ))}
      </div>
      {state.retro?.phase === 'adding' ? (
        <form onSubmit={handleAddCard} style={inputRow}>
          <input
            style={inputStyle}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a point..."
            maxLength={500}
            aria-label="Add a point"
          />
          {text.trim() && (
            <button
              style={rephraseBtnStyle}
              type="button"
              disabled={rephraseLoading}
              onClick={handleRephrase}
              aria-label="Rephrase with AI"
            >
              {rephraseLoading ? '...' : 'AI'}
            </button>
          )}
          <button style={addBtnStyle} type="submit" aria-label={"Add card to " + config.label}>Add</button>
        </form>
      ) : (
        <div style={lockedStyle}>Adding cards is locked</div>
      )}
    </div>
  );
}
