import { io } from '../../client/node_modules/socket.io-client/build/esm-debug/index.js';

const SERVER = 'http://localhost:3001';
const FACILITATOR_PASSWORD = 'kpit@111';
const NUM_USERS = 10;
const CARDS_PER_USER = 3;

const results = {
  steps: [],
  passed: 0,
  failed: 0,
};

function log(step, status, detail) {
  const icon = status === 'PASS' ? '[PASS]' : '[FAIL]';
  console.log(`${icon} ${step}: ${detail}`);
  results.steps.push({ step, status, detail });
  if (status === 'PASS') results.passed++;
  else results.failed++;
}

function connectSocket() {
  return new Promise((resolve) => {
    const socket = io(SERVER, { transports: ['websocket'] });
    socket.on('connect', () => resolve(socket));
  });
}

function emitAsync(socket, event, data) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout on ${event}`)), 10000);
    socket.emit(event, data, (response) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

function waitForEvent(socket, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const CARD_TEMPLATES = {
  well: [
    'Great collaboration between teams',
    'CI/CD pipeline improvements',
    'Code review quality increased',
    'Good sprint planning sessions',
    'Quick bug turnaround time',
    'Excellent documentation updates',
    'Pair programming was effective',
    'Deployment process smoother',
    'Team morale was high',
    'Testing coverage improved',
  ],
  didnt: [
    'Too many meetings disrupted flow',
    'Unclear requirements from PO',
    'Technical debt piling up',
    'Slow code review turnaround',
    'Build failures blocked progress',
    'Missing test environments',
    'Scope creep on stories',
    'Cross-team dependencies delayed us',
    'Poor estimation on complex tasks',
    'Knowledge silos remain',
  ],
  action: [
    'Schedule daily standups earlier',
    'Set up automated testing pipeline',
    'Create tech debt sprint backlog',
    'Establish code review SLA',
    'Improve monitoring dashboards',
    'Document architecture decisions',
    'Cross-train team members',
    'Add integration tests',
    'Review sprint capacity planning',
    'Set up feature flags system',
  ],
};

async function main() {
  console.log('\n====================================');
  console.log(' MULTI-USER E2E TEST (10 USERS)');
  console.log('====================================\n');

  // Step 1: Facilitator login via REST API
  let facilitatorToken;
  try {
    const res = await fetch(`${SERVER}/api/facilitator/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: FACILITATOR_PASSWORD }),
    });
    const data = await res.json();
    facilitatorToken = data.token;
    log('1. Facilitator Login', facilitatorToken ? 'PASS' : 'FAIL', facilitatorToken ? 'Token received' : 'No token');
  } catch (e) {
    log('1. Facilitator Login', 'FAIL', e.message);
    process.exit(1);
  }

  // Step 2: Create retro via REST API
  let retro;
  try {
    const res = await fetch(`${SERVER}/api/retros`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${facilitatorToken}`,
      },
      body: JSON.stringify({
        title: '10-User Stress Test Retro',
        addPointsDuration: 60,
        votingDuration: 60,
        maxParticipants: 15,
      }),
    });
    const data = await res.json();
    retro = data.retro;
    log('2. Create Retro', retro ? 'PASS' : 'FAIL', retro ? `ID: ${retro.id}, Code: ${retro.share_code}` : 'Failed');
  } catch (e) {
    log('2. Create Retro', 'FAIL', e.message);
    process.exit(1);
  }

  // Step 3: Connect 10 sockets
  const sockets = [];
  const participants = [];
  const userNames = Array.from({ length: NUM_USERS }, (_, i) => `User_${String(i + 1).padStart(2, '0')}`);

  for (let i = 0; i < NUM_USERS; i++) {
    try {
      const socket = await connectSocket();
      sockets.push(socket);
    } catch (e) {
      log(`3. Connect socket ${i + 1}`, 'FAIL', e.message);
    }
  }
  log('3. Connect 10 sockets', sockets.length === NUM_USERS ? 'PASS' : 'FAIL', `${sockets.length}/${NUM_USERS} connected`);

  // Step 4: Join retro with all 10 users (first one as facilitator)
  for (let i = 0; i < sockets.length; i++) {
    try {
      const joinData = {
        shareCode: retro.share_code,
        displayName: userNames[i],
        facilitatorToken: i === 0 ? facilitatorToken : undefined,
      };
      const response = await emitAsync(sockets[i], 'join-retro', joinData);
      if (response.error) throw new Error(response.error);
      participants.push(response.participant);
    } catch (e) {
      log(`4. Join user ${userNames[i]}`, 'FAIL', e.message);
    }
  }
  log('4. Join 10 users', participants.length === NUM_USERS ? 'PASS' : 'FAIL', `${participants.length}/${NUM_USERS} joined`);

  // Step 5: Verify participant count via API
  try {
    const res = await fetch(`${SERVER}/api/retros/${retro.id}/state`);
    const state = await res.json();
    log('5. Verify participants', state.participants.length === NUM_USERS ? 'PASS' : 'FAIL', `${state.participants.length} participants in retro`);
  } catch (e) {
    log('5. Verify participants', 'FAIL', e.message);
  }

  // Step 6: Facilitator starts Adding phase
  try {
    const response = await emitAsync(sockets[0], 'start-phase', { phase: 'adding' });
    if (response.error) throw new Error(response.error);
    log('6. Start Adding Phase', response.retro.phase === 'adding' ? 'PASS' : 'FAIL', `Phase: ${response.retro.phase}`);
  } catch (e) {
    log('6. Start Adding Phase', 'FAIL', e.message);
  }

  // Step 7: ALL 10 users add 3 cards each (1 per column) = 30 cards total
  const allCards = [];
  let addSuccess = 0;
  let addFail = 0;

  const columns = ['well', 'didnt', 'action'];
  const addPromises = [];

  for (let i = 0; i < sockets.length; i++) {
    for (let j = 0; j < CARDS_PER_USER; j++) {
      const col = columns[j];
      const text = CARD_TEMPLATES[col][i];
      addPromises.push(
        emitAsync(sockets[i], 'add-card', { column: col, text })
          .then((res) => {
            if (res.error) { addFail++; return; }
            allCards.push(res.card);
            addSuccess++;
          })
          .catch(() => addFail++)
      );
    }
  }
  await Promise.all(addPromises);

  const expectedCards = NUM_USERS * CARDS_PER_USER;
  log('7. All users add cards', addSuccess === expectedCards ? 'PASS' : 'FAIL', `${addSuccess}/${expectedCards} cards added (${addFail} failed)`);

  // Step 8: Verify card counts per column
  try {
    const res = await fetch(`${SERVER}/api/retros/${retro.id}/state`);
    const state = await res.json();
    const wellCount = state.cards.filter(c => c.column === 'well').length;
    const didntCount = state.cards.filter(c => c.column === 'didnt').length;
    const actionCount = state.cards.filter(c => c.column === 'action').length;
    const totalCards = state.cards.length;
    const allColumnsCorrect = wellCount === NUM_USERS && didntCount === NUM_USERS && actionCount === NUM_USERS;
    log('8. Card distribution', allColumnsCorrect ? 'PASS' : 'FAIL', `Total: ${totalCards}, Well: ${wellCount}, Didnt: ${didntCount}, Action: ${actionCount}`);
  } catch (e) {
    log('8. Card distribution', 'FAIL', e.message);
  }

  // Step 9: Wait for auto-summary (5s debounce + 2s buffer)
  console.log('\n  Waiting 10s for auto-summary generation...');
  await sleep(10000);

  try {
    const res = await fetch(`${SERVER}/api/retros/${retro.id}/state`);
    const state = await res.json();
    const hasSummary = state.summary && state.summary.length > 0;
    log('9. Auto-summary generated', hasSummary ? 'PASS' : 'FAIL', hasSummary ? `Summary: "${state.summary.substring(0, 80)}..."` : 'No summary');
  } catch (e) {
    log('9. Auto-summary generated', 'FAIL', e.message);
  }

  // Step 10: Facilitator ends Adding phase -> Grouping
  try {
    const response = await emitAsync(sockets[0], 'end-phase', {});
    if (response.error) throw new Error(response.error);
    log('10. End Adding -> Grouping', response.retro.phase === 'grouping' ? 'PASS' : 'FAIL', `Phase: ${response.retro.phase}`);
  } catch (e) {
    log('10. End Adding -> Grouping', 'FAIL', e.message);
  }

  // Step 11: Facilitator groups some duplicate cards
  try {
    const res = await fetch(`${SERVER}/api/retros/${retro.id}/state`);
    const state = await res.json();
    const wellCards = state.cards.filter(c => c.column === 'well' && !c.group_id);

    if (wellCards.length >= 2) {
      const groupResp = await emitAsync(sockets[0], 'group-cards', {
        parentCardId: wellCards[0].id,
        childCardId: wellCards[1].id,
      });
      if (groupResp.error) throw new Error(groupResp.error);
      const grouped = groupResp.cards.filter(c => c.group_id);
      log('11. Group cards', grouped.length > 0 ? 'PASS' : 'FAIL', `Grouped ${grouped.length} card(s) under parent`);
    } else {
      log('11. Group cards', 'FAIL', 'Not enough cards to group');
    }
  } catch (e) {
    log('11. Group cards', 'FAIL', e.message);
  }

  // Step 12: Facilitator starts Voting phase
  try {
    const response = await emitAsync(sockets[0], 'start-phase', { phase: 'voting' });
    if (response.error) throw new Error(response.error);
    log('12. Start Voting Phase', response.retro.phase === 'voting' ? 'PASS' : 'FAIL', `Phase: ${response.retro.phase}`);
  } catch (e) {
    log('12. Start Voting Phase', 'FAIL', e.message);
  }

  // Step 13: ALL 10 users vote on 3 cards each (30 votes total)
  let voteSuccess = 0;
  let voteFail = 0;
  let voteDuplicate = 0;

  const stateRes = await fetch(`${SERVER}/api/retros/${retro.id}/state`);
  const stateForVoting = await stateRes.json();
  const votableCards = stateForVoting.cards.filter(c => !c.group_id);

  const votePromises = [];
  for (let i = 0; i < sockets.length; i++) {
    const userVoteCards = [];
    for (let v = 0; v < 3; v++) {
      const cardIndex = (i * 3 + v) % votableCards.length;
      const card = votableCards[cardIndex];
      if (userVoteCards.includes(card.id)) {
        const altIndex = (cardIndex + 1) % votableCards.length;
        userVoteCards.push(votableCards[altIndex].id);
        votePromises.push(
          emitAsync(sockets[i], 'vote-card', { cardId: votableCards[altIndex].id })
            .then(res => { if (res.error) { voteFail++; } else { voteSuccess++; } })
            .catch(() => voteFail++)
        );
      } else {
        userVoteCards.push(card.id);
        votePromises.push(
          emitAsync(sockets[i], 'vote-card', { cardId: card.id })
            .then(res => { if (res.error) { voteFail++; } else { voteSuccess++; } })
            .catch(() => voteFail++)
        );
      }
    }
  }

  await Promise.all(votePromises);
  const totalVoteAttempts = NUM_USERS * 3;
  log('13. All users vote (3 each)', voteSuccess === totalVoteAttempts ? 'PASS' : 'FAIL', `${voteSuccess}/${totalVoteAttempts} votes cast (${voteFail} rejected)`);

  // Step 14: Verify vote counts via API
  try {
    const res = await fetch(`${SERVER}/api/retros/${retro.id}/state`);
    const state = await res.json();
    const totalVotes = state.votes.length;
    log('14. Verify total votes', totalVotes === voteSuccess ? 'PASS' : 'FAIL', `${totalVotes} votes in DB (expected ${voteSuccess})`);
  } catch (e) {
    log('14. Verify total votes', 'FAIL', e.message);
  }

  // Step 15: Some users try to vote a 4th time (should be rejected)
  let extraVoteRejected = 0;
  for (let i = 0; i < 3; i++) {
    try {
      const card = votableCards[(i * 7) % votableCards.length];
      const res = await emitAsync(sockets[i], 'vote-card', { cardId: card.id });
      if (res.error) extraVoteRejected++;
    } catch (e) {
      extraVoteRejected++;
    }
  }
  log('15. Reject 4th vote', extraVoteRejected === 3 ? 'PASS' : 'FAIL', `${extraVoteRejected}/3 extra votes correctly rejected`);

  // Step 16: Users unvote and re-vote
  let unvoteSuccess = 0;
  let revoteSuccess = 0;
  for (let i = 0; i < 3; i++) {
    try {
      const userVotes = (await fetch(`${SERVER}/api/retros/${retro.id}/state`).then(r => r.json())).votes;
      const myVote = userVotes.find(v => v.participant_id === participants[i].id);
      if (myVote) {
        const unRes = await emitAsync(sockets[i], 'unvote-card', { cardId: myVote.card_id });
        if (!unRes.error) unvoteSuccess++;
        const newCard = votableCards[(i + 5) % votableCards.length];
        const reRes = await emitAsync(sockets[i], 'vote-card', { cardId: newCard.id });
        if (!reRes.error) revoteSuccess++;
      }
    } catch (e) {}
  }
  log('16. Unvote + re-vote', (unvoteSuccess >= 2 && revoteSuccess >= 2) ? 'PASS' : 'FAIL', `${unvoteSuccess} unvotes, ${revoteSuccess} re-votes`);

  // Step 17: Facilitator ends Voting -> Discussion
  try {
    const response = await emitAsync(sockets[0], 'end-phase', {});
    if (response.error) throw new Error(response.error);
    log('17. End Voting -> Discussion', response.retro.phase === 'discussion' ? 'PASS' : 'FAIL', `Phase: ${response.retro.phase}`);
  } catch (e) {
    log('17. End Voting -> Discussion', 'FAIL', e.message);
  }

  // Step 18: Facilitator generates manual summary
  try {
    const summaryPromise = emitAsync(sockets[0], 'generate-summary', {});
    const response = await summaryPromise;
    if (response.error) throw new Error(response.error);
    const hasSummary = response.summary && response.summary.length > 10;
    log('18. Generate Summary', hasSummary ? 'PASS' : 'FAIL', hasSummary ? `Summary: "${String(response.summary).substring(0, 80)}..."` : 'No summary text');
  } catch (e) {
    log('18. Generate Summary', 'FAIL', e.message);
  }

  // Step 19: Facilitator ends retro
  try {
    const response = await emitAsync(sockets[0], 'end-retro', {});
    if (response.error) throw new Error(response.error);
    log('19. End Retro', response.retro.phase === 'ended' ? 'PASS' : 'FAIL', `Phase: ${response.retro.phase}`);
  } catch (e) {
    log('19. End Retro', 'FAIL', e.message);
  }

  // Step 20: Verify final state via API
  try {
    const res = await fetch(`${SERVER}/api/retros/${retro.id}/state`);
    const state = await res.json();
    const finalCards = state.cards.length;
    const finalVotes = state.votes.length;
    const finalParticipants = state.participants.length;
    const hasFinalSummary = state.summary && state.summary.length > 0;
    const allGood = finalCards >= 28 && finalVotes >= 25 && finalParticipants >= 9 && hasFinalSummary;
    log('20. Final state verification', allGood ? 'PASS' : 'FAIL',
      `Cards: ${finalCards}, Votes: ${finalVotes}, Participants: ${finalParticipants}, Summary: ${hasFinalSummary ? 'yes' : 'no'}`);
  } catch (e) {
    log('20. Final state verification', 'FAIL', e.message);
  }

  // Step 21: Test Excel export of the multi-user retro
  try {
    const res = await fetch(`${SERVER}/api/retros/${retro.id}/export/excel`);
    log('21. Excel export', res.status === 200 ? 'PASS' : 'FAIL', `Status: ${res.status}, Size: ${res.headers.get('content-length')} bytes`);
  } catch (e) {
    log('21. Excel export', 'FAIL', e.message);
  }

  // Step 22: Test Summary.md export
  try {
    const res = await fetch(`${SERVER}/api/retros/${retro.id}/export/summary`);
    if (res.status === 200) {
      const text = await res.text();
      log('22. Summary.md export', text.length > 50 ? 'PASS' : 'FAIL', `Status: 200, Length: ${text.length} chars`);
    } else {
      const err = await res.text();
      log('22. Summary.md export', 'FAIL', `Status: ${res.status}, Error: ${err}`);
    }
  } catch (e) {
    log('22. Summary.md export', 'FAIL', e.message);
  }

  // Disconnect all sockets
  for (const s of sockets) {
    s.disconnect();
  }

  // Print summary
  console.log('\n====================================');
  console.log(' TEST RESULTS');
  console.log('====================================');
  console.log(`Total: ${results.passed + results.failed} | Passed: ${results.passed} | Failed: ${results.failed}`);
  console.log('====================================\n');

  if (results.failed > 0) {
    console.log('FAILED TESTS:');
    for (const s of results.steps) {
      if (s.status === 'FAIL') {
        console.log(`  - ${s.step}: ${s.detail}`);
      }
    }
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Test script crashed:', e);
  process.exit(1);
});
