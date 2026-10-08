import {
  listPrograms, getActiveProgram, setActiveProgram, sessionKey,
  getSession, getSessionNote, getPhaseNote, getSessionValue, getExerciseDone, queueSave,
  getCurrentUserName, listWeeks, isWeekComplete, toggleWeekComplete, weekSessionCounts,
  currentProgramWeek
} from '../state.js';
import { escapeHtml } from '../utils/dates.js';
import { buildWeekSnapshot, createProgressShare, shareUrl } from '../sharing.js';
import { copyLink } from '../utils/clipboard.js';

function isSimple(act){
  return act.exercises.length===1 && !act.exercises[0].label.trim();
}

function metricChipsHtml(metrics){
  const shown = (metrics||[]).filter(m=>String(m.value).trim()!=='');
  if(!shown.length) return '';
  return `<div class="activity-metrics">${shown.map(m=>`<span class="metric-chip"><b>${escapeHtml(String(m.value))}</b> ${escapeHtml(m.name.toUpperCase())}</span>`).join('')}</div>`;
}
function metricsPreviewText(metrics){
  const shown = (metrics||[]).filter(m=>String(m.value).trim()!=='');
  if(!shown.length) return '';
  return shown.map(m=>`${escapeHtml(String(m.value))} ${escapeHtml(m.name.toUpperCase())}`).join(' · ');
}

// Which week (flat index across phases) is on screen, per program. Unset
// means "show the current week".
const viewedWeekIndex = {};

export function showWeek(programId, pi, wi){
  const program = listPrograms().find(p => p.id === programId);
  if(!program) return;
  const i = listWeeks(program).findIndex(w => w.pi === pi && w.wi === wi);
  if(i >= 0) viewedWeekIndex[programId] = i;
}

function wireSwitcher(){
  document.getElementById('program-switch').addEventListener('change', (e)=>{
    setActiveProgram(e.target.value);
    queueSave();
    renderProgramsView();
    document.dispatchEvent(new CustomEvent('active-program-changed'));
  });
}

export function renderProgramsView(){
  const container = document.getElementById('view-programs');
  const programs = listPrograms();
  const active = getActiveProgram();

  if(!programs.length){
    container.innerHTML = `
      <h1 class="disp">PROGRAMS</h1>
      <div class="empty">No programs yet — add one from the Library tab.</div>
    `;
    return;
  }

  const switcher = `
    <div class="program-select-bar">
      <select id="program-switch">
        ${programs.map(p=>`<option value="${p.id}" ${active && p.id===active.id ? 'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
    </div>`;

  if(!active){
    container.innerHTML = `<h1 class="disp">PROGRAMS</h1>${switcher}<div class="empty">Pick a program above to see its plan.</div>`;
    wireSwitcher();
    return;
  }

  const weeks = listWeeks(active);
  const totalWeeks = weeks.length;
  const header = `<h1 class="disp">PROGRAMS</h1><p class="mono" style="font-size:11px;color:var(--muted);margin:6px 0 0;">${escapeHtml(active.name.toUpperCase())} — ${totalWeeks} WEEK${totalWeeks===1?'':'S'}</p>${switcher}`;

  if(!totalWeeks){
    container.innerHTML = `${header}<div class="empty">This program has no weeks yet — add some in the Library tab.</div>`;
    wireSwitcher();
    return;
  }

  const cur = currentProgramWeek(active.id);
  const currentIdx = cur ? cur.weekNum - 1 : totalWeeks - 1;
  let idx = viewedWeekIndex[active.id];
  if(idx == null || idx >= totalWeeks) idx = currentIdx;
  viewedWeekIndex[active.id] = idx;
  const { pi, wi, num } = weeks[idx];
  const p = active.phases[pi];
  const week = p.weeks[wi];
  const weekComplete = isWeekComplete(active.id, pi, wi);
  const completedCount = weeks.filter(w => isWeekComplete(active.id, w.pi, w.wi)).length;

  const strip = weeks.map((w,i)=>{
    const done = isWeekComplete(active.id, w.pi, w.wi);
    const cls = ['week-chip'];
    if(done) cls.push('done');
    if(cur && i===currentIdx) cls.push('current');
    if(i===idx) cls.push('viewing');
    if(i>0 && weeks[i-1].pi!==w.pi) cls.push('phase-start');
    const label = `Week ${w.num}${done?', complete':''}${cur && i===currentIdx?', current week':''} · ${active.phases[w.pi].title}`;
    return `<button class="${cls.join(' ')}" data-goto-week="${i}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"${i===idx?' aria-current="true"':''}>${w.num}</button>`;
  }).join('');

  let html = `${header}
    <div class="week-progress mono">${completedCount} OF ${totalWeeks} WEEKS COMPLETE${cur ? '' : ' — PROGRAM FINISHED'}</div>
    <div class="week-strip" id="week-strip">${strip}</div>
    <div class="week-nav">
      <button class="week-step" data-week-step="-1" aria-label="Previous week"${idx===0?' disabled':''}>‹</button>
      <div class="week-nav-label">
        <span class="mono">WEEK ${num} OF ${totalWeeks}</span>
        <span class="wn-phase">Phase ${pi+1} · ${escapeHtml(p.title)}</span>
      </div>
      <button class="week-step" data-week-step="1" aria-label="Next week"${idx===totalWeeks-1?' disabled':''}>›</button>
    </div>
    ${cur && idx!==currentIdx ? `<button class="back-to-current" data-goto-week="${currentIdx}">Go to current week (Week ${currentIdx+1})</button>` : ''}
    ${p.goal ? `<p class="phase-goal">${escapeHtml(p.goal)}</p>` : ''}`;

  html += `<div class="week" id="week-${pi}-${wi}">
        <div class="week-top">
          <span class="wk">WEEK ${num}</span>
          <div class="week-top-right">
            <span class="wprog" data-week-progress="${pi}-${wi}">0/0</span>
            <button class="week-share-btn" data-share-week="${pi}-${wi}" title="Share this week's progress">Share</button>
          </div>
        </div>
        <p class="week-desc">${escapeHtml(week.desc)}</p>`;
      week.activities.forEach((act,ai)=>{
        const simple = isSimple(act);
        html += `<div class="activity" data-activity="${pi}-${wi}-${ai}">
          <div class="activity-head" data-toggle-activity tabindex="0" role="button" aria-expanded="false">
            <span class="activity-caret">▸</span>
            <span class="a-label">${escapeHtml(act.label)}</span>
            <span class="a-count" data-progress="${pi}-${wi}-${ai}">0/${act.count}</span>
          </div>
          <div class="activity-body">`;

        if(simple) html += metricChipsHtml(act.exercises[0].metrics);

        html += `<div class="sessions">`;
        for(let ii=0; ii<act.count; ii++){
          const key = sessionKey(pi,wi,ai,ii);
          if(simple){
            html += `<div class="session">
              <div class="mini-check" data-key="${key}" data-n="${ii+1}" role="checkbox" aria-checked="false" tabindex="0"></div>
              <input class="note" type="text" data-notekey="${key}" placeholder="Session ${ii+1} notes…">
            </div>`;
          }else{
            html += `<div class="session session-multi" data-key="${key}">
              <div class="session-multi-top">
                <div class="mini-check session-check-multi" data-key="${key}" data-n="${ii+1}" role="checkbox" aria-checked="false" tabindex="0"></div>
                <span class="session-num mono">SESSION ${ii+1}</span>
              </div>
              <div class="session-exercises">
                ${act.exercises.map((ex,ei)=>`
                  <div class="exercise-row" data-key="${key}" data-exercise="${ei}">
                    <div class="exercise-row-top" data-toggle-exercise tabindex="0" role="button" aria-expanded="false">
                      <span class="exercise-row-name">${escapeHtml(ex.label||act.label)}</span>
                      <span class="exercise-row-preview mono">${metricsPreviewText(ex.metrics)}</span>
                      <div class="exercise-check" data-key="${key}" data-exercise="${ei}" role="checkbox" aria-checked="false" tabindex="0"></div>
                    </div>
                    <div class="exercise-row-detail">
                      <div class="se-metrics">
                        ${ex.metrics.map((m,mi)=>`
                          <div class="se-metric">
                            <label>${escapeHtml(m.name||'—')}</label>
                            <input type="text" data-session-value data-key="${key}" data-exercise="${ei}" data-metric="${mi}" data-target="${escapeHtml(String(m.value))}" placeholder="${escapeHtml(String(m.value))}">
                          </div>`).join('')}
                      </div>
                    </div>
                  </div>`).join('')}
              </div>
              <input class="note" type="text" data-notekey="${key}" placeholder="Session ${ii+1} notes…">
            </div>`;
          }
        }
        html += `</div></div></div>`;
      });
  html += `<button class="week-complete-btn${weekComplete?' is-complete':''}" data-mark-week="${pi}-${wi}">${weekComplete ? '✓ Week complete' : 'Mark week complete'}</button>`;
  if(weekComplete) html += `<p class="week-complete-hint">Tap again to un-mark this week.</p>`;
  html += `</div>`;
  if(wi === p.weeks.length-1){
    html += `<button class="add-link" data-duplicate-last-week="${pi}" style="width:100%;margin-bottom:18px;">+ Add another week (copy of Week ${num})</button>`;
  }
  html += `<div class="phase-notes"><div class="lbl">Phase ${pi+1} notes / pain check-in</div><textarea data-phasenotekey="${pi}" placeholder="e.g. mild ache at 18 min, resolved by next day"></textarea></div>`;

  container.innerHTML = html;
  applyProgramsState(active.id);
  wireSwitcher();

  const stripEl = document.getElementById('week-strip');
  const viewingChip = stripEl.querySelector('.viewing');
  if(viewingChip) stripEl.scrollLeft = viewingChip.offsetLeft - stripEl.clientWidth/2 + viewingChip.offsetWidth/2;

  const goTo = (i)=>{
    viewedWeekIndex[active.id] = Math.max(0, Math.min(totalWeeks-1, i));
    renderProgramsView();
    window.scrollTo(0,0);
  };
  container.querySelectorAll('[data-goto-week]').forEach(b=>b.addEventListener('click', ()=>goTo(+b.dataset.gotoWeek)));
  container.querySelectorAll('[data-week-step]').forEach(b=>b.addEventListener('click', ()=>goTo(idx + +b.dataset.weekStep)));
  container.querySelector('[data-mark-week]').addEventListener('click', ()=>{
    const nowComplete = toggleWeekComplete(active.id, pi, wi);
    queueSave();
    // ticking a week off moves you on to the next one
    if(nowComplete && idx < totalWeeks-1) goTo(idx+1);
    else renderProgramsView();
  });

  document.querySelectorAll('[data-share-week]').forEach(b=>b.addEventListener('click', async ()=>{
    const [pi,wi] = b.dataset.shareWeek.split('-').map(Number);
    b.disabled = true; b.textContent = 'Creating link…';
    try{
      const snapshot = buildWeekSnapshot(active, pi, wi);
      const id = await createProgressShare(snapshot, getCurrentUserName());
      await copyLink(shareUrl(id), b);
    }catch(err){
      console.error(err);
      b.textContent = 'Could not create link';
      setTimeout(()=>{ b.textContent = 'Share'; }, 1800);
    }finally{
      b.disabled = false;
    }
  }));
}

function applyProgramsState(programId){
  document.querySelectorAll('#view-programs .mini-check').forEach(box=>{
    const key=box.dataset.key;
    const s = getSession(programId, key);
    setChecked(box, !!(s && s.done));
  });
  document.querySelectorAll('#view-programs .exercise-check').forEach(box=>{
    const { key, exercise } = box.dataset;
    setChecked(box, getExerciseDone(programId, key, exercise));
  });
  document.querySelectorAll('#view-programs input.note[data-notekey]').forEach(input=>{
    input.value = getSessionNote(programId, input.dataset.notekey);
  });
  document.querySelectorAll('#view-programs textarea[data-phasenotekey]').forEach(ta=>{
    ta.value = getPhaseNote(programId, ta.dataset.phasenotekey);
  });
  document.querySelectorAll('#view-programs [data-session-value]').forEach(input=>{
    const { key, exercise, metric, target } = input.dataset;
    const logged = getSessionValue(programId, key, exercise, metric);
    input.value = logged !== '' ? logged : (target || '');
  });
  updateProgramCounters(programId);
}

export function setChecked(box, checked){
  box.classList.toggle('checked', checked);
  box.setAttribute('aria-checked', String(checked));
  box.textContent = checked ? '✓' : (box.dataset.n || '');
}

export function syncSessionCheckboxUI(programId, key){
  const box = document.querySelector(`#view-programs .session-check-multi[data-key="${key}"]`);
  if(box) setChecked(box, !!getSession(programId, key)?.done);
}

export function updateProgramCounters(programId){
  const active = getActiveProgram();
  if(!active || active.id!==programId) return;
  active.phases.forEach((p,pi)=>{
    p.weeks.forEach((week,wi)=>{
      let weekDone=0, weekTotal=0;
      week.activities.forEach((act,ai)=>{
        let done=0;
        for(let ii=0; ii<act.count; ii++){ const s=getSession(programId, sessionKey(pi,wi,ai,ii)); if(s?.done) done++; }
        weekDone+=done; weekTotal+=act.count;
        const el=document.querySelector(`[data-progress="${pi}-${wi}-${ai}"]`);
        if(el) el.textContent = `${done}/${act.count}`;
      });
      const wEl=document.querySelector(`[data-week-progress="${pi}-${wi}"]`);
      if(wEl) wEl.textContent = `${weekDone}/${weekTotal}`;
      const markBtn=document.querySelector(`#view-programs [data-mark-week="${pi}-${wi}"]`);
      if(markBtn) markBtn.classList.toggle('ready', weekTotal>0 && weekDone===weekTotal);
    });
  });
}
