import { useSocket } from '../context/SocketContext';
import { useRetro } from '../context/RetroContext';
import GroupBadge from './GroupBadge';

const COLUMN_COLORS = {
  well: 'var(--color-well)',
  didnt: 'var(--color-didnt)',
  action: 'var(--color-action)',
};

export default function Card({ card, column }) {
  const socket = useSocket();
  const { state, dispatch } = useRetro();
  const voteCount = state.voteCounts[card.id] || 0;
  const hasVoted = state.myVotes.includes(card.id);
  const votesLeft = 3 - state.myVotes.length;
  const isFacilitator = state.participant?.is_facilitator;
  const phase = state.retro?.phase;

  const childCards = state.cards.filter((c) => c.group_id === card.id);

  function handleVote() {
    if (hasVoted) {
      socket.emit('unvote-card', { cardId: card.id }, (res) => {
        if (!res.error) {
          dispatch({ type: 'MY_VOTE_REMOVED', payload: card.id });
        }
      });
    } else {
      if (votesLeft <= 0) return;
      socket.emit('vote-card', { cardId: card.id }, (res) => {
        if (!res.error) {
          dispatch({ type: 'MY_VOTE_ADDED', payload: card.id });
        }
      });
    }
  }

  function handleDragStart(e) {
    if (!isFacilitator || phase !== 'grouping') return;
    e.dataTransfer.setData('text/plain', card.id);
  }

  function handleDrop(e) {
    if (!isFacilitator || phase !== 'grouping') return;
    e.preventDefault();
    const childCardId = e.dataTransfer.getData('text/plain');
    if (childCardId && childCardId !== String(card.id)) {
      socket.emit('group-cards', { parentCardId: card.id, childCardId });
    }
  }

  function handleDragOver(e) {
    if (isFacilitator && phase === 'grouping') {
      e.preventDefault();
    }
  }

  const cardStyle = {
    background: 'var(--bg-card)',
    borderLeft: `4px solid ${COLUMN_COLORS[column]}`,
    borderRadius: 6,
    padding: '10px 12px',
    cursor: isFacilitator && phase === 'grouping' ? 'grab' : 'default',
  };

  const textStyle = {
    color: 'var(--text-primary)',
    fontSize: 13,
    lineHeight: 1.4,
    marginBottom: 8,
  };

  const footerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const voteBtnStyle = {
    background: hasVoted ? COLUMN_COLORS[column] : 'transparent',
    color: hasVoted ? '#fff' : 'var(--text-secondary)',
    border: `1px solid ${hasVoted ? COLUMN_COLORS[column] : 'var(--border)'}`,
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: 12,
    cursor: phase === 'voting' ? 'pointer' : 'default',
    opacity: phase === 'voting' ? 1 : 0.5,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  };

  return (
    <div
      style={cardStyle}
      draggable={isFacilitator && phase === 'grouping'}
      onDragStart={handleDragStart}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div style={textStyle}>{card.text}</div>
      {childCards.length > 0 && (
        <GroupBadge parentCard={card} childCards={childCards} />
      )}
      <div style={footerStyle}>
        <button
          style={voteBtnStyle}
          onClick={handleVote}
          disabled={phase !== 'voting' || (!hasVoted && votesLeft <= 0)}
        >
          {voteCount} {voteCount === 1 ? 'vote' : 'votes'}
        </button>
      </div>
    </div>
  );
}
