import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  disconnectBanner: {
    background: 'var(--color-didnt)',
    color: '#fff',
    textAlign: 'center',
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
  },
};

export default function Board() {
  const socket = useSocket();
  const { state, dispatch } = useRetro();
  const navigate = useNavigate();
  const { shareCode } = useParams();
  const [disconnected, setDisconnected] = useState(!socket.connected);

  const attemptRejoin = useCallback(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('retroSession'));
      if (saved && saved.shareCode === shareCode && saved.participantId) {
        socket.emit('rejoin-retro', { participantId: saved.participantId, shareCode }, (response) => {
          if (response.error) {
            sessionStorage.removeItem('retroSession');
            navigate('/retro/' + shareCode, { replace: true });
            return;
          }
          dispatch({ type: 'SET_PARTICIPANT', payload: response.participant });
          dispatch({
            type: 'SET_STATE',
            payload: {
              retro: response.retro,
              participants: response.participants,
              cards: response.cards,
              votes: response.votes,
            },
          });
          if (response.summary) {
            dispatch({ type: 'SUMMARY_GENERATED', payload: response.summary });
          }
        });
      } else {
        navigate('/retro/' + shareCode, { replace: true });
      }
    } catch {
      navigate('/retro/' + shareCode, { replace: true });
    }
  }, [socket, dispatch, navigate, shareCode]);

  useEffect(() => {
    fetch('/api/config').then(r => r.json())
      .then(data => dispatch({ type: 'SET_LLM_CONFIGURED', payload: !!data.llmConfigured }))
      .catch(() => {});
  }, [dispatch]);

  useEffect(() => {
    if (state.retro) return;
    attemptRejoin();
  }, [state.retro, attemptRejoin]);

  useEffect(() => {
    function onDisconnect() {
      setDisconnected(true);
    }
    function onConnect() {
      setDisconnected(false);
      attemptRejoin();
    }

    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    return () => {
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
    };
  }, [socket, attemptRejoin]);

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
    function onRetroEnded({ retro }) {
      dispatch({ type: 'RETRO_ENDED', payload: retro });
      navigate('/retro/' + shareCode + '/summary');
    }

    socket.on('card-added', onCardAdded);
    socket.on('vote-updated', onVoteUpdated);
    socket.on('cards-updated', onCardsUpdated);
    socket.on('phase-changed', onPhaseChanged);
    socket.on('participant-joined', onParticipantJoined);
    socket.on('participant-left', onParticipantLeft);
    socket.on('summary-generated', onSummaryGenerated);
    socket.on('retro-ended', onRetroEnded);

    return () => {
      socket.off('card-added', onCardAdded);
      socket.off('vote-updated', onVoteUpdated);
      socket.off('cards-updated', onCardsUpdated);
      socket.off('phase-changed', onPhaseChanged);
      socket.off('participant-joined', onParticipantJoined);
      socket.off('participant-left', onParticipantLeft);
      socket.off('summary-generated', onSummaryGenerated);
      socket.off('retro-ended', onRetroEnded);
    };
  }, [socket, dispatch, navigate, shareCode]);

  if (!state.retro) {
    return (
      <div style={{ ...styles.container, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading board...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {disconnected && (
        <div style={styles.disconnectBanner}>Disconnected from server. Reconnecting...</div>
      )}
      <Header />
      <Timer />
      {state.cards.length > 0 && (state.retro.phase === 'discussion' || state.retro.phase === 'ended') && <Summary />}
      <div style={styles.columns}>
        <Column column="well" />
        <Column column="didnt" />
        <Column column="action" />
      </div>
    </div>
  );
}
