import initSqlJs from "sql.js";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import * as log from "./services/logger.js";

class DbWrapper {
  constructor(sqlDb) {
    this._db = sqlDb;
  }

  prepare(sql) {
    const db = this._db;
    return {
      run(...params) {
        db.run(sql, params);
        return { changes: db.getRowsModified() };
      },
      get(...params) {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        let row = undefined;
        if (stmt.step()) {
          row = stmt.getAsObject();
        }
        stmt.free();
        return row;
      },
      all(...params) {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
      },
    };
  }

  exec(sql) {
    this._db.exec(sql);
  }

  close() {
    this._db.close();
  }

  export() {
    return this._db.export();
  }
}

export function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS retros (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      share_code TEXT UNIQUE NOT NULL,
      add_points_duration INTEGER NOT NULL DEFAULT 300,
      voting_duration INTEGER NOT NULL DEFAULT 120,
      max_participants INTEGER NOT NULL DEFAULT 10,
      phase TEXT NOT NULL DEFAULT 'lobby',
      phase_ends_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      retro_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      socket_id TEXT,
      is_facilitator INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (retro_id) REFERENCES retros(id)
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      retro_id TEXT NOT NULL,
      "column" TEXT NOT NULL,
      text TEXT NOT NULL,
      group_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (retro_id) REFERENCES retros(id)
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      UNIQUE(card_id, participant_id),
      FOREIGN KEY (card_id) REFERENCES cards(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      retro_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (retro_id) REFERENCES retros(id)
    );
  `);
}

export async function initDb(buffer) {
  log.debug('initDb: initializing database', buffer ? '(from buffer)' : '(new)');
  const SQL = await initSqlJs();
  const sqlDb = buffer ? new SQL.Database(buffer) : new SQL.Database();
  const db = new DbWrapper(sqlDb);
  createSchema(db);
  log.debug('initDb: database ready');
  return db;
}

export function loadDbFromFile(filepath) {
  log.debug('loadDbFromFile:', filepath);
  try {
    if (fs.existsSync(filepath)) {
      log.debug('loadDbFromFile: file found, loading');
      return fs.readFileSync(filepath);
    }
    log.debug('loadDbFromFile: file not found');
  } catch (_) {
    log.debug('loadDbFromFile: read error');
  }
  return null;
}

export function saveDbToFile(db, filepath) {
  log.debug('saveDbToFile:', filepath);
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const data = db.export();
  fs.writeFileSync(filepath, Buffer.from(data));
  log.debug('saveDbToFile: saved', data.length, 'bytes');
}

function generateShareCode() {
  return uuidv4().slice(0, 8).toUpperCase();
}

export function createRetro(db, { title, addPointsDuration = 300, votingDuration = 120, maxParticipants = 10 }) {
  const id = uuidv4();
  const shareCode = generateShareCode();
  db.prepare(
    'INSERT INTO retros (id, title, share_code, add_points_duration, voting_duration, max_participants) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, title, shareCode, addPointsDuration, votingDuration, maxParticipants);
  return getRetro(db, id);
}

export function getRetro(db, id) {
  return db.prepare(`SELECT * FROM retros WHERE id = ?`).get(id);
}

export function getRetroByShareCode(db, shareCode) {
  return db.prepare(`SELECT * FROM retros WHERE share_code = ?`).get(shareCode);
}

export function updateRetroPhase(db, id, phase, phaseEndsAt = null) {
  db.prepare(`UPDATE retros SET phase = ?, phase_ends_at = ? WHERE id = ?`).run(phase, phaseEndsAt, id);
  return getRetro(db, id);
}

export function addParticipant(db, { retroId, displayName, socketId, isFacilitator = false }) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO participants (id, retro_id, display_name, socket_id, is_facilitator) VALUES (?, ?, ?, ?, ?)`
  ).run(id, retroId, displayName, socketId, isFacilitator ? 1 : 0);
  return db.prepare(`SELECT * FROM participants WHERE id = ?`).get(id);
}

export function getParticipant(db, id) {
  return db.prepare(`SELECT * FROM participants WHERE id = ?`).get(id);
}

export function getParticipantBySocket(db, socketId) {
  return db.prepare(`SELECT * FROM participants WHERE socket_id = ?`).get(socketId);
}

export function updateParticipantSocket(db, participantId, socketId) {
  db.prepare(`UPDATE participants SET socket_id = ? WHERE id = ?`).run(socketId, participantId);
  return db.prepare(`SELECT * FROM participants WHERE id = ?`).get(participantId);
}

export function getParticipants(db, retroId) {
  return db.prepare(`SELECT * FROM participants WHERE retro_id = ?`).all(retroId);
}

export function removeParticipantBySocket(db, socketId) {
  const participant = getParticipantBySocket(db, socketId);
  if (participant) {
    db.prepare(`DELETE FROM participants WHERE socket_id = ?`).run(socketId);
  }
  return participant;
}

export function disconnectParticipantBySocket(db, socketId) {
  const participant = getParticipantBySocket(db, socketId);
  if (participant) {
    db.prepare(`UPDATE participants SET socket_id = NULL WHERE socket_id = ?`).run(socketId);
  }
  return participant;
}

export function addCard(db, { retroId, column, text }) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO cards (id, retro_id, "column", text) VALUES (?, ?, ?, ?)`
  ).run(id, retroId, column, text);
  return db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id);
}

export function getCards(db, retroId) {
  return db.prepare(`SELECT * FROM cards WHERE retro_id = ?`).all(retroId);
}

export function groupCards(db, parentCardId, childCardId) {
  db.prepare(`UPDATE cards SET group_id = ? WHERE id = ?`).run(parentCardId, childCardId);
}

export function ungroupCard(db, cardId) {
  db.prepare(`UPDATE cards SET group_id = NULL WHERE id = ?`).run(cardId);
}

export function addVote(db, { cardId, participantId }) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO votes (id, card_id, participant_id) VALUES (?, ?, ?)`
  ).run(id, cardId, participantId);
  return getVoteCount(db, cardId);
}

export function removeVote(db, { cardId, participantId }) {
  db.prepare(`DELETE FROM votes WHERE card_id = ? AND participant_id = ?`).run(cardId, participantId);
  return getVoteCount(db, cardId);
}

export function getVoteCount(db, cardId) {
  const row = db.prepare(`SELECT COUNT(*) as count FROM votes WHERE card_id = ?`).get(cardId);
  return row ? row.count : 0;
}

export function getVotesByParticipant(db, participantId, retroId) {
  return db.prepare(
    `SELECT v.* FROM votes v JOIN cards c ON v.card_id = c.id WHERE v.participant_id = ? AND c.retro_id = ?`
  ).all(participantId, retroId);
}

export function getVotesForRetro(db, retroId) {
  return db.prepare(
    `SELECT v.* FROM votes v JOIN cards c ON v.card_id = c.id WHERE c.retro_id = ?`
  ).all(retroId);
}

export function saveSummary(db, { retroId, text }) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO summaries (id, retro_id, text) VALUES (?, ?, ?)`
  ).run(id, retroId, text);
  return db.prepare(`SELECT * FROM summaries WHERE id = ?`).get(id);
}

export function getActiveRetro(db) {
  return db.prepare("SELECT * FROM retros WHERE phase != 'ended' ORDER BY created_at DESC, rowid DESC LIMIT 1").get();
}

export function getAllRetros(db) {
  return db.prepare('SELECT * FROM retros ORDER BY created_at DESC, rowid DESC').all();
}

export function getSummaryForRetro(db, retroId) {
  return db.prepare('SELECT * FROM summaries WHERE retro_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(retroId);
}
