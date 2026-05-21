# Retrospective Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time collaborative retrospective board with voting, duplicate grouping, and AI summaries.

**Architecture:** Single Express server serving React (Vite) frontend, Socket.IO for real-time, SQLite for persistence. Monolith deployment.

**Tech Stack:** React, Vite, Node.js, Express, Socket.IO, better-sqlite3, uuid

---

## File Structure

### Server
- `server/index.js` - Express + Socket.IO setup, serves static files
- `server/db.js` - SQLite connection, schema creation, query helpers
- `server/handlers/retroHandler.js` - Create retro, join retro, get retro state
- `server/handlers/cardHandler.js` - Add card, group/ungroup cards
- `server/handlers/voteHandler.js` - Vote/unvote with 3-vote limit
- `server/handlers/phaseHandler.js` - Phase transitions, timer management
- `server/services/llmService.js` - LLM Gateway integration

### Client
- `client/src/main.jsx` - React entry point
- `client/src/App.jsx` - Router (create page vs board page)
- `client/src/context/SocketContext.jsx` - Socket.IO connection provider
- `client/src/context/RetroContext.jsx` - Board state management via useReducer
- `client/src/components/CreateRetro.jsx` - New retro form
- `client/src/components/JoinForm.jsx` - Enter display name
- `client/src/components/Board.jsx` - Main 3-column layout
- `client/src/components/Column.jsx` - Single column with cards
- `client/src/components/Card.jsx` - Individual card with vote button
- `client/src/components/Header.jsx` - Top bar with controls
- `client/src/components/Timer.jsx` - Countdown timer
- `client/src/components/Summary.jsx` - AI summary panel
- `client/src/components/GroupBadge.jsx` - Grouped cards expandable view

### Tests
- `server/tests/db.test.js` - Database schema and query tests
- `server/tests/retroHandler.test.js` - Retro CRUD tests
- `server/tests/cardHandler.test.js` - Card logic tests
- `server/tests/voteHandler.test.js` - Vote logic tests
- `server/tests/phaseHandler.test.js` - Phase transition tests
- `server/tests/llmService.test.js` - LLM service tests

### Config
- `package.json` - Root package with workspaces
- `server/package.json` - Server dependencies
- `client/package.json` - Client dependencies
- `client/vite.config.js` - Vite config with proxy to server
- `.env.example` - Environment variable template
- `.gitignore` - Standard ignores

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `server/package.json`, `client/package.json`
- Create: `client/vite.config.js`
- Create: `.env.example`, `.gitignore`

- [ ] **Step 1: Initialize root package.json**

```json
{
  "name": "retrospective-tool",
  "private": true,
  "scripts": {
    "dev:server": "cd server && node index.js",
    "dev:client": "cd client && npx vite",
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "build": "cd client && npx vite build",
    "test": "cd server && npx vitest run"
  },
  "devDependencies": {
    "concurrently": "^8.2.0"
  }
}
```

- [ ] **Step 2: Initialize server/package.json**

```json
{
  "name": "retrospective-tool-server",
  "private": true,
  "type": "module",
  "dependencies": {
    "express": "^4.18.0",
    "socket.io": "^4.7.0",
    "better-sqlite3": "^11.0.0",
    "uuid": "^9.0.0",
    "cors": "^2.8.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Initialize client/package.json**

```json
{
  "name": "retrospective-tool-client",
  "private": true,
  "type": "module",
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "socket.io-client": "^4.7.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 4: Create client/vite.config.js**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 5: Create .env.example**

```
LLM_GATEWAY_URL=your-llm-gateway-url-here
LLM_API_KEY=your-api-key-here
PORT=3001
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
.env
*.db
.superpowers/
```

- [ ] **Step 7: Install dependencies**

Run: `npm install` then `cd server && npm install` then `cd ../client && npm install`

- [ ] **Step 8: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold project with monorepo structure"
```

---

### Task 2: Database Layer

**Files:**
- Create: `server/db.js`
- Create: `server/tests/db.test.js`

- [ ] **Step 1: Write failing test for database schema creation**

```js
// server/tests/db.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createSchema, createRetro, getRetro } from '../db.js';

describe('Database', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create all tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);
    expect(tables).toContain('retros');
    expect(tables).toContain('participants');
    expect(tables).toContain('cards');
    expect(tables).toContain('votes');
    expect(tables).toContain('summaries');
  });

  it('should create a retro and retrieve it', () => {
    const retro = createRetro(db, {
      title: 'Sprint 24',
      addPointsDuration: 600,
      votingDuration: 600,
    });
    expect(retro.title).toBe('Sprint 24');
    expect(retro.share_code).toBeTruthy();
    expect(retro.phase).toBe('waiting');

    const found = getRetro(db, retro.id);
    expect(found.title).toBe('Sprint 24');
  });

  it('should enforce unique vote constraint', () => {
    const retro = createRetro(db, { title: 'Test', addPointsDuration: 600, votingDuration: 600 });
    const participantId = 'p1';
    db.prepare(
      'INSERT INTO participants (id, retro_id, display_name, socket_id, is_facilitator) VALUES (?, ?, ?, ?, ?)'
    ).run(participantId, retro.id, 'Alice', 'sock1', 1);
    const cardId = 'c1';
    db.prepare(
      'INSERT INTO cards (id, retro_id, "column", text, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(cardId, retro.id, 'well', 'Good stuff', new Date().toISOString());
    db.prepare('INSERT INTO votes (id, card_id, participant_id) VALUES (?, ?, ?)').run('v1', cardId, participantId);
    expect(() => {
      db.prepare('INSERT INTO votes (id, card_id, participant_id) VALUES (?, ?, ?)').run('v2', cardId, participantId);
    }).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/db.test.js`
Expected: FAIL - cannot find module '../db.js'

- [ ] **Step 3: Implement database module**

```js
// server/db.js
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export function createSchema(db) {
  db.exec(
    CREATE TABLE IF NOT EXISTS retros (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      share_code TEXT UNIQUE NOT NULL,
      add_points_duration INTEGER NOT NULL DEFAULT 600,
      voting_duration INTEGER NOT NULL DEFAULT 600,
      phase TEXT NOT NULL DEFAULT 'waiting',
      phase_ends_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      retro_id TEXT NOT NULL REFERENCES retros(id),
      display_name TEXT NOT NULL,
      socket_id TEXT,
      is_facilitator INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      retro_id TEXT NOT NULL REFERENCES retros(id),
      "column" TEXT NOT NULL,
      text TEXT NOT NULL,
      group_id TEXT REFERENCES cards(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      participant_id TEXT NOT NULL REFERENCES participants(id),
      UNIQUE(card_id, participant_id)
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      retro_id TEXT NOT NULL REFERENCES retros(id),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  );
}

function generateShareCode() {
  return uuidv4().substring(0, 8);
}

export function createRetro(db, { title, addPointsDuration, votingDuration }) {
  const id = uuidv4();
  const shareCode = generateShareCode();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO retros (id, title, share_code, add_points_duration, voting_duration, phase, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, title, shareCode, addPointsDuration, votingDuration, 'waiting', now);
  return getRetro(db, id);
}

export function getRetro(db, id) {
  return db.prepare('SELECT * FROM retros WHERE id = ?').get(id);
}

export function getRetroByShareCode(db, shareCode) {
  return db.prepare('SELECT * FROM retros WHERE share_code = ?').get(shareCode);
}

export function updateRetroPhase(db, id, phase, phaseEndsAt = null) {
  db.prepare('UPDATE retros SET phase = ?, phase_ends_at = ? WHERE id = ?').run(phase, phaseEndsAt, id);
  return getRetro(db, id);
}

export function addParticipant(db, { retroId, displayName, socketId, isFacilitator }) {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO participants (id, retro_id, display_name, socket_id, is_facilitator) VALUES (?, ?, ?, ?, ?)'
  ).run(id, retroId, displayName, socketId, isFacilitator ? 1 : 0);
  return db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
}

export function getParticipantBySocket(db, socketId) {
  return db.prepare('SELECT * FROM participants WHERE socket_id = ?').get(socketId);
}

export function getParticipants(db, retroId) {
  return db.prepare('SELECT * FROM participants WHERE retro_id = ?').all(retroId);
}

export function removeParticipantBySocket(db, socketId) {
  const p = getParticipantBySocket(db, socketId);
  if (p) {
    db.prepare('DELETE FROM participants WHERE socket_id = ?').run(socketId);
  }
  return p;
}

export function addCard(db, { retroId, column, text }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO cards (id, retro_id, "column", text, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, retroId, column, text, now);
  return db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
}

export function getCards(db, retroId) {
  return db.prepare('SELECT * FROM cards WHERE retro_id = ?').all(retroId);
}

export function groupCards(db, parentCardId, childCardId) {
  db.prepare('UPDATE cards SET group_id = ? WHERE id = ?').run(parentCardId, childCardId);
}

export function ungroupCard(db, cardId) {
  db.prepare('UPDATE cards SET group_id = NULL WHERE id = ?').run(cardId);
}

export function addVote(db, { cardId, participantId }) {
  const id = uuidv4();
  db.prepare('INSERT INTO votes (id, card_id, participant_id) VALUES (?, ?, ?)').run(id, cardId, participantId);
  return getVoteCount(db, cardId);
}

export function removeVote(db, { cardId, participantId }) {
  db.prepare('DELETE FROM votes WHERE card_id = ? AND participant_id = ?').run(cardId, participantId);
  return getVoteCount(db, cardId);
}

export function getVoteCount(db, cardId) {
  const row = db.prepare('SELECT COUNT(*) as count FROM votes WHERE card_id = ?').get(cardId);
  return row.count;
}

export function getVotesByParticipant(db, participantId, retroId) {
  return db.prepare(
    'SELECT v.* FROM votes v JOIN cards c ON v.card_id = c.id WHERE v.participant_id = ? AND c.retro_id = ?'
  ).all(participantId, retroId);
}

export function getVotesForRetro(db, retroId) {
  return db.prepare(
    'SELECT v.* FROM votes v JOIN cards c ON v.card_id = c.id WHERE c.retro_id = ?'
  ).all(retroId);
}

export function saveSummary(db, { retroId, text }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO summaries (id, retro_id, text, created_at) VALUES (?, ?, ?, ?)').run(id, retroId, text, now);
  return db.prepare('SELECT * FROM summaries WHERE id = ?').get(id);
}

export function initDb(dbPath = './retro.db') {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  createSchema(db);
  return db;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/db.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/db.js server/tests/db.test.js
git commit -m "feat: add SQLite database layer with schema and queries"
```

---

### Task 3: Server Socket Handlers - Retro & Participants

**Files:**
- Create: `server/handlers/retroHandler.js`
- Create: `server/handlers/phaseHandler.js`
- Create: `server/tests/retroHandler.test.js`

- [ ] **Step 1: Write failing test for retro handler**

```js
// server/tests/retroHandler.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createSchema, getRetroByShareCode, getParticipants } from '../db.js';
import { handleCreateRetro, handleJoinRetro } from '../handlers/retroHandler.js';

describe('retroHandler', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a retro and return share code', () => {
    const result = handleCreateRetro(db, {
      title: 'Sprint 24',
      addPointsDuration: 600,
      votingDuration: 300,
    });
    expect(result.retro.title).toBe('Sprint 24');
    expect(result.retro.share_code).toBeTruthy();
    expect(result.retro.add_points_duration).toBe(600);
    expect(result.retro.voting_duration).toBe(300);
  });

  it('should join a retro and mark first joiner as facilitator', () => {
    const { retro } = handleCreateRetro(db, {
      title: 'Test',
      addPointsDuration: 600,
      votingDuration: 600,
    });
    const result = handleJoinRetro(db, {
      shareCode: retro.share_code,
      displayName: 'Alice',
      socketId: 'sock1',
    });
    expect(result.participant.display_name).toBe('Alice');
    expect(result.participant.is_facilitator).toBe(1);

    const result2 = handleJoinRetro(db, {
      shareCode: retro.share_code,
      displayName: 'Bob',
      socketId: 'sock2',
    });
    expect(result2.participant.is_facilitator).toBe(0);
  });

  it('should return error for invalid share code', () => {
    const result = handleJoinRetro(db, {
      shareCode: 'invalid',
      displayName: 'Alice',
      socketId: 'sock1',
    });
    expect(result.error).toBe('Retro not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/retroHandler.test.js`
Expected: FAIL - cannot find module

- [ ] **Step 3: Implement retroHandler**

```js
// server/handlers/retroHandler.js
import { createRetro, getRetroByShareCode, addParticipant, getParticipants, getCards, getVotesForRetro } from '../db.js';

export function handleCreateRetro(db, { title, addPointsDuration, votingDuration }) {
  const retro = createRetro(db, { title, addPointsDuration, votingDuration });
  return { retro };
}

export function handleJoinRetro(db, { shareCode, displayName, socketId }) {
  const retro = getRetroByShareCode(db, shareCode);
  if (!retro) {
    return { error: 'Retro not found' };
  }
  const existingParticipants = getParticipants(db, retro.id);
  const isFacilitator = existingParticipants.length === 0;
  const participant = addParticipant(db, {
    retroId: retro.id,
    displayName,
    socketId,
    isFacilitator,
  });
  return { retro, participant };
}

export function getRetroState(db, retroId) {
  const retro = db.prepare('SELECT * FROM retros WHERE id = ?').get(retroId);
  const participants = getParticipants(db, retroId);
  const cards = getCards(db, retroId);
  const votes = getVotesForRetro(db, retroId);
  return { retro, participants, cards, votes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/retroHandler.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/handlers/retroHandler.js server/tests/retroHandler.test.js
git commit -m "feat: add retro creation and join handlers"
```

---

### Task 4: Card & Vote Handlers

**Files:**
- Create: `server/handlers/cardHandler.js`
- Create: `server/handlers/voteHandler.js`
- Create: `server/tests/cardHandler.test.js`
- Create: `server/tests/voteHandler.test.js`

- [ ] **Step 1: Write failing test for card handler**

```js
// server/tests/cardHandler.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createSchema, createRetro, addParticipant } from '../db.js';
import { handleAddCard, handleGroupCards, handleUngroupCard } from '../handlers/cardHandler.js';

describe('cardHandler', () => {
  let db, retro, participant;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
    retro = createRetro(db, { title: 'Test', addPointsDuration: 600, votingDuration: 600 });
    participant = addParticipant(db, { retroId: retro.id, displayName: 'Alice', socketId: 's1', isFacilitator: true });
  });

  afterEach(() => { db.close(); });

  it('should add a card', () => {
    const card = handleAddCard(db, { retroId: retro.id, column: 'well', text: 'Great work' });
    expect(card.text).toBe('Great work');
    expect(card.column).toBe('well');
    expect(card.retro_id).toBe(retro.id);
  });

  it('should group cards', () => {
    const parent = handleAddCard(db, { retroId: retro.id, column: 'well', text: 'Parent' });
    const child = handleAddCard(db, { retroId: retro.id, column: 'well', text: 'Child' });
    handleGroupCards(db, { parentCardId: parent.id, childCardId: child.id });
    const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(child.id);
    expect(updated.group_id).toBe(parent.id);
  });

  it('should ungroup a card', () => {
    const parent = handleAddCard(db, { retroId: retro.id, column: 'well', text: 'Parent' });
    const child = handleAddCard(db, { retroId: retro.id, column: 'well', text: 'Child' });
    handleGroupCards(db, { parentCardId: parent.id, childCardId: child.id });
    handleUngroupCard(db, { cardId: child.id });
    const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(child.id);
    expect(updated.group_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/cardHandler.test.js`
Expected: FAIL

- [ ] **Step 3: Implement cardHandler**

```js
// server/handlers/cardHandler.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/cardHandler.test.js`
Expected: ALL PASS

- [ ] **Step 5: Write failing test for vote handler**

```js
// server/tests/voteHandler.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createSchema, createRetro, addParticipant, addCard } from '../db.js';
import { handleVote, handleUnvote } from '../handlers/voteHandler.js';

describe('voteHandler', () => {
  let db, retro, participant, card;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
    retro = createRetro(db, { title: 'Test', addPointsDuration: 600, votingDuration: 600 });
    participant = addParticipant(db, { retroId: retro.id, displayName: 'Alice', socketId: 's1', isFacilitator: true });
    card = addCard(db, { retroId: retro.id, column: 'well', text: 'Good stuff' });
  });

  afterEach(() => { db.close(); });

  it('should add a vote and return count', () => {
    const result = handleVote(db, { cardId: card.id, participantId: participant.id, retroId: retro.id });
    expect(result.voteCount).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it('should reject duplicate vote on same card', () => {
    handleVote(db, { cardId: card.id, participantId: participant.id, retroId: retro.id });
    const result = handleVote(db, { cardId: card.id, participantId: participant.id, retroId: retro.id });
    expect(result.error).toBe('Already voted on this card');
  });

  it('should reject vote when 3 votes used', () => {
    const card2 = addCard(db, { retroId: retro.id, column: 'well', text: 'Card 2' });
    const card3 = addCard(db, { retroId: retro.id, column: 'well', text: 'Card 3' });
    const card4 = addCard(db, { retroId: retro.id, column: 'well', text: 'Card 4' });
    handleVote(db, { cardId: card.id, participantId: participant.id, retroId: retro.id });
    handleVote(db, { cardId: card2.id, participantId: participant.id, retroId: retro.id });
    handleVote(db, { cardId: card3.id, participantId: participant.id, retroId: retro.id });
    const result = handleVote(db, { cardId: card4.id, participantId: participant.id, retroId: retro.id });
    expect(result.error).toBe('No votes remaining');
  });

  it('should remove a vote', () => {
    handleVote(db, { cardId: card.id, participantId: participant.id, retroId: retro.id });
    const result = handleUnvote(db, { cardId: card.id, participantId: participant.id });
    expect(result.voteCount).toBe(0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd server && npx vitest run tests/voteHandler.test.js`
Expected: FAIL

- [ ] **Step 7: Implement voteHandler**

```js
// server/handlers/voteHandler.js
import { addVote, removeVote, getVotesByParticipant, getVoteCount } from '../db.js';

const MAX_VOTES = 3;

export function handleVote(db, { cardId, participantId, retroId }) {
  const existingVotes = getVotesByParticipant(db, participantId, retroId);
  if (existingVotes.length >= MAX_VOTES) {
    return { error: 'No votes remaining' };
  }
  const alreadyVoted = existingVotes.some(v => v.card_id === cardId);
  if (alreadyVoted) {
    return { error: 'Already voted on this card' };
  }
  const voteCount = addVote(db, { cardId, participantId });
  return { voteCount, cardId };
}

export function handleUnvote(db, { cardId, participantId }) {
  const voteCount = removeVote(db, { cardId, participantId });
  return { voteCount, cardId };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd server && npx vitest run tests/voteHandler.test.js`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add server/handlers/cardHandler.js server/handlers/voteHandler.js server/tests/cardHandler.test.js server/tests/voteHandler.test.js
git commit -m "feat: add card and vote handlers with 3-vote limit"
```

---

### Task 5: Phase Handler with Timer Management

**Files:**
- Create: `server/handlers/phaseHandler.js`
- Create: `server/tests/phaseHandler.test.js`

- [ ] **Step 1: Write failing test for phase handler**

```js
// server/tests/phaseHandler.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createSchema, createRetro, getRetro } from '../db.js';
import { handleStartPhase, handleEndPhase, PHASE_ORDER } from '../handlers/phaseHandler.js';

describe('phaseHandler', () => {
  let db, retro;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
    retro = createRetro(db, { title: 'Test', addPointsDuration: 600, votingDuration: 300 });
  });

  afterEach(() => { db.close(); });

  it('should start adding phase from waiting', () => {
    const result = handleStartPhase(db, { retroId: retro.id, phase: 'adding' });
    expect(result.retro.phase).toBe('adding');
    expect(result.retro.phase_ends_at).toBeTruthy();
  });

  it('should reject invalid phase transition', () => {
    const result = handleStartPhase(db, { retroId: retro.id, phase: 'voting' });
    expect(result.error).toBeTruthy();
  });

  it('should end phase early and move to next', () => {
    handleStartPhase(db, { retroId: retro.id, phase: 'adding' });
    const result = handleEndPhase(db, { retroId: retro.id });
    expect(result.retro.phase).toBe('grouping');
    expect(result.retro.phase_ends_at).toBeNull();
  });

  it('should move from grouping to voting', () => {
    handleStartPhase(db, { retroId: retro.id, phase: 'adding' });
    handleEndPhase(db, { retroId: retro.id });
    const result = handleStartPhase(db, { retroId: retro.id, phase: 'voting' });
    expect(result.retro.phase).toBe('voting');
    expect(result.retro.phase_ends_at).toBeTruthy();
  });

  it('should end voting and move to discussion', () => {
    handleStartPhase(db, { retroId: retro.id, phase: 'adding' });
    handleEndPhase(db, { retroId: retro.id });
    handleStartPhase(db, { retroId: retro.id, phase: 'voting' });
    const result = handleEndPhase(db, { retroId: retro.id });
    expect(result.retro.phase).toBe('discussion');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/phaseHandler.test.js`
Expected: FAIL

- [ ] **Step 3: Implement phaseHandler**

```js
// server/handlers/phaseHandler.js
import { updateRetroPhase, getRetro } from '../db.js';

export const PHASE_ORDER = ['waiting', 'adding', 'grouping', 'voting', 'discussion'];

const VALID_TRANSITIONS = {
  waiting: ['adding'],
  adding: ['grouping'],
  grouping: ['voting'],
  voting: ['discussion'],
  discussion: [],
};

const NEXT_PHASE = {
  adding: 'grouping',
  voting: 'discussion',
  grouping: 'grouping',
};

const TIMED_PHASES = {
  adding: 'add_points_duration',
  voting: 'voting_duration',
};

export function handleStartPhase(db, { retroId, phase }) {
  const retro = getRetro(db, retroId);
  if (!VALID_TRANSITIONS[retro.phase]?.includes(phase)) {
    return { error: Cannot transition from  to  };
  }
  let phaseEndsAt = null;
  if (TIMED_PHASES[phase]) {
    const durationSeconds = retro[TIMED_PHASES[phase]];
    phaseEndsAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
  }
  const updated = updateRetroPhase(db, retroId, phase, phaseEndsAt);
  return { retro: updated };
}

export function handleEndPhase(db, { retroId }) {
  const retro = getRetro(db, retroId);
  const nextPhase = NEXT_PHASE[retro.phase];
  if (!nextPhase) {
    return { error: Cannot end phase  };
  }
  const updated = updateRetroPhase(db, retroId, nextPhase, null);
  return { retro: updated };
}

export function handleTimerExpired(db, { retroId }) {
  return handleEndPhase(db, { retroId });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/phaseHandler.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/handlers/phaseHandler.js server/tests/phaseHandler.test.js
git commit -m "feat: add phase handler with timer management"
```

---

### Task 6: LLM Service

**Files:**
- Create: `server/services/llmService.js`
- Create: `server/tests/llmService.test.js`

- [ ] **Step 1: Write failing test for LLM service**

```js
// server/tests/llmService.test.js
import { describe, it, expect, vi } from 'vitest';
import { buildPrompt, parseSummary } from '../services/llmService.js';

describe('llmService', () => {
  it('should build a prompt from cards and votes', () => {
    const cards = [
      { id: '1', column: 'well', text: 'CI/CD improved', group_id: null },
      { id: '2', column: 'didnt', text: 'Scope changes', group_id: null },
      { id: '3', column: 'action', text: 'Freeze scope', group_id: null },
    ];
    const votes = [
      { card_id: '1' }, { card_id: '1' },
      { card_id: '2' }, { card_id: '2' }, { card_id: '2' },
      { card_id: '3' },
    ];
    const prompt = buildPrompt(cards, votes);
    expect(prompt).toContain('What Went Well');
    expect(prompt).toContain('CI/CD improved');
    expect(prompt).toContain('2 votes');
    expect(prompt).toContain('What Didn\'t Go Well');
    expect(prompt).toContain('3 votes');
    expect(prompt).toContain('Action Items');
    expect(prompt).toContain('exactly 2 sentences');
  });

  it('should exclude grouped child cards from prompt', () => {
    const cards = [
      { id: '1', column: 'well', text: 'Parent card', group_id: null },
      { id: '2', column: 'well', text: 'Child card', group_id: '1' },
    ];
    const votes = [];
    const prompt = buildPrompt(cards, votes);
    expect(prompt).toContain('Parent card');
    expect(prompt).not.toContain('Child card');
  });

  it('should parse summary text from response', () => {
    const raw = 'The team did well. Next steps are clear.';
    expect(parseSummary(raw)).toBe('The team did well. Next steps are clear.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/llmService.test.js`
Expected: FAIL

- [ ] **Step 3: Implement llmService**

```js
// server/services/llmService.js
const COLUMN_LABELS = {
  well: 'What Went Well',
  didnt: "What Didn't Go Well",
  action: 'Action Items',
};

export function buildPrompt(cards, votes) {
  const parentCards = cards.filter(c => !c.group_id);
  const voteCounts = {};
  for (const v of votes) {
    voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
  }

  let prompt = 'Summarize this sprint retrospective in exactly 2 sentences.\n\n';
  for (const [col, label] of Object.entries(COLUMN_LABELS)) {
    const colCards = parentCards.filter(c => c.column === col);
    prompt += ${label}:\n;
    if (colCards.length === 0) {
      prompt += '- (none)\n';
    } else {
      for (const card of colCards) {
        const count = voteCounts[card.id] || 0;
        prompt += -  ( votes)\n;
      }
    }
    prompt += '\n';
  }
  return prompt;
}

export function parseSummary(responseText) {
  return responseText.trim();
}

export async function generateSummary(cards, votes) {
  const prompt = buildPrompt(cards, votes);
  const gatewayUrl = process.env.LLM_GATEWAY_URL;
  const apiKey = process.env.LLM_API_KEY;

  if (!gatewayUrl || !apiKey) {
    throw new Error('LLM_GATEWAY_URL and LLM_API_KEY environment variables are required');
  }

  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': Bearer ,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(LLM Gateway error: );
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || data.response || '';
  return parseSummary(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/llmService.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/llmService.js server/tests/llmService.test.js
git commit -m "feat: add LLM service with LLM Gateway integration"
```

---

### Task 7: Express + Socket.IO Server Entry Point

**Files:**
- Create: `server/index.js`

- [ ] **Step 1: Implement server entry point**

```js
// server/index.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getParticipantBySocket, removeParticipantBySocket, getParticipants, getCards, getVotesForRetro, saveSummary } from './db.js';
import { handleCreateRetro, handleJoinRetro, getRetroState } from './handlers/retroHandler.js';
import { handleAddCard, handleGroupCards, handleUngroupCard } from './handlers/cardHandler.js';
import { handleVote, handleUnvote } from './handlers/voteHandler.js';
import { handleStartPhase, handleEndPhase, handleTimerExpired } from './handlers/phaseHandler.js';
import { generateSummary } from './services/llmService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.use(express.json());

const distPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distPath));

const db = initDb(path.join(__dirname, 'retro.db'));

const timers = new Map();

function startTimer(retroId, durationMs, callback) {
  clearTimer(retroId);
  const timer = setTimeout(() => {
    timers.delete(retroId);
    callback();
  }, durationMs);
  timers.set(retroId, timer);
}

function clearTimer(retroId) {
  const existing = timers.get(retroId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(retroId);
  }
}

app.post('/api/retros', (req, res) => {
  const { title, addPointsDuration, votingDuration } = req.body;
  const result = handleCreateRetro(db, {
    title: title || 'Untitled Retrospective',
    addPointsDuration: addPointsDuration || 600,
    votingDuration: votingDuration || 600,
  });
  res.json(result);
});

io.on('connection', (socket) => {
  socket.on('join-retro', ({ shareCode, displayName }, callback) => {
    const result = handleJoinRetro(db, { shareCode, displayName, socketId: socket.id });
    if (result.error) {
      callback?.({ error: result.error });
      return;
    }
    const { retro, participant } = result;
    socket.join(retro.id);
    const state = getRetroState(db, retro.id);
    callback?.({ participant, state });
    socket.to(retro.id).emit('participant-joined', {
      participant: { id: participant.id, display_name: participant.display_name },
      count: state.participants.length,
    });
  });

  socket.on('add-card', ({ column, text }) => {
    const participant = getParticipantBySocket(db, socket.id);
    if (!participant) return;
    const retro = db.prepare('SELECT * FROM retros WHERE id = ?').get(participant.retro_id);
    if (retro.phase !== 'adding') return;
    const card = handleAddCard(db, { retroId: retro.id, column, text });
    io.to(retro.id).emit('card-added', { card });
  });

  socket.on('vote-card', ({ cardId }) => {
    const participant = getParticipantBySocket(db, socket.id);
    if (!participant) return;
    const retro = db.prepare('SELECT * FROM retros WHERE id = ?').get(participant.retro_id);
    if (retro.phase !== 'voting') return;
    const result = handleVote(db, { cardId, participantId: participant.id, retroId: retro.id });
    if (result.error) {
      socket.emit('vote-error', { error: result.error });
      return;
    }
    io.to(retro.id).emit('card-voted', { cardId, voteCount: result.voteCount });
  });

  socket.on('unvote-card', ({ cardId }) => {
    const participant = getParticipantBySocket(db, socket.id);
    if (!participant) return;
    const retro = db.prepare('SELECT * FROM retros WHERE id = ?').get(participant.retro_id);
    if (retro.phase !== 'voting') return;
    const result = handleUnvote(db, { cardId, participantId: participant.id });
    io.to(retro.id).emit('card-unvoted', { cardId, voteCount: result.voteCount });
  });

  socket.on('group-cards', ({ parentCardId, childCardId }) => {
    const participant = getParticipantBySocket(db, socket.id);
    if (!participant || !participant.is_facilitator) return;
    const retro = db.prepare('SELECT * FROM retros WHERE id = ?').get(participant.retro_id);
    if (retro.phase !== 'grouping') return;
    handleGroupCards(db, { parentCardId, childCardId });
    io.to(retro.id).emit('cards-grouped', { parentCardId, childCardId });
  });

  socket.on('ungroup-card', ({ cardId }) => {
    const participant = getParticipantBySocket(db, socket.id);
    if (!participant || !participant.is_facilitator) return;
    handleUngroupCard(db, { cardId });
    io.to(participant.retro_id).emit('card-ungrouped', { cardId });
  });

  socket.on('start-phase', ({ phase }) => {
    const participant = getParticipantBySocket(db, socket.id);
    if (!participant || !participant.is_facilitator) return;
    const result = handleStartPhase(db, { retroId: participant.retro_id, phase });
    if (result.error) {
      socket.emit('phase-error', { error: result.error });
      return;
    }
    const { retro } = result;
    io.to(retro.id).emit('phase-changed', { phase: retro.phase, endsAt: retro.phase_ends_at });
    if (retro.phase_ends_at) {
      const ms = new Date(retro.phase_ends_at).getTime() - Date.now();
      startTimer(retro.id, ms, () => {
        const expired = handleTimerExpired(db, { retroId: retro.id });
        io.to(retro.id).emit('timer-expired', { phase: retro.phase });
        io.to(retro.id).emit('phase-changed', { phase: expired.retro.phase, endsAt: null });
      });
    }
  });

  socket.on('end-phase', () => {
    const participant = getParticipantBySocket(db, socket.id);
    if (!participant || !participant.is_facilitator) return;
    clearTimer(participant.retro_id);
    const result = handleEndPhase(db, { retroId: participant.retro_id });
    if (result.error) return;
    io.to(participant.retro_id).emit('phase-changed', { phase: result.retro.phase, endsAt: null });
  });

  socket.on('generate-summary', async () => {
    const participant = getParticipantBySocket(db, socket.id);
    if (!participant || !participant.is_facilitator) return;
    const retro = db.prepare('SELECT * FROM retros WHERE id = ?').get(participant.retro_id);
    if (retro.phase !== 'discussion') return;
    try {
      const cards = getCards(db, retro.id);
      const votes = getVotesForRetro(db, retro.id);
      const text = await generateSummary(cards, votes);
      saveSummary(db, { retroId: retro.id, text });
      io.to(retro.id).emit('summary-generated', { text });
    } catch (err) {
      socket.emit('summary-error', { error: err.message });
    }
  });

  socket.on('disconnect', () => {
    const participant = removeParticipantBySocket(db, socket.id);
    if (participant) {
      const remaining = getParticipants(db, participant.retro_id);
      io.to(participant.retro_id).emit('participant-left', {
        participantId: participant.id,
        count: remaining.length,
      });
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(Server running on port );
});
```

- [ ] **Step 2: Verify server starts**

Run: `cd server && node index.js`
Expected: "Server running on port 3001" (Ctrl+C to stop)

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add Express + Socket.IO server with all event handlers"
```

---

### Task 8: React App Shell - Entry, Router, Contexts

**Files:**
- Create: `client/index.html`
- Create: `client/src/main.jsx`
- Create: `client/src/App.jsx`
- Create: `client/src/context/SocketContext.jsx`
- Create: `client/src/context/RetroContext.jsx`

- [ ] **Step 1: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RetroBoard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create client/src/main.jsx**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 3: Create client/src/index.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  min-height: 100vh;
}

:root {
  --color-well: #00d2d3;
  --color-didnt: #e94560;
  --color-action: #533483;
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-card: #16213e;
  --border: #0f3460;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0b0;
}
```

- [ ] **Step 4: Create client/src/App.jsx**

```jsx
import { Routes, Route } from 'react-router-dom';
import CreateRetro from './components/CreateRetro';
import JoinForm from './components/JoinForm';
import Board from './components/Board';
import { SocketProvider } from './context/SocketContext';
import { RetroProvider } from './context/RetroContext';

export default function App() {
  return (
    <SocketProvider>
      <RetroProvider>
        <Routes>
          <Route path="/" element={<CreateRetro />} />
          <Route path="/retro/:shareCode" element={<JoinForm />} />
          <Route path="/retro/:shareCode/board" element={<Board />} />
        </Routes>
      </RetroProvider>
    </SocketProvider>
  );
}
```

- [ ] **Step 5: Create client/src/context/SocketContext.jsx**

```jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const s = io('/', { autoConnect: true });
    setSocket(s);
    return () => s.disconnect();
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
```

- [ ] **Step 6: Create client/src/context/RetroContext.jsx**

```jsx
import { createContext, useContext, useReducer, useCallback } from 'react';

const RetroContext = createContext(null);

const initialState = {
  retro: null,
  participant: null,
  participants: [],
  cards: [],
  votes: [],
  summary: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_STATE':
      return {
        ...state,
        retro: action.payload.retro,
        participants: action.payload.participants,
        cards: action.payload.cards,
        votes: action.payload.votes,
      };
    case 'SET_PARTICIPANT':
      return { ...state, participant: action.payload };
    case 'CARD_ADDED':
      return { ...state, cards: [...state.cards, action.payload] };
    case 'CARD_VOTED':
      return {
        ...state,
        votes: [...state.votes, { card_id: action.payload.cardId, participant_id: action.payload.participantId }],
      };
    case 'CARD_UNVOTED':
      return {
        ...state,
        votes: state.votes.filter(
          v => !(v.card_id === action.payload.cardId && v.participant_id === action.payload.participantId)
        ),
      };
    case 'CARDS_GROUPED':
      return {
        ...state,
        cards: state.cards.map(c =>
          c.id === action.payload.childCardId ? { ...c, group_id: action.payload.parentCardId } : c
        ),
      };
    case 'CARD_UNGROUPED':
      return {
        ...state,
        cards: state.cards.map(c =>
          c.id === action.payload.cardId ? { ...c, group_id: null } : c
        ),
      };
    case 'PHASE_CHANGED':
      return {
        ...state,
        retro: { ...state.retro, phase: action.payload.phase, phase_ends_at: action.payload.endsAt },
      };
    case 'PARTICIPANT_JOINED':
      return {
        ...state,
        participants: [...state.participants, action.payload.participant],
      };
    case 'PARTICIPANT_LEFT':
      return {
        ...state,
        participants: state.participants.filter(p => p.id !== action.payload.participantId),
      };
    case 'SUMMARY_GENERATED':
      return { ...state, summary: action.payload.text };
    default:
      return state;
  }
}

export function RetroProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <RetroContext.Provider value={{ state, dispatch }}>
      {children}
    </RetroContext.Provider>
  );
}

export function useRetro() {
  return useContext(RetroContext);
}
```

- [ ] **Step 7: Verify client builds**

Run: `cd client && npx vite build`
Expected: Build succeeds (may have warnings about missing components, that's OK)

- [ ] **Step 8: Commit**

```bash
git add client/
git commit -m "feat: add React app shell with router and state contexts"
```

---

### Task 9: CreateRetro & JoinForm Components

**Files:**
- Create: `client/src/components/CreateRetro.jsx`
- Create: `client/src/components/JoinForm.jsx`

- [ ] **Step 1: Create CreateRetro component**

```jsx
// client/src/components/CreateRetro.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function CreateRetro() {
  const [title, setTitle] = useState('');
  const [addPointsDuration, setAddPointsDuration] = useState(10);
  const [votingDuration, setVotingDuration] = useState(10);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/retros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        addPointsDuration: addPointsDuration * 60,
        votingDuration: votingDuration * 60,
      }),
    });
    const { retro } = await res.json();
    navigate(/retro/);
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--bg-secondary)', padding: 32, borderRadius: 12,
        width: 400, display: 'flex', flexDirection: 'column', gap: 16
      }}>
        <h1 style={{ color: 'var(--color-didnt)', fontSize: 24 }}>RetroBoard</h1>
        <h2 style={{ fontSize: 18 }}>New Retrospective</h2>
        <label>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Title</span>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Sprint 24 Retrospective"
            required
            style={{
              width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-primary)', color: 'var(--text-primary)', marginTop: 4
            }}
          />
        </label>
        <label>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Add Points Timer (minutes)</span>
          <input
            type="number" min={1} max={60} value={addPointsDuration}
            onChange={e => setAddPointsDuration(Number(e.target.value))}
            style={{
              width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-primary)', color: 'var(--text-primary)', marginTop: 4
            }}
          />
        </label>
        <label>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Voting Timer (minutes)</span>
          <input
            type="number" min={1} max={60} value={votingDuration}
            onChange={e => setVotingDuration(Number(e.target.value))}
            style={{
              width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-primary)', color: 'var(--text-primary)', marginTop: 4
            }}
          />
        </label>
        <button type="submit" disabled={loading} style={{
          padding: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
          background: 'var(--color-didnt)', color: '#fff', fontWeight: 600, fontSize: 15
        }}>
          {loading ? 'Creating...' : 'Create Retrospective'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create JoinForm component**

```jsx
// client/src/components/JoinForm.jsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useRetro } from '../context/RetroContext';

export default function JoinForm() {
  const { shareCode } = useParams();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const socket = useSocket();
  const { dispatch } = useRetro();
  const navigate = useNavigate();

  function handleJoin(e) {
    e.preventDefault();
    if (!socket) return;
    setLoading(true);
    setError('');
    socket.emit('join-retro', { shareCode, displayName }, (response) => {
      setLoading(false);
      if (response.error) {
        setError(response.error);
        return;
      }
      dispatch({ type: 'SET_PARTICIPANT', payload: response.participant });
      dispatch({ type: 'SET_STATE', payload: response.state });
      navigate(/retro//board);
    });
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <form onSubmit={handleJoin} style={{
        background: 'var(--bg-secondary)', padding: 32, borderRadius: 12,
        width: 400, display: 'flex', flexDirection: 'column', gap: 16
      }}>
        <h1 style={{ color: 'var(--color-didnt)', fontSize: 24 }}>RetroBoard</h1>
        <h2 style={{ fontSize: 18 }}>Join Retrospective</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Code: {shareCode}</p>
        {error && <p style={{ color: 'var(--color-didnt)', fontSize: 13 }}>{error}</p>}
        <label>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Your Display Name</span>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Enter your name"
            required
            style={{
              width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg-primary)', color: 'var(--text-primary)', marginTop: 4
            }}
          />
        </label>
        <button type="submit" disabled={loading || !socket} style={{
          padding: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
          background: 'var(--color-didnt)', color: '#fff', fontWeight: 600, fontSize: 15
        }}>
          {loading ? 'Joining...' : 'Join'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/CreateRetro.jsx client/src/components/JoinForm.jsx
git commit -m "feat: add CreateRetro and JoinForm components"
```

---

### Task 10: Board, Column, Card Components

**Files:**
- Create: `client/src/components/Board.jsx`
- Create: `client/src/components/Column.jsx`
- Create: `client/src/components/Card.jsx`
- Create: `client/src/components/GroupBadge.jsx`

- [ ] **Step 1: Create Card component**

```jsx
// client/src/components/Card.jsx
import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRetro } from '../context/RetroContext';
import GroupBadge from './GroupBadge';

const COLUMN_COLORS = { well: 'var(--color-well)', didnt: 'var(--color-didnt)', action: 'var(--color-action)' };

export default function Card({ card, column }) {
  const socket = useSocket();
  const { state } = useRetro();
  const color = COLUMN_COLORS[column];
  const voteCount = state.votes.filter(v => v.card_id === card.id).length;
  const hasVoted = state.votes.some(v => v.card_id === card.id && v.participant_id === state.participant?.id);
  const childCards = state.cards.filter(c => c.group_id === card.id);
  const isFacilitator = state.participant?.is_facilitator;
  const isGroupingPhase = state.retro?.phase === 'grouping';

  function handleVote() {
    if (state.retro?.phase !== 'voting') return;
    if (hasVoted) {
      socket.emit('unvote-card', { cardId: card.id });
    } else {
      socket.emit('vote-card', { cardId: card.id });
    }
  }

  function handleDragStart(e) {
    if (!isFacilitator || !isGroupingPhase) return;
    e.dataTransfer.setData('text/plain', card.id);
  }

  function handleDrop(e) {
    if (!isFacilitator || !isGroupingPhase) return;
    e.preventDefault();
    const childCardId = e.dataTransfer.getData('text/plain');
    if (childCardId && childCardId !== card.id) {
      socket.emit('group-cards', { parentCardId: card.id, childCardId });
    }
  }

  function handleDragOver(e) {
    if (isFacilitator && isGroupingPhase) e.preventDefault();
  }

  return (
    <div
      draggable={isFacilitator && isGroupingPhase}
      onDragStart={handleDragStart}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      style={{
        background: 'var(--bg-card)', borderRadius: 8, padding: 12, marginBottom: 8,
        borderLeft: 3px solid , cursor: isGroupingPhase && isFacilitator ? 'grab' : 'default',
      }}
    >
      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-primary)' }}>{card.text}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          onClick={handleVote}
          style={{
            color, fontSize: 11, cursor: state.retro?.phase === 'voting' ? 'pointer' : 'default',
            fontWeight: hasVoted ? 700 : 400,
          }}
        >
          &#9650; {voteCount} vote{voteCount !== 1 ? 's' : ''}
        </span>
        {childCards.length > 0 && <GroupBadge parentCard={card} childCards={childCards} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create GroupBadge component**

```jsx
// client/src/components/GroupBadge.jsx
import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRetro } from '../context/RetroContext';

export default function GroupBadge({ parentCard, childCards }) {
  const [expanded, setExpanded] = useState(false);
  const socket = useSocket();
  const { state } = useRetro();
  const isFacilitator = state.participant?.is_facilitator;

  function handleUngroup(cardId) {
    socket.emit('ungroup-card', { cardId });
  }

  return (
    <div>
      <span
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'var(--border)', padding: '2px 8px', borderRadius: 8,
          color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer',
        }}
      >
        grouped ({childCards.length + 1})
      </span>
      {expanded && (
        <div style={{ marginTop: 8, paddingLeft: 8, borderLeft: '2px solid var(--border)' }}>
          {childCards.map(c => (
            <div key={c.id} style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span>{c.text}</span>
              {isFacilitator && (
                <span onClick={() => handleUngroup(c.id)} style={{ color: 'var(--color-didnt)', cursor: 'pointer', marginLeft: 8 }}>ungroup</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create Column component**

```jsx
// client/src/components/Column.jsx
import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRetro } from '../context/RetroContext';
import Card from './Card';

const COLUMN_CONFIG = {
  well: { label: 'What Went Well', color: 'var(--color-well)' },
  didnt: { label: "What Didn't Go Well", color: 'var(--color-didnt)' },
  action: { label: 'Action Items', color: 'var(--color-action)' },
};

export default function Column({ column }) {
  const [text, setText] = useState('');
  const socket = useSocket();
  const { state } = useRetro();
  const config = COLUMN_CONFIG[column];
  const isDiscussion = state.retro?.phase === 'discussion';

  const visibleCards = state.cards
    .filter(c => c.column === column && !c.group_id)
    .sort((a, b) => {
      if (!isDiscussion) return new Date(a.created_at) - new Date(b.created_at);
      const aVotes = state.votes.filter(v => v.card_id === a.id).length;
      const bVotes = state.votes.filter(v => v.card_id === b.id).length;
      return bVotes - aVotes;
    });

  function handleAdd(e) {
    e.preventDefault();
    if (!text.trim() || state.retro?.phase !== 'adding') return;
    socket.emit('add-card', { column, text: text.trim() });
    setText('');
  }

  return (
    <div style={{ flex: 1, padding: 16, borderRight: column !== 'action' ? '1px solid var(--border)' : 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: config.color, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>
          {config.label}
        </h3>
        <span style={{
          background: config.color, color: column === 'well' ? 'var(--bg-primary)' : '#fff',
          width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 11, fontWeight: 700,
        }}>
          {visibleCards.length}
        </span>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
        {visibleCards.map(card => <Card key={card.id} card={card} column={column} />)}
      </div>
      {state.retro?.phase === 'adding' && (
        <form onSubmit={handleAdd} style={{ marginTop: 8 }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add a point..."
            style={{
              width: '100%', padding: 10, borderRadius: 8, border: '1px dashed var(--border)',
              background: 'transparent', color: 'var(--text-primary)', fontSize: 12,
            }}
          />
        </form>
      )}
      {state.retro?.phase !== 'adding' && (
        <div style={{
          border: '1px dashed var(--border)', borderRadius: 8, padding: 10, textAlign: 'center',
          color: 'var(--text-secondary)', fontSize: 12, opacity: 0.5, marginTop: 8,
        }}>
          Adding cards is locked
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create Board component**

```jsx
// client/src/components/Board.jsx
import { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useRetro } from '../context/RetroContext';
import Header from './Header';
import Column from './Column';
import Summary from './Summary';
import Timer from './Timer';

export default function Board() {
  const socket = useSocket();
  const { state, dispatch } = useRetro();

  useEffect(() => {
    if (!socket) return;

    socket.on('card-added', ({ card }) => dispatch({ type: 'CARD_ADDED', payload: card }));

    socket.on('card-voted', ({ cardId, voteCount }) => {
      dispatch({ type: 'CARD_VOTED', payload: { cardId, participantId: '__broadcast__' } });
    });

    socket.on('card-unvoted', ({ cardId, voteCount }) => {
      dispatch({ type: 'CARD_UNVOTED', payload: { cardId, participantId: '__broadcast__' } });
    });

    socket.on('cards-grouped', ({ parentCardId, childCardId }) => {
      dispatch({ type: 'CARDS_GROUPED', payload: { parentCardId, childCardId } });
    });

    socket.on('card-ungrouped', ({ cardId }) => {
      dispatch({ type: 'CARD_UNGROUPED', payload: { cardId } });
    });

    socket.on('phase-changed', ({ phase, endsAt }) => {
      dispatch({ type: 'PHASE_CHANGED', payload: { phase, endsAt } });
    });

    socket.on('participant-joined', (data) => {
      dispatch({ type: 'PARTICIPANT_JOINED', payload: data });
    });

    socket.on('participant-left', (data) => {
      dispatch({ type: 'PARTICIPANT_LEFT', payload: data });
    });

    socket.on('summary-generated', ({ text }) => {
      dispatch({ type: 'SUMMARY_GENERATED', payload: { text } });
    });

    return () => {
      socket.off('card-added');
      socket.off('card-voted');
      socket.off('card-unvoted');
      socket.off('cards-grouped');
      socket.off('card-ungrouped');
      socket.off('phase-changed');
      socket.off('participant-joined');
      socket.off('participant-left');
      socket.off('summary-generated');
    };
  }, [socket, dispatch]);

  if (!state.retro) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <p>Loading board...</p>
    </div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />
      {state.retro.phase_ends_at && <Timer />}
      <div style={{ display: 'flex', flex: 1 }}>
        <Column column="well" />
        <Column column="didnt" />
        <Column column="action" />
      </div>
      <Summary />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Board.jsx client/src/components/Column.jsx client/src/components/Card.jsx client/src/components/GroupBadge.jsx
git commit -m "feat: add Board, Column, Card, and GroupBadge components"
```

---

### Task 11: Header, Timer, Summary Components

**Files:**
- Create: `client/src/components/Header.jsx`
- Create: `client/src/components/Timer.jsx`
- Create: `client/src/components/Summary.jsx`

- [ ] **Step 1: Create Header component**

```jsx
// client/src/components/Header.jsx
import { useSocket } from '../context/SocketContext';
import { useRetro } from '../context/RetroContext';

const PHASE_LABELS = {
  waiting: 'Waiting to Start',
  adding: 'Adding Points',
  grouping: 'Grouping Duplicates',
  voting: 'Voting',
  discussion: 'Discussion',
};

export default function Header() {
  const socket = useSocket();
  const { state } = useRetro();
  const isFacilitator = state.participant?.is_facilitator;
  const phase = state.retro?.phase;
  const votesUsed = state.votes.filter(v => v.participant_id === state.participant?.id).length;
  const votesLeft = 3 - votesUsed;

  function handleStartAdding() {
    socket.emit('start-phase', { phase: 'adding' });
  }

  function handleEndPhase() {
    socket.emit('end-phase');
  }

  function handleStartVoting() {
    socket.emit('start-phase', { phase: 'voting' });
  }

  function handleGenerateSummary() {
    socket.emit('generate-summary');
  }

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-didnt)' }}>RetroBoard</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{state.retro?.title}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          background: 'var(--border)', padding: '4px 10px', borderRadius: 12,
          color: 'var(--text-secondary)', fontSize: 12,
        }}>
          {state.participants.length} participant{state.participants.length !== 1 ? 's' : ''}
        </span>
        <span style={{
          background: 'var(--border)', padding: '4px 10px', borderRadius: 12,
          color: 'var(--text-secondary)', fontSize: 12,
        }}>
          {PHASE_LABELS[phase] || phase}
        </span>
        {phase === 'voting' && (
          <span style={{
            background: 'var(--color-action)', padding: '4px 10px', borderRadius: 12,
            color: '#fff', fontSize: 12,
          }}>
            Votes left: {votesLeft}
          </span>
        )}
        {isFacilitator && phase === 'waiting' && (
          <button onClick={handleStartAdding} style={btnStyle}>Start Adding Points</button>
        )}
        {isFacilitator && phase === 'adding' && (
          <button onClick={handleEndPhase} style={btnStyle}>End Adding Phase</button>
        )}
        {isFacilitator && phase === 'grouping' && (
          <button onClick={handleStartVoting} style={btnStyle}>Start Voting</button>
        )}
        {isFacilitator && phase === 'voting' && (
          <button onClick={handleEndPhase} style={btnStyle}>End Voting</button>
        )}
        {isFacilitator && phase === 'discussion' && (
          <button onClick={handleGenerateSummary} style={btnStyle}>Generate Summary</button>
        )}
      </div>
    </div>
  );
}

const btnStyle = {
  background: 'var(--color-didnt)', padding: '4px 12px', borderRadius: 12,
  color: '#fff', fontSize: 12, border: 'none', cursor: 'pointer', fontWeight: 600,
};
```

- [ ] **Step 2: Create Timer component**

```jsx
// client/src/components/Timer.jsx
import { useState, useEffect } from 'react';
import { useRetro } from '../context/RetroContext';

export default function Timer() {
  const { state } = useRetro();
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!state.retro?.phase_ends_at) {
      setRemaining('');
      return;
    }

    function update() {
      const end = new Date(state.retro.phase_ends_at).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setRemaining(${mins}:);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [state.retro?.phase_ends_at]);

  if (!remaining) return null;

  return (
    <div style={{
      textAlign: 'center', padding: '8px 0', background: 'var(--bg-primary)',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ color: 'var(--color-didnt)', fontSize: 24, fontWeight: 700, fontFamily: 'monospace' }}>
        {remaining}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Create Summary component**

```jsx
// client/src/components/Summary.jsx
import { useState } from 'react';
import { useRetro } from '../context/RetroContext';

export default function Summary() {
  const { state } = useRetro();
  const [collapsed, setCollapsed] = useState(false);

  if (!state.summary && state.retro?.phase !== 'discussion') return null;

  return (
    <div style={{
      padding: '12px 20px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)',
    }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: collapsed ? 0 : 6 }}
      >
        <span style={{ color: 'var(--color-didnt)', fontSize: 12, fontWeight: 700 }}>AI Summary</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{collapsed ? '+ expand' : '- collapse'}</span>
      </div>
      {!collapsed && (
        state.summary
          ? <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5 }}>{state.summary}</p>
          : <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12, fontStyle: 'italic' }}>Click "Generate Summary" to create an AI summary.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Header.jsx client/src/components/Timer.jsx client/src/components/Summary.jsx
git commit -m "feat: add Header, Timer, and Summary components"
```

---

### Task 12: Integration Testing & Polish

**Files:**
- Modify: `client/src/context/RetroContext.jsx` (fix vote tracking for broadcasts)
- Modify: `client/src/components/Board.jsx` (fix vote event handling)

- [ ] **Step 1: Fix vote broadcast handling in Board.jsx**

The current Board.jsx dispatches vote events with a placeholder participant_id. Instead, refetch the full vote state from the server on vote events. Update Board.jsx socket listeners:

Replace the `card-voted` and `card-unvoted` listeners with:

```jsx
socket.on('card-voted', ({ cardId, voteCount }) => {
  dispatch({ type: 'SET_VOTE_COUNT', payload: { cardId, voteCount } });
});

socket.on('card-unvoted', ({ cardId, voteCount }) => {
  dispatch({ type: 'SET_VOTE_COUNT', payload: { cardId, voteCount } });
});
```

- [ ] **Step 2: Update RetroContext reducer to handle SET_VOTE_COUNT and track own votes**

Add a new `myVotes` field to track the current user's votes separately, and a `voteCounts` map for display:

Add to initialState:
```js
myVotes: [],      // array of card_ids the current user voted on
voteCounts: {},   // { cardId: count }
```

Add reducer cases:
```js
case 'SET_STATE': {
  const voteCounts = {};
  for (const v of action.payload.votes) {
    voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
  }
  const myVotes = action.payload.votes
    .filter(v => v.participant_id === state.participant?.id)
    .map(v => v.card_id);
  return {
    ...state,
    retro: action.payload.retro,
    participants: action.payload.participants,
    cards: action.payload.cards,
    votes: action.payload.votes,
    voteCounts,
    myVotes,
  };
}
case 'SET_VOTE_COUNT':
  return {
    ...state,
    voteCounts: { ...state.voteCounts, [action.payload.cardId]: action.payload.voteCount },
  };
case 'MY_VOTE_ADDED':
  return { ...state, myVotes: [...state.myVotes, action.payload.cardId] };
case 'MY_VOTE_REMOVED':
  return { ...state, myVotes: state.myVotes.filter(id => id !== action.payload.cardId) };
```

- [ ] **Step 3: Update Card.jsx to use voteCounts and myVotes**

Replace vote logic in Card.jsx:
```jsx
const voteCount = state.voteCounts[card.id] || 0;
const hasVoted = state.myVotes.includes(card.id);
const votesLeft = 3 - state.myVotes.length;

function handleVote() {
  if (state.retro?.phase !== 'voting') return;
  if (hasVoted) {
    socket.emit('unvote-card', { cardId: card.id });
    dispatch({ type: 'MY_VOTE_REMOVED', payload: { cardId: card.id } });
  } else {
    if (votesLeft <= 0) return;
    socket.emit('vote-card', { cardId: card.id });
    dispatch({ type: 'MY_VOTE_ADDED', payload: { cardId: card.id } });
  }
}
```

- [ ] **Step 4: Update Header.jsx votes left calculation**

```jsx
const votesLeft = 3 - state.myVotes.length;
```

- [ ] **Step 5: Run the full app end-to-end**

Run: `npm run build` then `npm run dev:server`
Open http://localhost:3001 in browser. Test:
1. Create a retro
2. Open the share link in a second browser tab
3. Join from both tabs
4. Start adding phase, add cards
5. End adding, group duplicates
6. Start voting, cast votes
7. End voting, generate summary

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: fix vote tracking and complete integration"
```

---

### Task 13: Final Cleanup & README

**Files:**
- Modify: `package.json` (verify scripts)

- [ ] **Step 1: Run all server tests**

Run: `cd server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Build client and verify**

Run: `cd client && npx vite build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit final state**

```bash
git add -A
git commit -m "chore: final cleanup and verify all tests pass"
```
