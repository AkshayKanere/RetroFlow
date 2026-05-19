import { describe, it, expect, beforeEach } from "vitest";
import { initDb, createRetro } from "../db.js";
import { handleAddCard, handleGroupCards, handleUngroupCard } from "../handlers/cardHandler.js";

let db;
let retro;

beforeEach(async () => {
  db = await initDb();
  retro = createRetro(db, { title: "Card Handler Test" });
});

describe("handleAddCard", () => {
  it("should add a card and return it", () => {
    const card = handleAddCard(db, {
      retroId: retro.id,
      column: "went-well",
      text: "Great teamwork",
    });
    expect(card.id).toBeDefined();
    expect(card.text).toBe("Great teamwork");
    expect(card.column).toBe("went-well");
    expect(card.retro_id).toBe(retro.id);
  });
});

describe("handleGroupCards", () => {
  it("should group a child card under a parent card", () => {
    const parent = handleAddCard(db, { retroId: retro.id, column: "went-well", text: "A" });
    const child = handleAddCard(db, { retroId: retro.id, column: "went-well", text: "B" });

    handleGroupCards(db, { parentCardId: parent.id, childCardId: child.id });

    const grouped = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(child.id);
    expect(grouped.group_id).toBe(parent.id);
  });
});

describe("handleUngroupCard", () => {
  it("should ungroup a card", () => {
    const parent = handleAddCard(db, { retroId: retro.id, column: "went-well", text: "A" });
    const child = handleAddCard(db, { retroId: retro.id, column: "went-well", text: "B" });

    handleGroupCards(db, { parentCardId: parent.id, childCardId: child.id });
    handleUngroupCard(db, { cardId: child.id });

    const ungrouped = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(child.id);
    expect(ungrouped.group_id).toBeNull();
  });
});
