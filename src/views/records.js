import { getAllLogs } from '../state.js';
import { computeRecords } from '../metrics.js';

export function renderRecords(){
  const logs=getAllLogs();
  const recs=computeRecords(logs);
  const totalMinutes = logs.reduce((s,l)=>s+l.minutes,0);
  document.getElementById('view-records').innerHTML = `
    <h1 class="disp">RECORDS</h1>
    <div class="card" style="padding:22px 26px 8px;max-width:520px;margin-top:24px;">
      <div class="rec-row" style="padding-top:0;"><span style="font-size:14px;">Longest single session</span><span class="mono" style="font-size:18px;color:var(--volt);">${recs.longestSession} min</span></div>
      <div class="rec-row"><span style="font-size:14px;">Longest streak</span><span class="mono" style="font-size:18px;color:var(--volt);">${recs.longestStreak} days</span></div>
      <div class="rec-row"><span style="font-size:14px;">Best week</span><span class="mono" style="font-size:18px;color:var(--volt);">${recs.bestWeek} min</span></div>
      <div class="rec-row"><span style="font-size:14px;">Total sessions logged</span><span class="mono" style="font-size:18px;">${logs.length}</span></div>
      <div class="rec-row" style="padding-bottom:18px;"><span style="font-size:14px;">Total time, all-time</span><span class="mono" style="font-size:18px;">${Math.floor(totalMinutes/60)}h ${totalMinutes%60}m</span></div>
    </div>
  `;
}
