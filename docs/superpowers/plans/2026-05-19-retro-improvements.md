# Retro Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auto-summary, facilitator auth, streamlined join, end-retro, exports, max participants, and logging to the RetroBoard app.

**Architecture:** Server-side changes to db.js, new handlers, new API routes. Client-side new pages (HomePage, FacilitatorLogin, FinalSummary) and modifications to existing components. Facilitator auth via password in .env validated server-side. Excel export via xlsx library. LLM-powered detailed summary export.

**Tech Stack:** Node.js/Express, Socket.IO, sql.js, React 18, Vite, Vitest, xlsx (SheetJS)

---

## File Map

### Server - New Files
- `server/handlers/facilitatorHandler.js` - facilitator login + token validation
- `server/handlers/exportHandler.js` - Excel and summary.md export endpoints
- `server/services/logger.js` - simple logging utility
- `server/tests/facilitatorHandler.test.js` - facilitator auth tests
- `server/tests/exportHandler.test.js` - export tests

### Server - Modified Files
- `server/db.js` - add max_participants column, getActiveRetro(), getAllRetros(), getSummaryForRetro()
- `server/handlers/retroHandler.js` - enforce single active retro, max participants, facilitator token on join
- `server/handlers/phaseHandler.js` - add 'ended' phase support
- `server/services/llmService.js` - add buildDetailedSummaryPrompt()
- `server/index.js` - new routes, debounced auto-summary, end-retro event, logging throughout
- `server/package.json` - add xlsx dependency
- `.env.example` - add FACILITATOR_PASSWORD

### Client - New Files
- `client/src/components/HomePage.jsx` - sprint list dashboard
- `client/src/components/FacilitatorLogin.jsx` - password login form
- `client/src/components/FinalSummary.jsx` - read-only ended retro view

### Client - Modified Files
- `client/src/App.jsx` - new routes
- `client/src/components/Board.jsx` - show Summary in all phases, listen for retro-ended
- `client/src/components/Header.jsx` - End Retro button, participant count with max, hide controls for non-facilitator
- `client/src/components/Summary.jsx` - update placeholder text
- `client/src/components/CreateRetro.jsx` - add max participants field (used inside HomePage for facilitators)
- `client/src/components/JoinForm.jsx` - pass facilitator token on join
- `client/src/context/RetroContext.jsx` - add RETRO_ENDED action

---

## Task 1: Server Logging Utility

**Files:**
- Create: `server/services/logger.js`

- [ ] **Step 1: Create logger.js**

```js
const PREFIX = '[RetroBoard]';

export function info(...args) {
  console.info(PREFIX, new Date().toISOString(), ...args);
}

export function error(...args) {
  console.error(PREFIX, 'ERROR', new Date().toISOString(), ...args);
}

export function warn(...args) {
  console.warn(PREFIX, 'WARN', new Date().toISOString(), ...args);
}
```

- [ ] **Step 2: Commit**

```bash
git add server/services/logger.js
git commit -m "feat: add server logging utility"
```

---

## Task 2: Database Schema Changes

**Files:**
- Modify: `server/db.js`
- Modify: `server/tests/db.test.js`

- [ ] **Step 1: Write failing tests for new DB functions**

Add to `server/tests/db.test.js`:

```js
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
} from '../db.js';
```

Add these test blocks at the end of the file:

```js
describe('Active retro', () => {
  it('should return the active retro (phase != ended)', () => {
    const r1 = createRetro(db, { title: 'Ended' });
    updateRetroPhase(db, r1.id, 'ended');
    const r2 = createRetro(db, { title: 'Active' });
    const active = getActiveRetro(db);
    expect(active.id).toBe(r2.id);
  });

  it('should return undefined when no active retro', () => {
    const r = createRetro(db, { title: 'Done' });
    updateRetroPhase(db, r.id, 'ended');
    expect(getActiveRetro(db)).toBeUndefined();
  });
});

describe('getAllRetros', () => {
  it('should return all retros ordered by created_at desc', () => {
    createRetro(db, { title: 'First' });
    createRetro(db, { title: 'Second' });
    const all = getAllRetros(db);
    expect(all.length).toBe(2);
    expect(all[0].title).toBe('Second');
  });
});

describe('getSummaryForRetro', () => {
  it('should return the latest summary for a retro', () => {
    const r = createRetro(db, { title: 'Sum Test' });
    saveSummary(db, { retroId: r.id, text: 'Old' });
    saveSummary(db, { retroId: r.id, text: 'New' });
    const s = getSummaryForRetro(db, r.id);
    expect(s.text).toBe('New');
  });

  it('should return undefined if no summary', () => {
    const r = createRetro(db, { title: 'No Sum' });
    expect(getSummaryForRetro(db, r.id)).toBeUndefined();
  });
});

describe('Max participants', () => {
  it('should store max_participants on retro', () => {
    const r = createRetro(db, { title: 'Max', maxParticipants: 5 });
    expect(r.max_participants).toBe(5);
  });

  it('should default max_participants to 10', () => {
    const r = createRetro(db, { title: 'Default Max' });
    expect(r.max_participants).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run`
Expected: FAIL - getActiveRetro, getAllRetros, getSummaryForRetro not found

- [ ] **Step 3: Update schema in db.js**

In the `CREATE TABLE IF NOT EXISTS retros` statement, add the max_participants column:

```sql
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
```

- [ ] **Step 4: Update createRetro to accept maxParticipants**

```js
export function createRetro(db, { title, addPointsDuration = 300, votingDuration = 120, maxParticipants = 10 }) {
  const id = uuidv4();
  const shareCode = generateShareCode();
  db.prepare(
    'INSERT INTO retros (id, title, share_code, add_points_duration, voting_duration, max_participants) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, title, shareCode, addPointsDuration, votingDuration, maxParticipants);
  return getRetro(db, id);
}
```

- [ ] **Step 5: Add new query functions to db.js**

```js
export function getActiveRetro(db) {
  return db.prepare("SELECT * FROM retros WHERE phase != 'ended' ORDER BY created_at DESC LIMIT 1").get();
}

export function getAllRetros(db) {
  return db.prepare('SELECT * FROM retros ORDER BY created_at DESC').all();
}

export function getSummaryForRetro(db, retroId) {
  return db.prepare('SELECT * FROM summaries WHERE retro_id = ? ORDER BY created_at DESC LIMIT 1').get(retroId);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add server/db.js server/tests/db.test.js
git commit -m "feat: add max_participants, getActiveRetro, getAllRetros, getSummaryForRetro"
```

---

## Task 3: Facilitator Authentication

**Files:**
- Create: `server/handlers/facilitatorHandler.js`
- Create: `server/tests/facilitatorHandler.test.js`

- [ ] **Step 1: Write failing tests**

Create `server/tests/facilitatorHandler.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateFacilitatorPassword, generateFacilitatorToken, verifyFacilitatorToken } from '../handlers/facilitatorHandler.js';

describe('facilitatorHandler', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, FACILITATOR_PASSWORD: 'secret123' };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('should return token for correct password', () => {
    const result = validateFacilitatorPassword('secret123');
    expect(result.token).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('should return error for wrong password', () => {
    const result = validateFacilitatorPassword('wrong');
    expect(result.error).toBe('Invalid password');
    expect(result.token).toBeUndefined();
  });

  it('should return error if no password configured', () => {
    delete process.env.FACILITATOR_PASSWORD;
    const result = validateFacilitatorPassword('anything');
    expect(result.error).toBe('Facilitator login not configured');
  });

  it('should verify a valid token', () => {
    const { token } = validateFacilitatorPassword('secret123');
    expect(verifyFacilitatorToken(token)).toBe(true);
  });

  it('should reject an invalid token', () => {
    expect(verifyFacilitatorToken('bogus')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/facilitatorHandler.test.js`
Expected: FAIL - module not found

- [ ] **Step 3: Implement facilitatorHandler.js**

Create `server/handlers/facilitatorHandler.js`:

```js
import { createHash, randomBytes } from 'crypto';

const TOKEN_SECRET = randomBytes(32).toString('hex');

export function validateFacilitatorPassword(password) {
  const configured = process.env.FACILITATOR_PASSWORD;
  if (!configured) {
    return { error: 'Facilitator login not configured' };
  }
  if (password !== configured) {
    return { error: 'Invalid password' };
  }
  const token = generateFacilitatorToken();
  return { token };
}

export function generateFacilitatorToken() {
  const payload = Date.now().toString() + TOKEN_SECRET;
  return createHash('sha256').update(payload).digest('hex');
}

const validTokens = new Set();

export function validateFacilitatorPassword(password) {
  const configured = process.env.FACILITATOR_PASSWORD;
  if (!configured) {
    return { error: 'Facilitator login not configured' };
  }
  if (password !== configured) {
    return { error: 'Invalid password' };
  }
  const token = randomBytes(32).toString('hex');
  validTokens.add(token);
  return { token };
}

export function verifyFacilitatorToken(token) {
  return validTokens.has(token);
}
```

Wait -- the above has a duplicate. The correct file is:

```js
import { randomBytes } from 'crypto';

const validTokens = new Set();

export function validateFacilitatorPassword(password) {
  const configured = process.env.FACILITATOR_PASSWORD;
  if (!configured) {
    return { error: 'Facilitator login not configured' };
  }
  if (password !== configured) {
    return { error: 'Invalid password' };
  }
  const token = randomBytes(32).toString('hex');
  validTokens.add(token);
  return { token };
}

export function verifyFacilitatorToken(token) {
  if (!token) return false;
  return validTokens.has(token);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/facilitatorHandler.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/handlers/facilitatorHandler.js server/tests/facilitatorHandler.test.js
git commit -m "feat: add facilitator password auth with token"
```

---

## Task 4: Phase Handler - Add 'ended' Phase

**Files:**
- Modify: `server/handlers/phaseHandler.js`
- Modify: `server/tests/phaseHandler.test.js`

- [ ] **Step 1: Write failing test**

Add to `server/tests/phaseHandler.test.js`:

```js
it('should end retro from discussion phase', () => {
  updateRetroPhase(db, retro.id, 'discussion', null);
  const result = handleEndRetro(db, { retroId: retro.id });
  expect(result.retro.phase).toBe('ended');
});

it('should end retro from any phase', () => {
  const result = handleEndRetro(db, { retroId: retro.id });
  expect(result.retro.phase).toBe('ended');
});
```

Update the import at the top of the test file:

```js
import { handleStartPhase, handleEndPhase, handleTimerExpired, handleEndRetro } from '../handlers/phaseHandler.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/phaseHandler.test.js`
Expected: FAIL - handleEndRetro is not a function

- [ ] **Step 3: Add handleEndRetro to phaseHandler.js**

Add to `server/handlers/phaseHandler.js`:

```js
export function handleEndRetro(db, { retroId }) {
  const updated = updateRetroPhase(db, retroId, 'ended', null);
  return { retro: updated };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/phaseHandler.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/handlers/phaseHandler.js server/tests/phaseHandler.test.js
git commit -m "feat: add handleEndRetro for ended phase"
```

---

## Task 5: Retro Handler - Enforce Single Active Retro and Max Participants

**Files:**
- Modify: `server/handlers/retroHandler.js`
- Modify: `server/tests/retroHandler.test.js`

- [ ] **Step 1: Write failing tests**

Replace `server/tests/retroHandler.test.js` entirely:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, updateRetroPhase, getParticipants } from '../db.js';
import { handleCreateRetro, handleJoinRetro, getRetroState } from '../handlers/retroHandler.js';

describe('retroHandler', () => {
  let db;

  beforeEach(async () => {
    db = await initDb();
  });

  it('should create a retro and return share code', () => {
    const result = handleCreateRetro(db, {
      title: 'Sprint 24',
      addPointsDuration: 600,
      votingDuration: 300,
      maxParticipants: 8,
    });
    expect(result.retro.title).toBe('Sprint 24');
    expect(result.retro.share_code).toBeTruthy();
    expect(result.retro.add_points_duration).toBe(600);
    expect(result.retro.voting_duration).toBe(300);
    expect(result.retro.max_participants).toBe(8);
  });

  it('should reject creating retro if one is already active', () => {
    handleCreateRetro(db, { title: 'Active' });
    const result = handleCreateRetro(db, { title: 'Another' });
    expect(result.error).toBe('An active retro already exists');
  });

  it('should allow creating retro after previous one ended', () => {
    const { retro } = handleCreateRetro(db, { title: 'First' });
    updateRetroPhase(db, retro.id, 'ended');
    const result = handleCreateRetro(db, { title: 'Second' });
    expect(result.retro.title).toBe('Second');
  });

  it('should join a retro with isFacilitator flag', () => {
    const { retro } = handleCreateRetro(db, { title: 'Test' });
    const result = handleJoinRetro(db, {
      shareCode: retro.share_code,
      displayName: 'Alice',
      socketId: 'sock1',
      isFacilitator: true,
    });
    expect(result.participant.display_name).toBe('Alice');
    expect(result.participant.is_facilitator).toBe(1);
  });

  it('should join as non-facilitator by default', () => {
    const { retro } = handleCreateRetro(db, { title: 'Test' });
    const result = handleJoinRetro(db, {
      shareCode: retro.share_code,
      displayName: 'Bob',
      socketId: 'sock2',
      isFacilitator: false,
    });
    expect(result.participant.is_facilitator).toBe(0);
  });

  it('should reject join when retro is full', () => {
    const { retro } = handleCreateRetro(db, { title: 'Small', maxParticipants: 2 });
    handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'A', socketId: 's1', isFacilitator: true });
    handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'B', socketId: 's2', isFacilitator: false });
    const result = handleJoinRetro(db, { shareCode: retro.share_code, displayName: 'C', socketId: 's3', isFacilitator: false });
    expect(result.error).toBe('Retro is full. Maximum participants reached.');
  });

  it('should return error for invalid share code', () => {
    const result = handleJoinRetro(db, {
      shareCode: 'invalid',
      displayName: 'Alice',
      socketId: 'sock1',
      isFacilitator: false,
    });
    expect(result.error).toBe('Retro not found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/retroHandler.test.js`
Expected: FAIL on single active retro and max participants tests

- [ ] **Step 3: Update retroHandler.js**

```js
import { createRetro, getRetroByShareCode, addParticipant, getParticipants, getCards, getVotesForRetro, getActiveRetro } from '../db.js';

export function handleCreateRetro(db, { title, addPointsDuration, votingDuration, maxParticipants }) {
  const active = getActiveRetro(db);
  if (active) {
    return { error: 'An active retro already exists' };
  }
  const retro = createRetro(db, { title, addPointsDuration, votingDuration, maxParticipants });
  return { retro };
}

export function handleJoinRetro(db, { shareCode, displayName, socketId, isFacilitator = false }) {
  const retro = getRetroByShareCode(db, shareCode);
  if (!retro) {
    return { error: 'Retro not found' };
  }
  const existingParticipants = getParticipants(db, retro.id);
  if (existingParticipants.length >= retro.max_participants) {
    return { error: 'Retro is full. Maximum participants reached.' };
  }
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/retroHandler.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/handlers/retroHandler.js server/tests/retroHandler.test.js
git commit -m "feat: enforce single active retro, max participants, explicit facilitator flag"
```

---

## Task 6: LLM Service - Detailed Summary Prompt

**Files:**
- Modify: `server/services/llmService.js`
- Modify: `server/tests/llmService.test.js`

- [ ] **Step 1: Write failing test**

Add to `server/tests/llmService.test.js`:

```js
import { buildPrompt, parseSummary, buildDetailedSummaryPrompt } from '../services/llmService.js';

describe('buildDetailedSummaryPrompt', () => {
  it('builds a detailed analysis prompt', () => {
    const cards = [
      { id: '1', column: 'well', text: 'Great teamwork', group_id: null },
      { id: '2', column: 'didnt', text: 'Too many meetings', group_id: null },
      { id: '3', column: 'action', text: 'Reduce meeting time', group_id: null },
    ];
    const votes = [{ card_id: '1' }, { card_id: '1' }, { card_id: '2' }];
    const title = 'Sprint 42 Retro';

    const prompt = buildDetailedSummaryPrompt(cards, votes, title);

    expect(prompt).toContain('Sprint 42 Retro');
    expect(prompt).toContain('Overview');
    expect(prompt).toContain('Key Themes');
    expect(prompt).toContain('Action Items');
    expect(prompt).toContain('Great teamwork (2 votes)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/llmService.test.js`
Expected: FAIL - buildDetailedSummaryPrompt not exported

- [ ] **Step 3: Implement buildDetailedSummaryPrompt**

Add to `server/services/llmService.js`:

```js
export function buildDetailedSummaryPrompt(cards, votes, title) {
  const parentCards = cards.filter(c => !c.group_id);
  const voteCounts = {};
  for (const v of votes) {
    voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
  }

  let cardSection = '';
  for (const [col, label] of Object.entries(COLUMN_LABELS)) {
    const colCards = parentCards.filter(c => c.column === col);
    cardSection += label + ':\n';
    if (colCards.length === 0) {
      cardSection += '- (none)\n';
    } else {
      for (const card of colCards) {
        const count = voteCounts[card.id] || 0;
        cardSection += '- ' + card.text + ' (' + count + ' votes)\n';
      }
    }
    cardSection += '\n';
  }

  return 'You are analyzing a sprint retrospective titled "' + title + '".\n\n' +
    'Here are all the cards from the retrospective:\n\n' +
    cardSection +
    'Generate a detailed markdown analysis with the following sections:\n' +
    '## Overview\nBrief description of what this retro covered.\n\n' +
    '## Key Themes\nIdentify patterns and recurring themes across all cards.\n\n' +
    '## Top Voted Items\nHighlight the highest-voted cards and explain their significance.\n\n' +
    '## Action Items\nList action items from the action column, prioritized by vote count.\n\n' +
    '## Trends & Observations\nCross-cutting insights and observations.\n\n' +
    '## Recommendations\nSuggested next steps based on the retrospective data.\n';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/llmService.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/llmService.js server/tests/llmService.test.js
git commit -m "feat: add buildDetailedSummaryPrompt for summary.md export"
```

---

## Task 7: Export Handlers

**Files:**
- Create: `server/handlers/exportHandler.js`
- Create: `server/tests/exportHandler.test.js`
- Modify: `server/package.json` - add xlsx dependency

- [ ] **Step 1: Install xlsx**

```bash
cd server && npm install xlsx
```

- [ ] **Step 2: Write failing tests**

Create `server/tests/exportHandler.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, createRetro, addParticipant, addCard, addVote, saveSummary, updateRetroPhase } from '../db.js';
import { buildExcelBuffer, buildDetailedSummary } from '../handlers/exportHandler.js';

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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/exportHandler.test.js`
Expected: FAIL - module not found

- [ ] **Step 4: Implement exportHandler.js**

Create `server/handlers/exportHandler.js`:

```js
import * as XLSX from 'xlsx';
import { getRetro, getCards, getParticipants, getVotesForRetro, getSummaryForRetro } from '../db.js';
import { buildDetailedSummaryPrompt, generateSummary } from '../services/llmService.js';

export function buildExcelBuffer(db, retroId) {
  const retro = getRetro(db, retroId);
  const cards = getCards(db, retroId);
  const participants = getParticipants(db, retroId);
  const votes = getVotesForRetro(db, retroId);
  const summary = getSummaryForRetro(db, retroId);

  const voteCounts = {};
  for (const v of votes) {
    voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
  }

  const participantMap = {};
  for (const p of participants) {
    participantMap[p.id] = p.display_name;
  }

  const cardMap = {};
  for (const c of cards) {
    cardMap[c.id] = c;
  }

  const cardsSheet = cards.map(c => ({
    Column: c.column,
    Text: c.text,
    Votes: voteCounts[c.id] || 0,
    Group: c.group_id ? (cardMap[c.group_id]?.text || '') : '',
  }));

  const participantsSheet = participants.map(p => ({
    'Display Name': p.display_name,
    'Is Facilitator': p.is_facilitator ? 'Yes' : 'No',
  }));

  const summarySheet = summary
    ? [{ Summary: summary.text, 'Generated At': summary.created_at }]
    : [{ Summary: '(none)', 'Generated At': '' }];

  const votesSheet = votes.map(v => ({
    'Card Text': cardMap[v.card_id]?.text || '',
    'Card Column': cardMap[v.card_id]?.column || '',
    'Voter': participantMap[v.participant_id] || '',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cardsSheet), 'Cards');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(participantsSheet), 'Participants');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(votesSheet), 'Votes');

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export async function buildDetailedSummaryMd(db, retroId) {
  const retro = getRetro(db, retroId);
  const cards = getCards(db, retroId);
  const votes = getVotesForRetro(db, retroId);
  const prompt = buildDetailedSummaryPrompt(cards, votes, retro.title);

  const gatewayUrl = process.env.LLM_GATEWAY_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!gatewayUrl || !apiKey) {
    throw new Error('LLM not configured');
  }

  const model = process.env.LLM_MODEL || 'quick-thinking';
  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
      'user-agent': 'KGPT-CLI/1.7.0',
      'x-continue-unique-id': '9152ffa0-1fc3-421b-9b2a-183c0cc27672',
      'x-user-email': 'akshay.kanere@kpit.com',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error('LLM Gateway error: ' + response.status);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || data.response || '';
  return '# ' + retro.title + ' - Retrospective Summary\n\n' + text.trim() + '\n';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/exportHandler.test.js`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add server/handlers/exportHandler.js server/tests/exportHandler.test.js server/package.json server/package-lock.json
git commit -m "feat: add Excel and summary.md export handlers"
```

---

## Task 8: Server index.js - API Routes, Auto-Summary, End-Retro, Logging

**Files:**
- Modify: `server/index.js`

This is the largest task. It wires together all the new handlers and adds debounced auto-summary.

- [ ] **Step 1: Update imports in index.js**

Replace the imports at the top of `server/index.js`:

```js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getParticipantBySocket, removeParticipantBySocket, getCards, getVotesForRetro, saveSummary, getParticipants, getRetro, getActiveRetro, getAllRetros, getSummaryForRetro } from './db.js';
import { handleCreateRetro, handleJoinRetro, getRetroState } from './handlers/retroHandler.js';
import { handleAddCard, handleGroupCards, handleUngroupCard } from './handlers/cardHandler.js';
import { handleVote, handleUnvote } from './handlers/voteHandler.js';
import { handleStartPhase, handleEndPhase, handleTimerExpired, handleEndRetro } from './handlers/phaseHandler.js';
import { generateSummary } from './services/llmService.js';
import { validateFacilitatorPassword, verifyFacilitatorToken } from './handlers/facilitatorHandler.js';
import { buildExcelBuffer, buildDetailedSummaryMd } from './handlers/exportHandler.js';
import * as log from './services/logger.js';
```

- [ ] **Step 2: Add REST API routes after app.use(express.json())**

```js
app.post('/api/facilitator/login', (req, res) => {
  const { password } = req.body;
  const result = validateFacilitatorPassword(password);
  if (result.error) {
    log.error('Facilitator login failed');
    return res.status(401).json({ error: result.error });
  }
  log.info('Facilitator logged in');
  res.json({ token: result.token });
});

app.get('/api/retros', (req, res) => {
  const retros = getAllRetros(db);
  res.json({ retros });
});

app.post('/api/retros', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!verifyFacilitatorToken(token)) {
    return res.status(403).json({ error: 'Facilitator authentication required' });
  }
  const { title, addPointsDuration, votingDuration, maxParticipants } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const result = handleCreateRetro(db, { title, addPointsDuration, votingDuration, maxParticipants });
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  log.info('Retro created:', result.retro.title);
  res.status(201).json(result);
});

app.get('/api/retros/:id/export/excel', (req, res) => {
  try {
    const buffer = buildExcelBuffer(db, req.params.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=retrospective.xlsx');
    res.send(buffer);
    log.info('Excel exported for retro', req.params.id);
  } catch (err) {
    log.error('Excel export failed:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

app.get('/api/retros/:id/export/summary', async (req, res) => {
  try {
    const md = await buildDetailedSummaryMd(db, req.params.id);
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', 'attachment; filename=summary.md');
    res.send(md);
    log.info('Summary.md exported for retro', req.params.id);
  } catch (err) {
    log.error('Summary export failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    llmConfigured: !!(process.env.LLM_GATEWAY_URL && process.env.LLM_API_KEY),
  });
});
```

- [ ] **Step 3: Add debounced auto-summary logic**

Add after the timers Map declaration:

```js
const summaryDebounceTimers = new Map();

async function triggerAutoSummary(retroId) {
  try {
    const cards = getCards(db, retroId);
    if (cards.length === 0) return;
    if (!process.env.LLM_GATEWAY_URL || !process.env.LLM_API_KEY) return;
    log.info('Auto-generating summary for retro', retroId);
    const votes = getVotesForRetro(db, retroId);
    const text = await generateSummary(cards, votes);
    const summary = saveSummary(db, { retroId, text });
    io.to(retroId).emit('summary-generated', { summary });
    log.info('Auto-summary generated for retro', retroId);
  } catch (err) {
    log.error('Auto-summary failed:', err.message);
  }
}

function debounceSummary(retroId) {
  const existing = summaryDebounceTimers.get(retroId);
  if (existing) clearTimeout(existing);
  const handle = setTimeout(() => {
    summaryDebounceTimers.delete(retroId);
    triggerAutoSummary(retroId);
  }, 5000);
  summaryDebounceTimers.set(retroId, handle);
}
```

- [ ] **Step 4: Update socket handlers**

Update the `add-card` handler to trigger debounced summary:

```js
socket.on('add-card', ({ column, text }, callback) => {
  const participant = getParticipantBySocket(db, socket.id);
  if (!participant) return;
  const retro = getRetro(db, participant.retro_id);
  if (retro.phase !== 'adding') {
    if (callback) callback({ error: 'Cards can only be added during the adding phase' });
    return;
  }
  const card = handleAddCard(db, { retroId: participant.retro_id, column, text });
  io.to(participant.retro_id).emit('card-added', { card });
  log.info('Card added in retro', participant.retro_id);
  debounceSummary(participant.retro_id);
  if (callback) callback({ card });
});
```

Update the `join-retro` handler to accept facilitator token:

```js
socket.on('join-retro', ({ shareCode, displayName, facilitatorToken }, callback) => {
  const isFacilitator = facilitatorToken ? verifyFacilitatorToken(facilitatorToken) : false;
  const result = handleJoinRetro(db, { shareCode, displayName, socketId: socket.id, isFacilitator });
  if (result.error) {
    if (callback) callback({ error: result.error });
    return;
  }
  const { retro, participant } = result;
  socket.join(retro.id);
  const state = getRetroState(db, retro.id);
  if (callback) callback({ participant, ...state });
  socket.to(retro.id).emit('participant-joined', { participant, participants: state.participants });
  log.info('Participant joined:', displayName, 'facilitator:', isFacilitator);
});
```

Add the `end-retro` handler:

```js
socket.on('end-retro', (_, callback) => {
  const participant = getParticipantBySocket(db, socket.id);
  if (!participant) return;
  if (!participant.is_facilitator) {
    if (callback) callback({ error: 'Only the facilitator can end the retro' });
    return;
  }
  clearTimer(participant.retro_id);
  const existing = summaryDebounceTimers.get(participant.retro_id);
  if (existing) clearTimeout(existing);
  summaryDebounceTimers.delete(participant.retro_id);
  const result = handleEndRetro(db, { retroId: participant.retro_id });
  io.to(participant.retro_id).emit('retro-ended', { retro: result.retro });
  log.info('Retro ended:', participant.retro_id);
  if (callback) callback({ retro: result.retro });
});
```

Update the `generate-summary` handler to remove phase restriction but keep facilitator-only:

```js
socket.on('generate-summary', async (_, callback) => {
  const participant = getParticipantBySocket(db, socket.id);
  if (!participant) return;
  if (!participant.is_facilitator) {
    if (callback) callback({ error: 'Only the facilitator can generate a summary' });
    return;
  }
  try {
    const cards = getCards(db, participant.retro_id);
    const votes = getVotesForRetro(db, participant.retro_id);
    log.info('Manual summary generation for retro', participant.retro_id);
    const text = await generateSummary(cards, votes);
    const summary = saveSummary(db, { retroId: participant.retro_id, text });
    io.to(participant.retro_id).emit('summary-generated', { summary });
    if (callback) callback({ summary });
  } catch (err) {
    log.error('Summary generation failed:', err.message);
    if (callback) callback({ error: err.message });
  }
});
```

Add logging to phase changes and disconnect:

```js
// In start-phase handler, after io.to emit:
log.info('Phase changed to', result.retro.phase, 'in retro', participant.retro_id);

// In end-phase handler, after io.to emit:
log.info('Phase ended in retro', participant.retro_id);

// In disconnect handler:
log.info('Participant disconnected:', participant?.display_name || socket.id);
```

Replace the server.listen line:

```js
server.listen(PORT, () => log.info('Server running on port', PORT));
```

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat: wire up API routes, auto-summary, end-retro, logging"
```

---

## Task 9: Client - RetroContext Updates

**Files:**
- Modify: `client/src/context/RetroContext.jsx`

- [ ] **Step 1: Add RETRO_ENDED action to reducer**

Add this case before the `default` case in `retroReducer`:

```js
case 'RETRO_ENDED':
  return {
    ...state,
    retro: { ...state.retro, phase: 'ended' },
  };
```

- [ ] **Step 2: Commit**

```bash
git add client/src/context/RetroContext.jsx
git commit -m "feat: add RETRO_ENDED reducer action"
```

---

## Task 10: Client - HomePage Component

**Files:**
- Create: `client/src/components/HomePage.jsx`

- [ ] **Step 1: Create HomePage.jsx**

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const styles = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    padding: '40px 24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    color: 'var(--color-well)',
    fontWeight: 700,
    fontSize: 24,
  },
  loginLink: {
    color: 'var(--color-action)',
    cursor: 'pointer',
    fontSize: 14,
    textDecoration: 'underline',
    background: 'none',
    border: 'none',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'var(--bg-secondary)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    color: 'var(--text-secondary)',
    fontSize: 12,
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border)',
  },
  td: {
    padding: '12px 16px',
    color: 'var(--text-primary)',
    fontSize: 14,
    borderBottom: '1px solid var(--border)',
  },
  btn: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    marginRight: 8,
  },
  joinBtn: {
    background: 'var(--color-well)',
    color: '#fff',
  },
  viewBtn: {
    background: 'var(--border)',
    color: 'var(--text-primary)',
  },
  createBtn: {
    padding: '10px 20px',
    background: 'var(--color-well)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  empty: {
    textAlign: 'center',
    color: 'var(--text-secondary)',
    padding: 40,
    fontSize: 14,
  },
};

export default function HomePage() {
  const navigate = useNavigate();
  const [retros, setRetros] = useState([]);
  const [llmConfigured, setLlmConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const isFacilitator = !!sessionStorage.getItem('facilitatorToken');

  useEffect(() => {
    Promise.all([
      fetch('/api/retros').then(r => r.json()),
      fetch('/api/config').then(r => r.json()),
    ]).then(([retrosData, configData]) => {
      setRetros(retrosData.retros || []);
      setLlmConfigured(configData.llmConfigured);
      setLoading(false);
    });
  }, []);

  const activeRetro = retros.find(r => r.phase !== 'ended');
  const endedRetros = retros.filter(r => r.phase === 'ended');

  function handleExportExcel(id) {
    window.open('/api/retros/' + id + '/export/excel', '_blank');
  }

  function handleExportSummary(id) {
    window.open('/api/retros/' + id + '/export/summary', '_blank');
  }

  if (loading) {
    return (
      <div style={{ ...styles.container, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.logo}>RetroBoard</span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {isFacilitator && !activeRetro && (
            <button style={styles.createBtn} onClick={() => navigate('/create')}>
              Create New Retro
            </button>
          )}
          {isFacilitator && activeRetro && (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Active retro exists</span>
          )}
          {!isFacilitator && (
            <button style={styles.loginLink} onClick={() => navigate('/facilitator')}>
              Facilitator Login
            </button>
          )}
          {isFacilitator && (
            <span style={{ color: 'var(--color-well)', fontSize: 12, fontWeight: 600 }}>Facilitator</span>
          )}
        </div>
      </div>

      {activeRetro && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--color-well)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--color-well)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>ACTIVE RETRO</div>
              <div style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 600 }}>{activeRetro.title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>Phase: {activeRetro.phase}</div>
            </div>
            <button
              style={{ ...styles.btn, ...styles.joinBtn, padding: '10px 24px', fontSize: 14 }}
              onClick={() => navigate('/retro/' + activeRetro.share_code)}
            >
              Join
            </button>
          </div>
        </div>
      )}

      <div style={{ color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>
        Past Retrospectives
      </div>

      {endedRetros.length === 0 ? (
        <div style={styles.empty}>No completed retrospectives yet.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Title</th>
              <th style={styles.th}>Date</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {endedRetros.map(r => (
              <tr key={r.id}>
                <td style={styles.td}>{r.title}</td>
                <td style={styles.td}>{new Date(r.created_at).toLocaleDateString()}</td>
                <td style={styles.td}>
                  <button style={{ ...styles.btn, ...styles.viewBtn }} onClick={() => navigate('/retro/' + r.share_code + '/summary')}>
                    View Summary
                  </button>
                  <button style={{ ...styles.btn, ...styles.viewBtn }} onClick={() => handleExportExcel(r.id)}>
                    Export Excel
                  </button>
                  {llmConfigured && (
                    <button style={{ ...styles.btn, ...styles.viewBtn }} onClick={() => handleExportSummary(r.id)}>
                      Export Summary.md
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/HomePage.jsx
git commit -m "feat: add HomePage with sprint list dashboard"
```

---

## Task 11: Client - FacilitatorLogin Component

**Files:**
- Create: `client/src/components/FacilitatorLogin.jsx`

- [ ] **Step 1: Create FacilitatorLogin.jsx**

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'var(--bg-primary)',
  },
  form: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 40,
    width: 400,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  title: {
    color: 'var(--text-primary)',
    fontSize: 22,
    fontWeight: 700,
    textAlign: 'center',
  },
  label: {
    color: 'var(--text-secondary)',
    fontSize: 13,
    marginBottom: 4,
    display: 'block',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
  },
  button: {
    padding: '12px 0',
    background: 'var(--color-well)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    color: 'var(--color-didnt)',
    fontSize: 13,
    textAlign: 'center',
  },
  backLink: {
    color: 'var(--text-secondary)',
    fontSize: 13,
    textAlign: 'center',
    cursor: 'pointer',
    textDecoration: 'underline',
    background: 'none',
    border: 'none',
  },
};

export default function FacilitatorLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) {
      setError('Password is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/facilitator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      sessionStorage.setItem('facilitatorToken', data.token);
      navigate('/');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <form style={styles.form} onSubmit={handleSubmit}>
        <div style={styles.title}>Facilitator Login</div>
        <div>
          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter facilitator password"
            autoFocus
          />
        </div>
        {error && <div style={styles.error}>{error}</div>}
        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
        <button type="button" style={styles.backLink} onClick={() => navigate('/')}>
          Back to Home
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/FacilitatorLogin.jsx
git commit -m "feat: add FacilitatorLogin component"
```

---

## Task 12: Client - CreateRetro Update (Max Participants)

**Files:**
- Modify: `client/src/components/CreateRetro.jsx`

- [ ] **Step 1: Add max participants field and facilitator token auth**

Update CreateRetro.jsx to:
- Add a maxParticipants state (default 10)
- Send facilitator token in Authorization header on POST
- Include maxParticipants in the POST body

Add state:
```js
const [maxParticipants, setMaxParticipants] = useState(10);
```

Update the fetch call:
```js
const res = await fetch('/api/retros', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + sessionStorage.getItem('facilitatorToken'),
  },
  body: JSON.stringify({
    title: title.trim(),
    addPointsDuration: Number(addMinutes) * 60,
    votingDuration: Number(voteMinutes) * 60,
    maxParticipants: Number(maxParticipants),
  }),
});
```

Add input field after voting timer:
```jsx
<div>
  <label style={styles.label}>Max Participants</label>
  <input
    style={styles.input}
    type="number"
    min={2}
    value={maxParticipants}
    onChange={(e) => setMaxParticipants(e.target.value)}
  />
</div>
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/CreateRetro.jsx
git commit -m "feat: add max participants to create retro form"
```

---

## Task 13: Client - FinalSummary Component

**Files:**
- Create: `client/src/components/FinalSummary.jsx`

- [ ] **Step 1: Create FinalSummary.jsx**

```jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const COLUMN_LABELS = {
  well: 'What Went Well',
  didnt: "What Didn't Go Well",
  action: 'Action Items',
};

const styles = {
  container: {
    minHeight: '100vh',
    background: 'var(--bg-primary)',
    padding: '40px 24px',
    maxWidth: 800,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    color: 'var(--text-primary)',
    fontSize: 24,
    fontWeight: 700,
  },
  badge: {
    background: 'var(--color-didnt)',
    color: '#fff',
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
  },
  section: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    color: 'var(--text-secondary)',
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: 600,
    marginBottom: 12,
  },
  summaryText: {
    color: 'var(--text-primary)',
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  card: {
    padding: '8px 12px',
    background: 'var(--bg-primary)',
    borderRadius: 6,
    marginBottom: 8,
    color: 'var(--text-primary)',
    fontSize: 13,
    display: 'flex',
    justifyContent: 'space-between',
  },
  backBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    padding: '8px 16px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
};

export default function FinalSummary() {
  const { shareCode } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/retros')
      .then(r => r.json())
      .then(({ retros }) => {
        const retro = retros.find(r => r.share_code === shareCode);
        if (!retro) return;
        return fetch('/api/retros/' + retro.id + '/state')
          .then(r => r.json())
          .then(state => setData({ retro, ...state }));
      })
      .finally(() => setLoading(false));
  }, [shareCode]);

  if (loading) {
    return <div style={{ ...styles.container, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  if (!data) {
    return <div style={{ ...styles.container, textAlign: 'center', color: 'var(--text-secondary)' }}>Retro not found.</div>;
  }

  const { retro, cards, votes, summary } = data;

  const voteCounts = {};
  for (const v of (votes || [])) {
    voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>{retro.title}</div>
          <span style={styles.badge}>ENDED</span>
        </div>
        <button style={styles.backBtn} onClick={() => navigate('/')}>Back to Home</button>
      </div>

      {summary && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>AI Summary</div>
          <div style={styles.summaryText}>{summary.text || summary}</div>
        </div>
      )}

      {Object.entries(COLUMN_LABELS).map(([col, label]) => {
        const colCards = (cards || []).filter(c => c.column === col && !c.group_id);
        return (
          <div key={col} style={styles.section}>
            <div style={styles.sectionTitle}>{label}</div>
            {colCards.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No cards</div>
            ) : (
              colCards.map(c => (
                <div key={c.id} style={styles.card}>
                  <span>{c.text}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{voteCounts[c.id] || 0} votes</span>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add GET /api/retros/:id/state endpoint to server/index.js**

This endpoint returns cards, votes, participants, and summary for a retro (read-only, for the final summary page):

```js
app.get('/api/retros/:id/state', (req, res) => {
  const retro = getRetro(db, req.params.id);
  if (!retro) return res.status(404).json({ error: 'Retro not found' });
  const cards = getCards(db, retro.id);
  const votes = getVotesForRetro(db, retro.id);
  const participants = getParticipants(db, retro.id);
  const summary = getSummaryForRetro(db, retro.id);
  res.json({ cards, votes, participants, summary });
});
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/FinalSummary.jsx server/index.js
git commit -m "feat: add FinalSummary page and /api/retros/:id/state endpoint"
```

---

## Task 14: Client - Update Board.jsx

**Files:**
- Modify: `client/src/components/Board.jsx`

- [ ] **Step 1: Show Summary in all phases and listen for retro-ended**

Update Board.jsx:

Add `useNavigate` import:
```js
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
```

Inside Board component, add:
```js
const navigate = useNavigate();
```

In the useEffect, add a handler for retro-ended:
```js
function onRetroEnded({ retro }) {
  dispatch({ type: 'RETRO_ENDED', payload: retro });
  navigate('/retro/' + state.retro?.share_code + '/summary');
}
```

Register and cleanup:
```js
socket.on('retro-ended', onRetroEnded);
// ...
socket.off('retro-ended', onRetroEnded);
```

Update the render to show Summary in all phases when cards exist:
```jsx
{state.cards.length > 0 && <Summary />}
```

(Replace `{state.retro.phase === 'discussion' && <Summary />}`)

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Board.jsx
git commit -m "feat: show summary in all phases, handle retro-ended redirect"
```

---

## Task 15: Client - Update Header.jsx

**Files:**
- Modify: `client/src/components/Header.jsx`

- [ ] **Step 1: Add End Retro button and participant count with max**

Update Header.jsx:

Add End Retro button (facilitator only, all phases):
```jsx
{isFacilitator && (
  <button
    style={{ ...btnStyle, background: 'var(--color-didnt)' }}
    onClick={() => {
      if (window.confirm('End this retrospective? This cannot be undone.')) {
        socket.emit('end-retro', {});
      }
    }}
  >
    End Retrospective
  </button>
)}
```

Update participant count display:
```jsx
<span>{participants.length}/{retro?.max_participants || '?'} participants</span>
```

The phase control buttons should already be facilitator-only (they check `isFacilitator`), which is correct.

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Header.jsx
git commit -m "feat: add End Retro button, show participant count with max"
```

---

## Task 16: Client - Update Summary.jsx

**Files:**
- Modify: `client/src/components/Summary.jsx`

- [ ] **Step 1: Update placeholder text**

Change the placeholder text from:
```
'Click "Generate Summary" to create an AI-powered summary of this retrospective.'
```
to:
```
'Summary will be generated automatically as cards are added...'
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Summary.jsx
git commit -m "feat: update summary placeholder text"
```

---

## Task 17: Client - Update JoinForm.jsx

**Files:**
- Modify: `client/src/components/JoinForm.jsx`

- [ ] **Step 1: Pass facilitator token on join**

Update the socket.emit call in handleSubmit to include the facilitator token:

```js
socket.emit('join-retro', {
  shareCode,
  displayName: displayName.trim(),
  facilitatorToken: sessionStorage.getItem('facilitatorToken') || null,
}, (response) => {
```

The rest of the callback stays the same.

- [ ] **Step 2: Commit**

```bash
git add client/src/components/JoinForm.jsx
git commit -m "feat: pass facilitator token on join"
```

---

## Task 18: Client - Update App.jsx Routes

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Update routes**

```jsx
import { Routes, Route } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import { RetroProvider } from './context/RetroContext';
import HomePage from './components/HomePage';
import CreateRetro from './components/CreateRetro';
import FacilitatorLogin from './components/FacilitatorLogin';
import JoinForm from './components/JoinForm';
import Board from './components/Board';
import FinalSummary from './components/FinalSummary';

export default function App() {
  return (
    <SocketProvider>
      <RetroProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreateRetro />} />
          <Route path="/facilitator" element={<FacilitatorLogin />} />
          <Route path="/retro/:shareCode" element={<JoinForm />} />
          <Route path="/retro/:shareCode/board" element={<Board />} />
          <Route path="/retro/:shareCode/summary" element={<FinalSummary />} />
        </Routes>
      </RetroProvider>
    </SocketProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: add new routes for home, facilitator login, final summary"
```

---

## Task 19: Update .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add FACILITATOR_PASSWORD**

```
LLM_GATEWAY_URL=https://llm-gateway-cv.ai-apps.kpit.com/v1/chat/completions
LLM_API_KEY=your-api-key-here
LLM_MODEL=quick-thinking
PORT=3001
FACILITATOR_PASSWORD=your-secret-password
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "feat: add FACILITATOR_PASSWORD to .env.example"
```

---

## Task 20: Run All Tests and Verify

- [ ] **Step 1: Run all server tests**

```bash
cd server && npx vitest run
```

Expected: ALL PASS

- [ ] **Step 2: Build client**

```bash
cd client && npx vite build
```

Expected: Build succeeds with no errors

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final fixes after full test run"
```

---
