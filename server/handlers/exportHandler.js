import * as XLSX from 'xlsx';
import { getRetro, getCards, getParticipants, getVotesForRetro, getSummaryForRetro } from '../db.js';
import { buildDetailedSummaryPrompt } from '../services/llmService.js';

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
