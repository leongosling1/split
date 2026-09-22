import { getAllLogs } from '../state.js';
import { logRowHtml } from './dashboard.js';

export function renderHistory(){
  const logs=getAllLogs();
  const html = logs.length ? logs.map(l=>logRowHtml(l, l.source==='manual')).join('') :
    `<div class="empty">Nothing logged yet.</div>`;
  document.getElementById('view-history').innerHTML = `
    <h1 class="disp">HISTORY</h1>
    <p class="mono" style="font-size:11px;color:var(--muted);margin:6px 0 28px;">${logs.length} session${logs.length===1?'':'s'} logged, all-time</p>
    <div class="card" style="padding-top:4px;">${html}</div>
  `;
}
