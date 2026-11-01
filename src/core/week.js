// Dates and the fancy-day nudge. Dates are local 'YYYY-MM-DD' strings.

export function isoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// 1 = Monday … 7 = Sunday
export const weekday = (s) => ((parse(s).getDay() + 6) % 7) + 1;
export const isWeekend = (s) => weekday(s) >= 6;

export function weekDates(s) {
  const d = parse(s);
  d.setDate(d.getDate() - (weekday(s) - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return isoDate(x);
  });
}

// What you wore each weekday this week, by mode. Last log of a day wins.
export function weekModes(wears, today) {
  const days = weekDates(today).slice(0, 5);
  return days.map((date) => {
    const logs = wears.filter((w) => w.date === date);
    return { date, mode: logs.length ? logs[logs.length - 1].mode : null };
  });
}

// You like 2–3 fancy weekdays. Returns a nudge string or null.
export function fancyNudge(wears, today, chosen) {
  if (isWeekend(today)) return null;
  const week = weekModes(wears, today);
  const before = week.filter((d) => d.date < today);
  const fancy = before.filter((d) => d.mode === 'fancy').length;
  const left = 5 - before.length; // including today
  if (chosen === 'fancy') {
    if (fancy >= 3) return 'That would be a fourth fancy day this week.';
    return null;
  }
  // Nudge a day before it becomes impossible to reach two, not on the last chance.
  if (fancy < 2 && fancy + left <= 3) {
    return fancy === 0
      ? 'No fancy days yet this week. Today would be a good one.'
      : 'Only one fancy day so far. Today would make two.';
  }
  return null;
}
