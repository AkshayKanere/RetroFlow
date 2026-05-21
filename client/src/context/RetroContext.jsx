import { createContext, useContext, useReducer } from 'react';

const RetroContext = createContext(null);

function computeVoteCounts(votes) {
  const counts = {};
  for (const v of votes || []) {
    counts[v.card_id] = (counts[v.card_id] || 0) + 1;
  }
  return counts;
}

function computeMyVotes(votes, participantId) {
  if (!votes || !participantId) return [];
  return votes
    .filter((v) => v.participant_id === participantId)
    .map((v) => v.card_id);
}

function retroReducer(state, action) {
  switch (action.type) {
    case 'SET_STATE': {
      const { retro, participants, cards, votes } = action.payload;
      return {
        ...state,
        retro: retro ?? state.retro,
        participants: participants ?? state.participants,
        cards: cards ?? state.cards,
        votes: votes ?? state.votes,
        voteCounts: computeVoteCounts(votes ?? state.votes),
        myVotes: computeMyVotes(
          votes ?? state.votes,
          state.participant?.id
        ),
      };
    }
    case 'SET_PARTICIPANT':
      return {
        ...state,
        participant: action.payload,
        myVotes: computeMyVotes(state.votes, action.payload?.id),
      };
    case 'CARD_ADDED':
      return { ...state, cards: [...state.cards, action.payload] };
    case 'SET_VOTE_COUNT':
      return {
        ...state,
        voteCounts: {
          ...state.voteCounts,
          [action.payload.cardId]: action.payload.count,
        },
      };
    case 'MY_VOTE_ADDED':
      return { ...state, myVotes: [...state.myVotes, action.payload] };
    case 'MY_VOTE_REMOVED':
      return {
        ...state,
        myVotes: state.myVotes.filter((id) => id !== action.payload),
      };
    case 'CARDS_GROUPED':
      return {
        ...state,
        cards: state.cards.map((c) =>
          c.id === action.payload.cardId
            ? { ...c, group_id: action.payload.groupId }
            : c
        ),
      };
    case 'CARD_UNGROUPED':
      return {
        ...state,
        cards: state.cards.map((c) =>
          c.id === action.payload ? { ...c, group_id: null } : c
        ),
      };
    case 'PHASE_CHANGED':
      return {
        ...state,
        retro: {
          ...state.retro,
          phase: action.payload.phase,
          phase_ends_at: action.payload.phase_ends_at,
        },
      };
    case 'PARTICIPANT_JOINED':
      return {
        ...state,
        participants: [...state.participants, action.payload],
      };
    case 'PARTICIPANT_LEFT':
      return {
        ...state,
        participants: state.participants.filter(
          (p) => p.id !== action.payload
        ),
      };
    case 'SUMMARY_GENERATED':
      return { ...state, summary: action.payload };
    case 'RETRO_ENDED':
      return {
        ...state,
        retro: { ...state.retro, phase: 'ended' },
      };
    case 'SET_LLM_CONFIGURED':
      return { ...state, llmConfigured: action.payload };
    default:
      return state;
  }
}

const initialState = {
  retro: null,
  participant: null,
  participants: [],
  cards: [],
  votes: [],
  summary: null,
  myVotes: [],
  voteCounts: {},
  llmConfigured: false,
};

export function RetroProvider({ children }) {
  const [state, dispatch] = useReducer(retroReducer, initialState);

  return (
    <RetroContext.Provider value={{ state, dispatch }}>
      {children}
    </RetroContext.Provider>
  );
}

export function useRetro() {
  const context = useContext(RetroContext);
  if (!context) {
    throw new Error('useRetro must be used within a RetroProvider');
  }
  return context;
}
