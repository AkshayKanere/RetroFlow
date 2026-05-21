import { useState } from 'react';
import { useRetro } from '../context/RetroContext';

export default function Summary() {
  const { state } = useRetro();
  const [collapsed, setCollapsed] = useState(false);

  const containerStyle = {
    margin: '0 24px 24px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    overflow: 'hidden',
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    cursor: 'pointer',
    color: 'var(--text-primary)',
    fontWeight: 600,
    fontSize: 14,
  };

  const bodyStyle = {
    padding: '0 16px 16px',
    color: 'var(--text-secondary)',
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle} onClick={() => setCollapsed(!collapsed)}>
        <span>{collapsed ? '▸' : '▾'} Summary</span>
      </div>
      {!collapsed && (
        <div style={bodyStyle}>
          {state.summary
            ? (typeof state.summary === 'object' ? state.summary.text : state.summary)
            : 'Summary will be generated automatically as cards are added...'}
        </div>
      )}
    </div>
  );
}
