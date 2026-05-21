const COLUMN_LABELS = {
  well: 'What Went Well',
  didnt: "What Didn't Go Well",
  action: 'Action Items',
};

export function buildPrompt(cards, votes, participants = []) {
  const parentCards = cards.filter(c => !c.group_id);
  const voteCounts = {};
  for (const v of votes) {
    voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
  }

  let prompt = 'Summarize this sprint retrospective in exactly 2 sentences.\n\n';
  prompt += `Participants (${participants.length}): ${participants.map(p => p.display_name).join(', ') || '(unknown)'}\n\n`;
  for (const [col, label] of Object.entries(COLUMN_LABELS)) {
    const colCards = parentCards
      .filter(c => c.column === col)
      .sort((a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0));
    prompt += `${label}:\n`;
    if (colCards.length === 0) {
      prompt += '- (none)\n';
    } else {
      for (const card of colCards) {
        const count = voteCounts[card.id] || 0;
        prompt += `- ${card.text} (${count} votes)\n`;
      }
    }
    prompt += '\n';
  }
  return prompt;
}

export function parseSummary(responseText) {
  return responseText.trim();
}

export async function generateSummary(cards, votes, participants = []) {
  const prompt = buildPrompt(cards, votes, participants);
  const gatewayUrl = process.env.LLM_GATEWAY_URL;
  const apiKey = process.env.LLM_API_KEY;

  if (!gatewayUrl || !apiKey) {
    throw new Error('LLM_GATEWAY_URL and LLM_API_KEY environment variables are required');
  }

  const model = process.env.LLM_MODEL || 'quick-thinking';
  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'user-agent': 'KGPT-CLI/1.7.0',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM Gateway error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || data.response || '';
  return parseSummary(text);
}

async function callLLM(prompt) {
  const gatewayUrl = process.env.LLM_GATEWAY_URL;
  const apiKey = process.env.LLM_API_KEY;

  if (!gatewayUrl || !apiKey) {
    throw new Error('LLM_GATEWAY_URL and LLM_API_KEY environment variables are required');
  }

  const model = process.env.LLM_MODEL || 'quick-thinking';
  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'user-agent': 'KGPT-CLI/1.7.0',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM Gateway error: ${response.status}`);
  }

  const data = await response.json();
  return (data.choices?.[0]?.message?.content || data.response || '').trim();
}

export async function generateSectionSummary(cards, votes, column) {
  const label = COLUMN_LABELS[column] || column;
  const parentCards = cards.filter(c => !c.group_id);
  const voteCounts = {};
  for (const v of votes) {
    voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
  }

  const colCards = parentCards
    .filter(c => c.column === column)
    .sort((a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0));

  if (colCards.length === 0) {
    return `No cards in the "${label}" section.`;
  }

  let prompt = `Summarize the following "${label}" section of a sprint retrospective in exactly 1 sentence.\n\n`;
  for (const card of colCards) {
    const count = voteCounts[card.id] || 0;
    prompt += `- ${card.text} (${count} votes)\n`;
  }

  return callLLM(prompt);
}

export async function rephraseText(text) {
  const prompt = `Rephrase the following text for improved clarity and grammar. Return only the rephrased text, nothing else.\n\n${text}`;
  return callLLM(prompt);
}

export async function suggestGroupings(cards, column) {
  const parentCards = cards.filter(c => !c.group_id && c.column === column);

  if (parentCards.length < 2) {
    return [];
  }

  let prompt = 'Below are cards from a sprint retrospective section. Identify cards that are duplicates or very similar and should be grouped together.\n\n';
  for (const card of parentCards) {
    prompt += `- id: "${card.id}", text: "${card.text}"\n`;
  }
  prompt += '\nReturn a JSON array of suggested groups. Each group should have a parentCardId (the best representative card), childCardIds (array of card ids to merge into the parent), and reason (short explanation). Example format:\n';
  prompt += '[{"parentCardId":"id1","childCardIds":["id2","id3"],"reason":"Both discuss testing issues"}]\n';
  prompt += 'If no cards are similar enough to group, return an empty array []. Return ONLY valid JSON, nothing else.';

  try {
    const result = await callLLM(prompt);
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
}

export async function generateActionItems(cards, votes, participants = []) {
  const parentCards = cards.filter(c => !c.group_id);
  const voteCounts = {};
  for (const v of votes) {
    voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
  }

  let prompt = 'Based on the following sprint retrospective data, suggest 3-5 concrete action items as a numbered list.\n\n';
  prompt += `Participants (${participants.length}): ${participants.map(p => p.display_name).join(', ') || '(unknown)'}\n\n`;

  for (const [col, label] of Object.entries(COLUMN_LABELS)) {
    const colCards = parentCards
      .filter(c => c.column === col)
      .sort((a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0));
    prompt += `${label}:\n`;
    if (colCards.length === 0) {
      prompt += '- (none)\n';
    } else {
      for (const card of colCards) {
        const count = voteCounts[card.id] || 0;
        prompt += `- ${card.text} (${count} votes)\n`;
      }
    }
    prompt += '\n';
  }

  prompt += 'Focus on the highest-voted items and recurring themes. Each action item should be specific, actionable, and assignable.';

  return callLLM(prompt);
}

export function buildDetailedSummaryPrompt(cards, votes, title, participants = []) {
  const parentCards = cards.filter(c => !c.group_id);
  const voteCounts = {};
  for (const v of votes) {
    voteCounts[v.card_id] = (voteCounts[v.card_id] || 0) + 1;
  }

  let cardSection = '';
  for (const [col, label] of Object.entries(COLUMN_LABELS)) {
    const colCards = parentCards
      .filter(c => c.column === col)
      .sort((a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0));
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

  const participantSection = 'Participants (' + participants.length + '): ' +
    (participants.map(p => p.display_name).join(', ') || '(unknown)') + '\n\n';

  return 'You are analyzing a sprint retrospective titled "' + title + '".\n\n' +
    participantSection +
    'Here are all the cards from the retrospective (sorted by votes, highest first):\n\n' +
    cardSection +
    'Generate a detailed markdown analysis with the following sections:\n' +
    '## Overview\nBrief description of what this retro covered. Mention the number of participants and their names.\n\n' +
    '## Key Themes\nIdentify patterns and recurring themes across all cards.\n\n' +
    '## Top Voted Items\nHighlight the highest-voted cards and explain their significance.\n\n' +
    '## Action Items\nList action items from the action column, prioritized by vote count.\n\n' +
    '## Trends & Observations\nCross-cutting insights and observations.\n\n' +
    '## Recommendations\nSuggested next steps based on the retrospective data.\n';
}
