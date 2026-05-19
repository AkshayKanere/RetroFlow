import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRetro } from '../context/RetroContext';

export default function GroupBadge({ parentCard, childCards }) {
  const socket = useSocket();
  const { state } = useRetro();
  const [expanded, setExpanded] = useState(false);
  const isFacilitator = state.participant?.is_facilitator;
  const phase = state.retro?.phase;

  function handleUngroup(childId) {
    socket.emit('ungroup-card', { cardId: childId });
  }

  const badgeStyle = {
    background: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    padding: '4px 8px',
    marginBottom: 8,
    fontSize: 12,
  };

  const toggleStyle = {
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontSize: 12,
    padding: 0,
  };

  const childStyle = {
    color: 'var(--text-secondary)',
    fontSize: 12,
    padding: '4px 0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid var(--border)',
    marginTop: 4,
  };

  const ungroupBtnStyle = {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    borderRadius: 3,
    padding: '1px 6px',
    fontSize: 11,
    cursor: 'pointer',
  };

  return (
    <div style={badgeStyle}>
      <button style={toggleStyle} onClick={() => setExpanded(!expanded)}>
        {expanded ? '▾' : '▸'} grouped ({childCards.length})
      </button>
      {expanded && (
        <div>
          {childCards.map((child) => (
            <div key={child.id} style={childStyle}>
              <span>{child.text}</span>
              {isFacilitator && phase === 'grouping' && (
                <button style={ungroupBtnStyle} onClick={() => handleUngroup(child.id)}>
                  ungroup
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
