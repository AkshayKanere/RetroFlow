import * as XLSX from 'xlsx';
import { getRetro, getCards, getParticipants, getVotesForRetro, getSummaryForRetro } from '../db.js';
import { buildDetailedSummaryPrompt, isLlmConfigured } from '../services/llmService.js';
import * as log from '../services/logger.js';

export function buildExcelBuffer(db, retroId) {
  log.debug('buildExcelBuffer: starting export for retro', retroId);
  const retro = getRetro(db, retroId);
  if (!retro) {
    throw new Error('Retro not found');
  }
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

  log.debug('buildExcelBuffer: export complete for retro', retroId);
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export async function buildDetailedSummaryMd(db, retroId) {
  log.debug('buildDetailedSummaryMd: starting for retro', retroId);
  const retro = getRetro(db, retroId);
  if (!retro) {
    throw new Error('Retro not found');
  }
  const cards = getCards(db, retroId);
  const votes = getVotesForRetro(db, retroId);
  const participants = getParticipants(db, retroId);
  const prompt = buildDetailedSummaryPrompt(cards, votes, retro.title, participants);

  if (!isLlmConfigured()) {
    log.debug('buildDetailedSummaryMd: LLM not configured, using fallback');
    const COLUMN_LABELS = { well: 'What Went Well', didnt: "What Didn't Go Well", action: 'Action Items' };
    const voteCounts = {};
    for (const v of votes) voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
    const parentCards = cards.filter(c => !c.group_id);
    let md = '# ' + retro.title + ' - Retrospective Summary\n\n';
    md += '> AI summary unavailable (LLM not configured)\n\n';
    md += '**Participants (' + participants.length + '):** ' + (participants.map(p => p.display_name).join(', ') || '(none)') + '\n\n';
    for (const [col, label] of Object.entries(COLUMN_LABELS)) {
      const colCards = parentCards.filter(c => c.column === col).sort((a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0));
      md += '## ' + label + '\n';
      if (colCards.length === 0) { md += '- (none)\n'; }
      else { for (const card of colCards) md += '- ' + card.text + ' (' + (voteCounts[card.id] || 0) + ' votes)\n'; }
      md += '\n';
    }
    return md;
  }

  const gatewayUrl = process.env.LLM_GATEWAY_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'quick-thinking';
  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
      'user-agent': process.env.LLM_USER_AGENT || 'RetroFlow/1.0.0',
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
  log.debug('buildDetailedSummaryMd: complete for retro', retroId);
  return '# ' + retro.title + ' - Retrospective Summary\n\n' + text.trim() + '\n';
}
