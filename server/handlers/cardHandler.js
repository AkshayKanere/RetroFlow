import { addCard, groupCards, ungroupCard } from '../db.js';

export function handleAddCard(db, { retroId, column, text }) {
  return addCard(db, { retroId, column, text });
}

export function handleGroupCards(db, { parentCardId, childCardId }) {
  groupCards(db, parentCardId, childCardId);
}

export function handleUngroupCard(db, { cardId }) {
  ungroupCard(db, cardId);
}
