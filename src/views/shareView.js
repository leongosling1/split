import { fetchShare, shareUrl } from '../sharing.js';
import { addProgram, setActiveProgram, queueSave, getCurrentUserId } from '../state.js';
import { signInWithGitHub } from '../auth.js';
import { escapeHtml, relDate } from '../utils/dates.js';

const PENDING_KEY = 'split-pending-share';

export function stashPendingShare(id){ sessionStorage.setItem(PENDING_KEY, id); }
export function takePendingShare(){
  const id = sessionStorage.getItem(PENDING_KEY);
  if(id) sessionStorage.removeItem(PENDING_KEY);
  return id;
}

function backLinkHtml(){
  return `<a href="${escapeHtml(location.pathname)}" class="mono" style="font-size:11px;align-self:flex-start;">← Back to SPLIT</a>`;
}

export async function renderShareGate(id, { onImported } = {}){
  const card = document.getElementById('share-card');
  card.innerHTML = `<span class="disp gate-brand">SPLIT</span><p class="gate-sub">Loading shared link…</p>`;

  const share = await fetchShare(id);
  if(!share){
    card.innerHTML = `
      ${backLinkHtml()}
      <span class="disp gate-brand">SPLIT</span>
      <h1>Link not found</h1>
      <p>This share link is invalid, was deleted, or never existed.</p>`;
    return;
  }

  if(share.kind==='program') renderProgramImport(card, share, onImported);
  else renderProgressReport(card, share);
}

function renderProgramImport(card, share, onImported){
  const p = share.payload;
  const weeks = p.phases.reduce((s,ph)=>s+ph.weeks.length,0);
  const signedIn = !!getCurrentUserId();

  card.innerHTML = `
    ${backLinkHtml()}
    <span class="disp gate-brand">SPLIT</span>
    <p class="gate-sub">${escapeHtml(share.created_by_name||'Someone')} shared a program with you</p>
    <h1 class="disp" style="font-size:20px;">${escapeHtml(p.name)}</h1>
    <p>${escapeHtml(p.description||'')}</p>
    <p class="mono" style="font-size:11px;color:var(--muted);">${p.phases.length} phase${p.phases.length===1?'':'s'} · ${weeks} week${weeks===1?'':'s'}</p>
    <ul class="share-phase-list">
      ${p.phases.map(ph=>`<li>${escapeHtml(ph.title)} <span class="mono">(${ph.weeks.length}w)</span></li>`).join('')}
    </ul>
    ${signedIn
      ? `<button class="btn-log gate-github" id="share-import-btn">Import into my library</button>`
      : `<button class="btn-log gate-github" id="share-signin-btn">Sign in with GitHub to import</button>`}
    <p class="gate-note" id="share-status"></p>
  `;

  if(signedIn){
    document.getElementById('share-import-btn').addEventListener('click', async ()=>{
      const created = addProgram({ name:p.name, description:p.description, phases:p.phases, builtin:false });
      setActiveProgram(created.id);
      queueSave();
      document.getElementById('share-status').textContent = 'Imported — check your Library.';
      document.getElementById('share-status').style.color = 'var(--volt)';
      if(onImported) onImported();
    });
  }else{
    document.getElementById('share-signin-btn').addEventListener('click', async ()=>{
      stashPendingShare(new URLSearchParams(location.search).get('share'));
      await signInWithGitHub();
    });
  }
}

function renderProgressReport(card, share){
  const s = share.payload;
  const activityHtml = s.activities.map(act=>{
    const sessionsHtml = act.sessions.map(sess=>{
      const exHtml = act.exercises.map((ex,ei)=>{
        const vals = sess.values[ei] || [];
        const shown = vals.filter(v=>v.actual!==null || String(v.target).trim()!=='');
        if(!shown.length) return '';
        return `<div class="share-ex-row">
          <span class="se-name">${escapeHtml(ex.label||act.label)}</span>
          <div class="activity-metrics">${shown.map(v=>`<span class="metric-chip"><b>${escapeHtml(String(v.actual ?? v.target))}</b> ${escapeHtml((v.name||'').toUpperCase())}</span>`).join('')}</div>
        </div>`;
      }).join('');
      return `<div class="log-row" style="grid-template-columns:1fr auto;">
        <div>
          <div class="type">${sess.done?'✓ ':''}Session ${sess.n}${sess.date?` <span class="src">${relDate(sess.date)}</span>`:''}</div>
          ${exHtml || ''}
          ${sess.note?`<div class="note">${escapeHtml(sess.note)}</div>`:''}
        </div>
      </div>`;
    }).join('');
    return `<div class="card" style="padding:16px 20px;margin-bottom:12px;">
      <div class="activity-head" style="cursor:default;"><span class="a-label">${escapeHtml(act.label)}</span></div>
      ${sessionsHtml}
    </div>`;
  }).join('');

  card.innerHTML = `
    ${backLinkHtml()}
    <span class="disp gate-brand">SPLIT</span>
    <p class="gate-sub">${escapeHtml(share.created_by_name||'Someone')} shared their progress</p>
    <h1 class="disp" style="font-size:20px;">${escapeHtml(s.programName)} — Week ${s.weekNum}</h1>
    <p class="mono" style="font-size:11px;color:var(--muted);">${escapeHtml(s.phaseTitle)}</p>
    <p>${escapeHtml(s.weekDesc||'')}</p>
    <div style="width:100%;margin-top:8px;">${activityHtml}</div>
  `;
}
