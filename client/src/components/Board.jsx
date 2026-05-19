import { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRetro } from '../context/RetroContext';
import Header from './Header';
import Timer from './Timer';
import Column from './Column';
import Summary from './Summary';

const styles = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    display: 'flex',
    flexDirection: 'column',
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 16,
    padding: '0 24px 24px',
    flex: 1,
  },
};

export default function Board() {
  const socket = useSocket();
  const { state, dispatch } = useRetro();

  useEffect(() => {
    function onCardAdded({ card }) {
      dispatch({ type: 'CARD_ADDED', payload: card });
    }
    function onVoteUpdated({ cardId, voteCount }) {
      dispatch({ type: 'SET_VOTE_COUNT', payload: { cardId, count: voteCount } });
    }
    function onCardsUpdated({ cards }) {
      dispatch({ type: 'SET_STATE', payload: { cards } });
    }
    function onPhaseChanged({ retro }) {
      dispatch({
        type: 'PHASE_CHANGED',
        payload: { phase: retro.phase, phase_ends_at: retro.phase_ends_at },
      });
    }
    function onParticipantJoined({ participant, participants }) {
      dispatch({ type: 'SET_STATE', payload: { participants } });
    }
    function onParticipantLeft({ participantId, participants }) {
      dispatch({ type: 'SET_STATE', payload: { participants } });
    }
    function onSummaryGenerated({ summary }) {
      dispatch({ type: 'SUMMARY_GENERATED', payload: summary });
    }

    socket.on('card-added', onCardAdded);
    socket.on('vote-updated', onVoteUpdated);
    socket.on('cards-updated', onCardsUpdated);
    socket.on('phase-changed', onPhaseChanged);
    socket.on('participant-joined', onParticipantJoined);
    socket.on('participant-left', onParticipantLeft);
    socket.on('summary-generated', onSummaryGenerated);

    return () => {
      socket.off('card-added', onCardAdded);
      socket.off('vote-updated', onVoteUpdated);
      socket.off('cards-updated', onCardsUpdated);
      socket.off('phase-changed', onPhaseChanged);
      socket.off('participant-joined', onParticipantJoined);
      socket.off('participant-left', onParticipantLeft);
      socket.off('summary-generated', onSummaryGenerated);
    };
  }, [socket, dispatch]);

  if (!state.retro) {
    return (
      <div style={{ ...styles.container, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading board...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <Header />
      <Timer />
      <div style={styles.columns}>
        <Column column="well" />
        <Column column="didnt" />
        <Column column="action" />
      </div>
      {state.retro.phase === 'discussion' && <Summary />}
    </div>
  );
}
