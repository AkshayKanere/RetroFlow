import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRetro } from '../context/RetroContext';

const PHASE_LABELS = {
  lobby: 'Waiting for participants',
  adding: 'Adding Points',
  grouping: 'Grouping Cards',
  voting: 'Voting',
  discussion: 'Discussion',
};

export default function Header() {
  const socket = useSocket();
  const { state } = useRetro();
  const { retro, participant, participants, myVotes, llmConfigured } = state;
  const phase = retro?.phase;
  const isFacilitator = participant?.is_facilitator;

  const [autoGrouping, setAutoGrouping] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showApproval, setShowApproval] = useState(false);

  function startPhase(p) {
    socket.emit('start-phase', { phase: p });
  }

  function endPhase() {
    socket.emit('end-phase', {});
  }

  function generateSummary() {
    socket.emit('generate-summary', {});
  }

  async function handleAutoGroup() {
    setAutoGrouping(true);
    const allSuggestions = [];
    const columns = ['well', 'didnt', 'action'];
    for (const column of columns) {
      await new Promise((resolve) => {
        socket.emit('suggest-groupings', { column }, (res) => {
          if (res?.suggestions) {
            allSuggestions.push(...res.suggestions);
          }
          resolve();
        });
      });
    }
    setSuggestions(allSuggestions);
    setAutoGrouping(false);
    if (allSuggestions.length > 0) {
      setShowApproval(true);
    }
  }

  function handleApproveAll() {
    const groupings = suggestions.map((s) => ({
      parentCardId: s.parentCardId,
      childCardIds: s.childCardIds,
    }));
    socket.emit('apply-groupings', { groupings }, () => {
      setShowApproval(false);
      setSuggestions([]);
    });
  }

  function handleCancelApproval() {
    setShowApproval(false);
    setSuggestions([]);
  }

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 24px',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  };

  const logoStyle = {
    color: 'var(--color-well)',
    fontWeight: 700,
    fontSize: 18,
  };

  const titleStyle = {
    color: 'var(--text-primary)',
    fontSize: 16,
    fontWeight: 600,
  };

  const infoStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    fontSize: 13,
    color: 'var(--text-secondary)',
  };

  const phaseStyle = {
    background: 'var(--border)',
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 12,
    color: 'var(--text-primary)',
  };

  const btnStyle = {
    padding: '6px 14px',
    background: 'var(--color-well)',
    color: '#fff',
    border: 'none',
    borderRadius: 5,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };

  return (
    <div style={headerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={logoStyle}>RetroBoard</span>
        <span style={titleStyle}>{retro?.title}</span>
      </div>
      <div style={infoStyle}>
        <span>{participants.length}/{retro?.max_participants || '?'} participants</span>
        <span style={phaseStyle}>{PHASE_LABELS[phase] || phase}</span>
        {phase === 'voting' && (
          <span>Votes left: {3 - myVotes.length}</span>
        )}
        {isFacilitator && phase === 'lobby' && (
          <button style={btnStyle} onClick={() => startPhase('adding')} aria-label="Start Adding Points">
            Start Adding Points
          </button>
        )}
        {isFacilitator && phase === 'adding' && (
          <button style={btnStyle} onClick={endPhase} aria-label="End Adding Phase">
            End Adding Phase
          </button>
        )}
        {isFacilitator && phase === 'grouping' && llmConfigured && (
          <button
            style={{ ...btnStyle, background: '#f39c12' }}
            onClick={handleAutoGroup}
            disabled={autoGrouping}
            aria-label="AI Auto-Group"
          >
            {autoGrouping ? 'Grouping...' : 'AI Auto-Group'}
          </button>
        )}
        {isFacilitator && phase === 'grouping' && (
          <button style={btnStyle} onClick={() => startPhase('voting')} aria-label="Start Voting">
            Start Voting
          </button>
        )}
        {isFacilitator && phase === 'voting' && (
          <button style={btnStyle} onClick={endPhase} aria-label="End Voting">
            End Voting
          </button>
        )}
        {isFacilitator && phase === 'discussion' && llmConfigured && (
          <button style={btnStyle} onClick={generateSummary} aria-label="Generate Summary">
            Generate Summary
          </button>
        )}
        {isFacilitator && (
          <button
            style={{ ...btnStyle, background: 'var(--color-didnt)' }}
            aria-label="End Retrospective"
            onClick={() => {
              if (window.confirm('End this retrospective? This cannot be undone.')) {
                socket.emit('end-retro', {});
              }
            }}
          >
            End Retrospective
          </button>
        )}
      </div>
      {showApproval && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 10,
            padding: 24,
            maxWidth: 500,
            width: '90%',
            maxHeight: '70vh',
            overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}>
              AI Grouping Suggestions
            </h3>
            {suggestions.map((s, i) => {
              const cardMap = {};
              for (const c of state.cards) cardMap[c.id] = c.text;
              return (
                <div key={i} style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: 12,
                  marginBottom: 10,
                }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    Parent: {cardMap[s.parentCardId] || s.parentCardId}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Grouped with: {(s.childCardIds || []).map(id => cardMap[id] || id).join(', ')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    Reason: {s.reason}
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                style={{ ...btnStyle, background: 'var(--color-well)' }}
                onClick={handleApproveAll}
              >
                Approve All
              </button>
              <button
                style={{ ...btnStyle, background: 'var(--color-didnt)' }}
                onClick={handleCancelApproval}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
