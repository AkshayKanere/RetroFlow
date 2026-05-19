import { describe, it, expect } from 'vitest';
import { buildPrompt, parseSummary } from '../services/llmService.js';

describe('buildPrompt', () => {
  it('builds correct prompt from cards and votes', () => {
    const cards = [
      { id: '1', column: 'well', text: 'Great teamwork', group_id: null },
      { id: '2', column: 'didnt', text: 'Too many meetings', group_id: null },
      { id: '3', column: 'action', text: 'Reduce meeting time', group_id: null },
    ];
    const votes = [
      { card_id: '1' },
      { card_id: '1' },
      { card_id: '2' },
    ];

    const prompt = buildPrompt(cards, votes);

    expect(prompt).toContain('exactly 2 sentences');
    expect(prompt).toContain('What Went Well');
    expect(prompt).toContain("What Didn't Go Well");
    expect(prompt).toContain('Action Items');
    expect(prompt).toContain('Great teamwork (2 votes)');
    expect(prompt).toContain('Too many meetings (1 votes)');
    expect(prompt).toContain('Reduce meeting time (0 votes)');
  });

  it('excludes grouped child cards', () => {
    const cards = [
      { id: '1', column: 'well', text: 'Parent card', group_id: null },
      { id: '2', column: 'well', text: 'Child card', group_id: '1' },
    ];
    const votes = [];

    const prompt = buildPrompt(cards, votes);

    expect(prompt).toContain('Parent card');
    expect(prompt).not.toContain('Child card');
  });

  it('shows (none) for empty columns', () => {
    const cards = [];
    const votes = [];

    const prompt = buildPrompt(cards, votes);

    expect(prompt).toContain('What Went Well:\n- (none)');
    expect(prompt).toContain("What Didn't Go Well:\n- (none)");
    expect(prompt).toContain('Action Items:\n- (none)');
  });
});

describe('parseSummary', () => {
  it('trims whitespace from response text', () => {
    expect(parseSummary('  hello world  ')).toBe('hello world');
    expect(parseSummary('\n\nsome summary\n\n')).toBe('some summary');
  });
});
