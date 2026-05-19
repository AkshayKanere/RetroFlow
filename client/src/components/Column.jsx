import { useState } from 'react';
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
  const config = COLUMN_CONFIG[column];

  const visibleCards = state.cards
    .filter((c) => c.column === column && !c.group_id)
    .sort((a, b) => {
      if (state.retro.phase === 'discussion') {
        return (state.voteCounts[b.id] || 0) - (state.voteCounts[a.id] || 0);
      }
      return new Date(a.created_at) - new Date(b.created_at);
    });

  function handleAddCard(e) {
    e.preventDefault();
    if (!text.trim()) return;
    socket.emit('add-card', { column, text: text.trim() });
    setText('');
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

  const lockedStyle = {
    color: 'var(--text-secondary)',
    fontSize: 12,
    textAlign: 'center',
    padding: '8px 12px 12px',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span>{config.label}</span>
        <span style={{ opacity: 0.8, fontSize: 12 }}>{visibleCards.length}</span>
      </div>
      <div style={bodyStyle}>
        {visibleCards.map((card) => (
          <Card key={card.id} card={card} column={column} />
        ))}
      </div>
      {state.retro.phase === 'adding' ? (
        <form onSubmit={handleAddCard} style={inputRow}>
          <input
            style={inputStyle}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a point..."
          />
          <button style={addBtnStyle} type="submit">Add</button>
        </form>
      ) : (
        <div style={lockedStyle}>Adding cards is locked</div>
      )}
    </div>
  );
}
