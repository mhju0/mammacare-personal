import { buildBackup, buildReportHtml, escapeHtml, type ReportView } from './export';

const view: ReportView = {
  title: 'Food & Allergy Log',
  babyLine: 'Dana · born 2025-11-02',
  generatedLine: 'Generated 2026-07-16',
  foodsHeading: 'Foods tried',
  reactionsHeading: 'Reactions',
  noneLabel: 'None',
  cols: { food: 'Food', status: 'Status', lastTried: 'Last tried' },
  rows: [{ food: 'Egg', status: 'Reacted', lastTried: '2026-07-10' }],
  reactionRows: [{ food: 'Egg', date: '2026-07-10', severity: 'Moderate', symptoms: 'Hives, Rash', note: '' }],
};

describe('escapeHtml', () => {
  test('escapes the five specials', () => {
    expect(escapeHtml(`<b>&"'`)).toBe('&lt;b&gt;&amp;&quot;&#39;');
  });
});

describe('buildReportHtml', () => {
  test('contains all headings and row data', () => {
    const html = buildReportHtml(view);
    for (const s of ['Food &amp; Allergy Log', 'Dana', 'Egg', 'Reacted', 'Hives, Rash']) {
      expect(html).toContain(s);
    }
  });
  test('escapes malicious custom food names', () => {
    const html = buildReportHtml({
      ...view,
      rows: [{ food: '<script>x</script>', status: 'Safe', lastTried: '2026-07-01' }],
      reactionRows: [],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
  test('empty reactions render the none label', () => {
    expect(buildReportHtml({ ...view, reactionRows: [] })).toContain('None');
  });
  test('empty babyLine drops the line, not just its text', () => {
    const html = buildReportHtml({ ...view, babyLine: '' });
    expect(html).not.toContain('<br>'); // no orphan break before generatedLine
    expect(html).toContain('Generated 2026-07-16');
  });
});

describe('buildBackup', () => {
  test('versioned envelope with ISO timestamp', () => {
    const out = JSON.parse(buildBackup({ baby: [], foods: [{ id: 'rice' }], trials: [], reactions: [] },
      new Date('2026-07-16T00:00:00Z')));
    expect(out.app).toBe('allergy-tracker');
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe('2026-07-16T00:00:00.000Z');
    expect(out.foods).toEqual([{ id: 'rice' }]);
  });
});
