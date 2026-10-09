import { getAllLogs, getActiveProgram, programProgress, currentProgramWeek, todayPlan, getSession, DAY_LONG } from '../state.js';
import { currentStreak, monthStats, weeklyTotals, heatmapGrid, heatClass, computeRecords } from '../metrics.js';
import { relDate, escapeHtml } from '../utils/dates.js';
import { isSimple, metricsPreviewText } from './programs.js';

function workoutSummary(act){
  if(isSimple(act)) return metricsPreviewText(act.exercises[0].metrics);
  const n = act.exercises.length;
  return `${n} exercise${n===1?'':'s'}`;
}

function todayCardHtml(plan){
  if(plan.finished){
    return `<div class="card today-card"><div class="today-eyebrow mono">TODAY</div>
      <div class="today-rest">You've finished ${escapeHtml(plan.program.name)}.</div></div>`;
  }
  const { cur, today, items, next } = plan;
  const head = `<div class="today-eyebrow mono">TODAY · ${DAY_LONG[today].toUpperCase()}</div>
    <div class="today-sub mono">WEEK ${cur.weekNum} OF ${cur.totalWeeks} · ${escapeHtml(cur.phase.title.toUpperCase())}</div>`;
  const nextLine = next
    ? `<div class="today-next">Next: ${DAY_LONG[next.day]} · ${next.items.map(x=>escapeHtml(x.act.label)).join(', ')}</div>`
    : `<div class="today-next">Nothing else scheduled this week.</div>`;

  if(!items.length){
    return `<div class="card today-card">${head}<div class="today-rest">Rest day</div>${nextLine}</div>`;
  }
  const rows = items.map(({ act, key })=>{
    const done = !!getSession(plan.program.id, key)?.done;
    return `<div class="today-item${done?' is-done':''}">
      <div class="mini-check${done?' checked':''}" data-today-check="${key}" data-multi="${isSimple(act)?'':'1'}" role="checkbox" aria-checked="${done}" aria-label="${escapeHtml(act.label)} done" tabindex="0">${done?'✓':''}</div>
      <div class="today-item-text"><div class="today-item-name">${escapeHtml(act.label)}</div>
        <div class="today-item-meta mono">${workoutSummary(act)}</div></div>
    </div>`;
  }).join('');
  const allDone = items.every(({ key }) => getSession(plan.program.id, key)?.done);
  return `<div class="card today-card${allDone?' all-done':''}">${head}
    <div class="today-items">${rows}</div>
    <div class="today-actions">
      <button class="btn-ghost" data-open-today>${allDone ? 'View week' : 'Open workout'}</button>
      ${allDone ? '<span class="today-done mono">✓ DONE FOR TODAY</span>' : ''}
    </div>
    ${allDone ? nextLine : ''}
  </div>`;
}

export function logRowHtml(l, showDelete){
  const del = showDelete ? `<button class="del-btn" data-del="${l.id}" title="Delete entry">✕</button>` : `<span></span>`;
  return `
    <div class="log-row">
      <div>
        <div class="type">${escapeHtml(l.type)}${l.source==='manual'?'<span class="src">logged</span>':''}</div>
        ${l.note?`<div class="note">${escapeHtml(l.note)}</div>`:''}
      </div>
      <span class="when">${relDate(l.date)}</span>
      <span class="mins">${l.minutes}m</span>
      ${del}
    </div>`;
}

export function renderDashboard(){
  const logs=getAllLogs();
  const streak=currentStreak(logs);
  const mstats=monthStats(logs);
  const weeks10=weeklyTotals(logs,10);
  const maxWeek=Math.max(1,...weeks10.map(w=>w.total));
  const prevMonth = (()=>{ const d=new Date(); d.setMonth(d.getMonth()-1); return d; })();
  const prevYm = prevMonth.getFullYear()+'-'+String(prevMonth.getMonth()+1).padStart(2,'0');
  const prevMinutes = logs.filter(l=>l.date.startsWith(prevYm)).reduce((s,l)=>s+l.minutes,0);
  const trendPct = prevMinutes>0 ? Math.round(((mstats.minutes-prevMinutes)/prevMinutes)*100) : null;

  const bars = weeks10.map((w,i)=>{
    const h = Math.max(2, Math.round((w.total/maxWeek)*140));
    const isLast = i===weeks10.length-1;
    const cls = isLast ? 'now' : (w.total>0 ? 'hot' : '');
    const label = isLast && w.total>0 ? `<span class="barval">${w.total}</span>` : '';
    return `<div class="bar ${cls}" style="height:${h}px;">${label}</div>`;
  }).join('');

  const grid=heatmapGrid(logs,8);
  const heatRows = grid.map(row=>
    `<div class="heat-row">${row.map(c=>`<div class="heat-cell ${heatClass(c.count)}" title="${c.date}: ${c.count} session${c.count===1?'':'s'}"></div>`).join('')}</div>`
  ).join('');

  const activeProgram = getActiveProgram();
  const cur = activeProgram ? currentProgramWeek(activeProgram.id) : null;
  const progress = activeProgram ? programProgress(activeProgram.id) : { done:0, total:0 };
  const progPct = progress.total ? Math.round((progress.done/progress.total)*100) : 0;

  const recent = logs.slice(0,5);
  const recentHtml = recent.length ? recent.map(l=>logRowHtml(l,false)).join('') :
    `<div class="empty">No sessions logged yet — hit "Log session" to start your history.</div>`;

  const recs = computeRecords(logs);
  const plan = activeProgram ? todayPlan(activeProgram.id) : null;

  document.getElementById('view-dashboard').innerHTML = `
    <p class="mono" style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin:0 0 6px;">${new Date().toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})}</p>
    <h1 class="disp">DASHBOARD</h1>
    ${plan ? todayCardHtml(plan) : ''}

    <div class="card stats">
      <div class="stat">
        <div class="lbl">Streak</div>
        <div class="val" style="color:var(--volt);">${String(streak).padStart(2,'0')}</div>
        <div class="sub">days</div>
      </div>
      <div class="stat">
        <div class="lbl">Sessions / mo</div>
        <div class="val">${mstats.sessions}</div>
        <div class="sub">this calendar month</div>
      </div>
      <div class="stat">
        <div class="lbl">Time / mo</div>
        <div class="val">${Math.floor(mstats.minutes/60)}:${String(mstats.minutes%60).padStart(2,'0')}</div>
        <div class="sub">hrs:min</div>
      </div>
      <div class="stat">
        <div class="lbl">Trend</div>
        <div class="val" style="color:var(--cyan);">${trendPct===null?'—':(trendPct>=0?'+':'')+trendPct+'%'}</div>
        <div class="sub">vs last month</div>
      </div>
    </div>

    <div class="grid2">
      <div style="display:flex;flex-direction:column;gap:28px;">
        <div class="card chart-card">
          <div class="rowbetween" style="margin-bottom:22px;">
            <span class="mono" style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);">Minutes active / week</span>
            <span class="mono" style="font-size:11px;color:var(--muted);">10-week view</span>
          </div>
          <div class="chart-bars">${bars}</div>
        </div>

        <div class="card recent-card">
          <h2 class="mono recent-title">Recent activity</h2>
          ${recentHtml}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:28px;">
        <div class="card heat-card">
          <h2 class="mono" style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin:0 0 16px;">Consistency · 8wk</h2>
          <div class="heat-daylabels"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
          <div class="heat-rows">${heatRows}</div>
          <div class="heat-legend">
            <span class="mono" style="font-size:10px;color:var(--muted);">less</span>
            <div class="sw" style="background:var(--surface3);"></div>
            <div class="sw" style="background:rgba(200,255,91,0.28);"></div>
            <div class="sw" style="background:rgba(200,255,91,0.62);"></div>
            <div class="sw" style="background:var(--volt);"></div>
            <span class="mono" style="font-size:10px;color:var(--muted);">more</span>
          </div>
        </div>

        <div class="card program-card">
          <div class="mono" style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--volt);margin-bottom:8px;">Active program</div>
          ${activeProgram ? `
            <h2 class="disp" style="font-size:18px;margin:0 0 4px;">${escapeHtml(activeProgram.name.toUpperCase())}</h2>
            ${cur ? `
              <p class="mono" style="font-size:11px;color:var(--muted);margin:0 0 18px;">${escapeHtml(cur.phase.title.toUpperCase())} — WEEK ${cur.weekNum} OF ${cur.totalWeeks}</p>
              <div class="rowbetween" style="margin-bottom:8px;">
                <span class="mono" style="font-size:11px;">${progress.done} / ${progress.total} SESSIONS</span>
                <span class="mono" style="font-size:11px;color:var(--volt);">${progPct}%</span>
              </div>
              <div class="progress-track"><div class="progress-fill" style="width:${progPct}%;"></div></div>
            ` : `
              <p class="mono" style="font-size:11px;color:var(--volt);margin:0 0 8px;">PROGRAM COMPLETE</p>
              <div class="progress-track"><div class="progress-fill" style="width:100%;"></div></div>
            `}
          ` : `
            <p class="mono" style="font-size:11px;color:var(--muted);margin:0;">No active program — pick one from the Library tab.</p>
          `}
        </div>

        <div class="card" style="padding:22px 26px 8px;">
          <h2 class="mono" style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin:0 0 4px;">Bests</h2>
          <div class="rec-row"><span style="font-size:13px;">Longest session</span><span class="mono" style="font-size:15px;color:var(--volt);">${recs.longestSession}m</span></div>
          <div class="rec-row"><span style="font-size:13px;">Longest streak</span><span class="mono" style="font-size:15px;color:var(--volt);">${recs.longestStreak}d</span></div>
          <div class="rec-row" style="padding-bottom:18px;"><span style="font-size:13px;">Best week</span><span class="mono" style="font-size:15px;color:var(--volt);">${recs.bestWeek}m</span></div>
        </div>
      </div>
    </div>
  `;
}
