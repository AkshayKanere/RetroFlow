import { describe, it, expect, beforeEach } from "vitest";
import { initDb, createRetro, addParticipant, addCard } from "../db.js";
import { handleVote, handleUnvote } from "../handlers/voteHandler.js";

let db;
let retro;
let participant;
let card;

beforeEach(async () => {
  db = await initDb();
  retro = createRetro(db, { title: "Vote Handler Test" });
  participant = addParticipant(db, {
    retroId: retro.id,
    displayName: "Voter",
    socketId: "sock-v",
  });
  card = addCard(db, { retroId: retro.id, column: "went-well", text: "Voting card" });
});

describe("handleVote", () => {
  it("should add a vote and return the count", () => {
    const result = handleVote(db, {
      cardId: card.id,
      participantId: participant.id,
      retroId: retro.id,
    });
    expect(result.voteCount).toBe(1);
    expect(result.cardId).toBe(card.id);
  });

  it("should reject duplicate vote on same card", () => {
    handleVote(db, { cardId: card.id, participantId: participant.id, retroId: retro.id });
    const result = handleVote(db, { cardId: card.id, participantId: participant.id, retroId: retro.id });
    expect(result.error).toBe("Already voted on this card");
  });

  it("should reject when 3 votes are used", () => {
    const c1 = addCard(db, { retroId: retro.id, column: "went-well", text: "C1" });
    const c2 = addCard(db, { retroId: retro.id, column: "went-well", text: "C2" });
    const c3 = addCard(db, { retroId: retro.id, column: "went-well", text: "C3" });

    handleVote(db, { cardId: c1.id, participantId: participant.id, retroId: retro.id });
    handleVote(db, { cardId: c2.id, participantId: participant.id, retroId: retro.id });
    handleVote(db, { cardId: c3.id, participantId: participant.id, retroId: retro.id });

    const result = handleVote(db, { cardId: card.id, participantId: participant.id, retroId: retro.id });
    expect(result.error).toBe("No votes remaining");
  });
});

describe("handleUnvote", () => {
  it("should remove a vote and return the count", () => {
    handleVote(db, { cardId: card.id, participantId: participant.id, retroId: retro.id });
    const result = handleUnvote(db, { cardId: card.id, participantId: participant.id });
    expect(result.voteCount).toBe(0);
    expect(result.cardId).toBe(card.id);
  });
});
