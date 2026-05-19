import { describe, it, expect, beforeEach } from "vitest";
import {
  initDb,
  createSchema,
  createRetro,
  getRetro,
  getRetroByShareCode,
  updateRetroPhase,
  addParticipant,
  getParticipantBySocket,
  getParticipants,
  removeParticipantBySocket,
  addCard,
  getCards,
  groupCards,
  ungroupCard,
  addVote,
  removeVote,
  getVoteCount,
  getVotesByParticipant,
  getVotesForRetro,
  saveSummary,
  getActiveRetro,
  getAllRetros,
  getSummaryForRetro,
} from "../db.js";

let db;

beforeEach(async () => {
  db = await initDb();
});

describe("Schema creation", () => {
  it("should create all 5 tables", () => {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all();
    const names = tables.map((r) => r.name).sort();
    expect(names).toEqual(["cards", "participants", "retros", "summaries", "votes"]);
  });

  it("should be idempotent", () => {
    createSchema(db);
    createSchema(db);
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      )
      .all();
    expect(tables.length).toBe(5);
  });
});

describe("Retro CRUD", () => {
  it("should create and retrieve a retro", () => {
    const retro = createRetro(db, { title: "Sprint 42 Retro" });
    expect(retro.title).toBe("Sprint 42 Retro");
    expect(retro.id).toBeDefined();
    expect(retro.share_code).toBeDefined();
    expect(retro.phase).toBe("lobby");
    expect(retro.add_points_duration).toBe(300);
    expect(retro.voting_duration).toBe(120);

    const fetched = getRetro(db, retro.id);
    expect(fetched.title).toBe("Sprint 42 Retro");
  });

  it("should retrieve retro by share code", () => {
    const retro = createRetro(db, { title: "Share Code Test" });
    const fetched = getRetroByShareCode(db, retro.share_code);
    expect(fetched.id).toBe(retro.id);
  });

  it("should update retro phase", () => {
    const retro = createRetro(db, { title: "Phase Test" });
    const updated = updateRetroPhase(db, retro.id, "adding-points", "2026-01-01T00:05:00Z");
    expect(updated.phase).toBe("adding-points");
    expect(updated.phase_ends_at).toBe("2026-01-01T00:05:00Z");
  });

  it("should respect custom durations", () => {
    const retro = createRetro(db, {
      title: "Custom",
      addPointsDuration: 600,
      votingDuration: 240,
    });
    expect(retro.add_points_duration).toBe(600);
    expect(retro.voting_duration).toBe(240);
  });
});

describe("Participants", () => {
  it("should add and retrieve participants", () => {
    const retro = createRetro(db, { title: "P Test" });
    const p = addParticipant(db, {
      retroId: retro.id,
      displayName: "Alice",
      socketId: "sock-1",
      isFacilitator: true,
    });
    expect(p.display_name).toBe("Alice");
    expect(p.is_facilitator).toBe(1);

    const bySocket = getParticipantBySocket(db, "sock-1");
    expect(bySocket.id).toBe(p.id);

    const all = getParticipants(db, retro.id);
    expect(all.length).toBe(1);
  });

  it("should remove participant by socket", () => {
    const retro = createRetro(db, { title: "Remove Test" });
    addParticipant(db, {
      retroId: retro.id,
      displayName: "Bob",
      socketId: "sock-2",
    });
    const removed = removeParticipantBySocket(db, "sock-2");
    expect(removed.display_name).toBe("Bob");

    const after = getParticipants(db, retro.id);
    expect(after.length).toBe(0);
  });
});

describe("Cards", () => {
  it("should add and retrieve cards", () => {
    const retro = createRetro(db, { title: "Card Test" });
    const card = addCard(db, {
      retroId: retro.id,
      column: "went-well",
      text: "Great teamwork",
    });
    expect(card.text).toBe("Great teamwork");
    expect(card.column).toBe("went-well");

    const cards = getCards(db, retro.id);
    expect(cards.length).toBe(1);
  });

  it("should group and ungroup cards", () => {
    const retro = createRetro(db, { title: "Group Test" });
    const c1 = addCard(db, { retroId: retro.id, column: "went-well", text: "A" });
    const c2 = addCard(db, { retroId: retro.id, column: "went-well", text: "B" });

    groupCards(db, c1.id, c2.id);
    const grouped = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(c2.id);
    expect(grouped.group_id).toBe(c1.id);

    ungroupCard(db, c2.id);
    const ungrouped = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(c2.id);
    expect(ungrouped.group_id).toBeNull();
  });
});

describe("Votes", () => {
  let retro, participant, card;

  beforeEach(() => {
    retro = createRetro(db, { title: "Vote Test" });
    participant = addParticipant(db, {
      retroId: retro.id,
      displayName: "Voter",
      socketId: "sock-v",
    });
    card = addCard(db, { retroId: retro.id, column: "went-well", text: "Voting card" });
  });

  it("should add and count votes", () => {
    const count = addVote(db, { cardId: card.id, participantId: participant.id });
    expect(count).toBe(1);
    expect(getVoteCount(db, card.id)).toBe(1);
  });

  it("should enforce unique vote constraint", () => {
    addVote(db, { cardId: card.id, participantId: participant.id });
    expect(() => {
      addVote(db, { cardId: card.id, participantId: participant.id });
    }).toThrow();
  });

  it("should remove votes", () => {
    addVote(db, { cardId: card.id, participantId: participant.id });
    const count = removeVote(db, { cardId: card.id, participantId: participant.id });
    expect(count).toBe(0);
  });

  it("should get votes by participant", () => {
    addVote(db, { cardId: card.id, participantId: participant.id });
    const votes = getVotesByParticipant(db, participant.id, retro.id);
    expect(votes.length).toBe(1);
  });

  it("should get all votes for a retro", () => {
    addVote(db, { cardId: card.id, participantId: participant.id });
    const votes = getVotesForRetro(db, retro.id);
    expect(votes.length).toBe(1);
  });
});

describe("Summaries", () => {
  it("should save and return a summary", () => {
    const retro = createRetro(db, { title: "Summary Test" });
    const summary = saveSummary(db, { retroId: retro.id, text: "Great retro!" });
    expect(summary.text).toBe("Great retro!");
    expect(summary.retro_id).toBe(retro.id);
    expect(summary.id).toBeDefined();
  });
});

describe("Active retro", () => {
  it("should return the active retro (phase != ended)", () => {
    const r1 = createRetro(db, { title: "Ended" });
    updateRetroPhase(db, r1.id, "ended");
    const r2 = createRetro(db, { title: "Active" });
    const active = getActiveRetro(db);
    expect(active.id).toBe(r2.id);
  });

  it("should return undefined when no active retro", () => {
    const r = createRetro(db, { title: "Done" });
    updateRetroPhase(db, r.id, "ended");
    expect(getActiveRetro(db)).toBeUndefined();
  });
});

describe("getAllRetros", () => {
  it("should return all retros ordered by created_at desc", () => {
    createRetro(db, { title: "First" });
    createRetro(db, { title: "Second" });
    const all = getAllRetros(db);
    expect(all.length).toBe(2);
    expect(all[0].title).toBe("Second");
  });
});

describe("getSummaryForRetro", () => {
  it("should return the latest summary for a retro", () => {
    const r = createRetro(db, { title: "Sum Test" });
    saveSummary(db, { retroId: r.id, text: "Old" });
    saveSummary(db, { retroId: r.id, text: "New" });
    const s = getSummaryForRetro(db, r.id);
    expect(s.text).toBe("New");
  });

  it("should return undefined if no summary", () => {
    const r = createRetro(db, { title: "No Sum" });
    expect(getSummaryForRetro(db, r.id)).toBeUndefined();
  });
});

describe("Max participants", () => {
  it("should store max_participants on retro", () => {
    const r = createRetro(db, { title: "Max", maxParticipants: 5 });
    expect(r.max_participants).toBe(5);
  });

  it("should default max_participants to 10", () => {
    const r = createRetro(db, { title: "Default Max" });
    expect(r.max_participants).toBe(10);
  });
});
