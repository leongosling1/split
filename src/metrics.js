import { isoDate, parseISO, mondayOf, todayISO } from './utils/dates.js';

/* A log's `minutes` is only meaningful when the activity tracked a
   "Minutes"-style metric — many activities (weight training, mobility
   work) won't. Streak/heatmap must not depend on minutes being > 0,
   or untimed activities would silently vanish from consistency views. */
export function extractMinutes(metrics){
  if(!metrics || !metrics.length) return 0;
  const m = metrics.find(m=>/min/i.test(m.name||''));
  if(!m) return 0;
  const n = parseFloat(m.value);
  return Number.isFinite(n) ? n : 0;
}

/* Sums "Minutes"-named metrics across every exercise in an activity.
   Prefers what was actually logged for that session (sessionValues,
   keyed by exercise index -> metric index) and falls back to the
   program's prescribed target value when nothing was logged. */
export function activityMinutes(exercises, sessionValues){
  let total = 0;
  (exercises||[]).forEach((ex,ei)=>{
    (ex.metrics||[]).forEach((m,mi)=>{
      if(!/min/i.test(m.name||'')) return;
      const actual = sessionValues?.[ei]?.[mi];
      const raw = (actual!==undefined && actual!=='') ? actual : m.value;
      const n = parseFloat(raw);
      if(Number.isFinite(n)) total += n;
    });
  });
  return total;
}

export function dailyTotals(logs){
  const m={};
  logs.forEach(l=>{ m[l.date]=(m[l.date]||0)+l.minutes; });
  return m;
}
export function dailyCounts(logs){
  const m={};
  logs.forEach(l=>{ m[l.date]=(m[l.date]||0)+1; });
  return m;
}
export function currentStreak(logs){
  const days = new Set(logs.map(l=>l.date));
  let d=new Date();
  if(!days.has(isoDate(d))) d.setDate(d.getDate()-1);
  let streak=0;
  while(days.has(isoDate(d))){ streak++; d.setDate(d.getDate()-1); }
  return streak;
}
export function longestStreakEver(logs){
  const dates=[...new Set(logs.map(l=>l.date))].sort();
  let longest=0,current=0,prev=null;
  dates.forEach(iso=>{
    const d=parseISO(iso);
    if(prev && (d-prev)/86400000===1) current++; else current=1;
    longest=Math.max(longest,current);
    prev=d;
  });
  return longest;
}
export function monthStats(logs){
  const now=new Date(); const ym=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const inMonth=logs.filter(l=>l.date.startsWith(ym));
  return { sessions:inMonth.length, minutes:inMonth.reduce((s,l)=>s+l.minutes,0) };
}
export function weeklyTotals(logs, weeks){
  const thisMonday=mondayOf(new Date());
  const buckets=[];
  for(let i=weeks-1;i>=0;i--){
    const start=new Date(thisMonday); start.setDate(start.getDate()-7*i);
    buckets.push({ start, iso:isoDate(start), total:0 });
  }
  logs.forEach(l=>{
    const wk=isoDate(mondayOf(parseISO(l.date)));
    const b=buckets.find(b=>b.iso===wk);
    if(b) b.total+=l.minutes;
  });
  return buckets;
}
export function heatmapGrid(logs, weeks){
  const counts=dailyCounts(logs);
  const thisMonday=mondayOf(new Date());
  const startMonday=new Date(thisMonday); startMonday.setDate(startMonday.getDate()-7*(weeks-1));
  const grid=[];
  for(let w=0; w<weeks; w++){
    const row=[];
    for(let d=0; d<7; d++){
      const dt=new Date(startMonday); dt.setDate(dt.getDate()+w*7+d);
      const iso=isoDate(dt);
      row.push({ date:iso, count: counts[iso]||0 });
    }
    grid.push(row);
  }
  return grid;
}
export function heatClass(count){
  if(count<=0) return '';
  if(count===1) return 'c1';
  if(count===2) return 'c2';
  return 'c3';
}
export function computeRecords(logs){
  const longestSession = logs.reduce((m,l)=>Math.max(m,l.minutes),0);
  const longestStreak = longestStreakEver(logs);
  const weeks = weeklyTotals(logs, 52);
  const bestWeek = weeks.reduce((m,w)=>Math.max(m,w.total),0);
  return { longestSession, longestStreak, bestWeek };
}
