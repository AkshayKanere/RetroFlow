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
  const { retro, participant, participants, myVotes } = state;
  const phase = retro?.phase;
  const isFacilitator = participant?.is_facilitator;

  function startPhase(p) {
    socket.emit('start-phase', { phase: p });
  }

  function endPhase() {
    socket.emit('end-phase', {});
  }

  function generateSummary() {
    socket.emit('generate-summary', {});
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
        <span>{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
        <span style={phaseStyle}>{PHASE_LABELS[phase] || phase}</span>
        {phase === 'voting' && (
          <span>Votes left: {3 - myVotes.length}</span>
        )}
        {isFacilitator && phase === 'lobby' && (
          <button style={btnStyle} onClick={() => startPhase('adding')}>
            Start Adding Points
          </button>
        )}
        {isFacilitator && phase === 'adding' && (
          <button style={btnStyle} onClick={endPhase}>
            End Adding Phase
          </button>
        )}
        {isFacilitator && phase === 'grouping' && (
          <button style={btnStyle} onClick={() => startPhase('voting')}>
            Start Voting
          </button>
        )}
        {isFacilitator && phase === 'voting' && (
          <button style={btnStyle} onClick={endPhase}>
            End Voting
          </button>
        )}
        {isFacilitator && phase === 'discussion' && (
          <button style={btnStyle} onClick={generateSummary}>
            Generate Summary
          </button>
        )}
      </div>
    </div>
  );
}
