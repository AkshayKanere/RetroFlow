import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, createRetro, addParticipant, addCard, addVote, saveSummary, updateRetroPhase } from '../db.js';
import { buildExcelBuffer } from '../handlers/exportHandler.js';

describe('exportHandler', () => {
  let db;
  let retro;

  beforeEach(async () => {
    db = await initDb();
    retro = createRetro(db, { title: 'Export Test' });
    addParticipant(db, { retroId: retro.id, displayName: 'Alice', socketId: 's1', isFacilitator: true });
    addParticipant(db, { retroId: retro.id, displayName: 'Bob', socketId: 's2' });
    const card = addCard(db, { retroId: retro.id, column: 'well', text: 'Great work' });
    const p = db.prepare('SELECT * FROM participants WHERE socket_id = ?').get('s1');
    addVote(db, { cardId: card.id, participantId: p.id });
    saveSummary(db, { retroId: retro.id, text: 'Good retro' });
    updateRetroPhase(db, retro.id, 'ended');
  });

  it('should build an Excel buffer', () => {
    const buffer = buildExcelBuffer(db, retro.id);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('should return card data for export', () => {
    const cards = db.prepare('SELECT * FROM cards WHERE retro_id = ?').all(retro.id);
    expect(cards.length).toBe(1);
    expect(cards[0].text).toBe('Great work');
  });
});
