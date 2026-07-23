export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export type ReportView = {
  title: string; babyLine: string; generatedLine: string;
  foodsHeading: string; reactionsHeading: string; noneLabel: string;
  cols: { food: string; status: string; lastTried: string };
  rows: { food: string; status: string; lastTried: string }[];
  reactionRows: { food: string; date: string; severity: string; symptoms: string; note: string }[];
};

export function buildReportHtml(v: ReportView): string {
  const e = escapeHtml;
  const rows = v.rows.map((r) =>
    `<tr><td>${e(r.food)}</td><td>${e(r.status)}</td><td>${e(r.lastTried)}</td></tr>`).join('');
  const reactions = v.reactionRows.length === 0
    ? `<p>${e(v.noneLabel)}</p>`
    : `<ul>${v.reactionRows.map((r) =>
        `<li><strong>${e(r.food)}</strong> — ${e(r.date)} · ${e(r.severity)} · ${e(r.symptoms)}${r.note ? ` · ${e(r.note)}` : ''}</li>`,
      ).join('')}</ul>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, sans-serif; padding: 32px; color: #1c1c1e; }
    h1 { font-size: 22px; } h2 { font-size: 16px; margin-top: 24px; }
    p.meta { color: #6e6e73; font-size: 13px; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    ul { font-size: 13px; }
  </style></head><body>
    <h1>${e(v.title)}</h1>
    <p class="meta">${v.babyLine ? `${e(v.babyLine)}<br>` : ''}${e(v.generatedLine)}</p>
    <h2>${e(v.foodsHeading)}</h2>
    <table><tr><th>${e(v.cols.food)}</th><th>${e(v.cols.status)}</th><th>${e(v.cols.lastTried)}</th></tr>${rows}</table>
    <h2>${e(v.reactionsHeading)}</h2>
    ${reactions}
  </body></html>`;
}

export function buildBackup(
  data: { baby: unknown[]; foods: unknown[]; trials: unknown[]; reactions: unknown[] },
  exportedAt: Date,
): string {
  return JSON.stringify(
    { app: 'allergy-tracker', version: 1, exportedAt: exportedAt.toISOString(), ...data },
    null, 2,
  );
}
