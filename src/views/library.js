import {
  listPrograms, getActiveProgram, setActiveProgram, addProgram, updateProgram,
  deleteProgram, duplicateProgram, queueSave, getCurrentUserName, DAY_SHORT, DAY_LONG, clearProgress
} from '../state.js';
import { escapeHtml } from '../utils/dates.js';
import { createProgramShare, shareUrl } from '../sharing.js';
import { copyLink } from '../utils/clipboard.js';

/* Transient builder draft — null when the library list is showing,
   an object while creating/editing a program. Not persisted directly;
   it's only committed to state on Save. */
let draft = null;
let editingId = null;

function emptyMetric(name='', value=''){ return { name, value }; }
function emptyExercise(){ return { label:'', metrics:[emptyMetric('Minutes', 20)] }; }
function emptyActivity(){ return { label:'', count:1, exercises:[emptyExercise()] }; }
function emptyWeek(){ return { desc:'', activities:[emptyActivity()] }; }
function emptyPhase(){ return { title:'', weeksLabel:'', goal:'', weeks:[emptyWeek()] }; }
function emptyDraft(){ return { name:'', description:'', phases:[emptyPhase()] }; }

function cloneForEdit(program){
  const copy = JSON.parse(JSON.stringify(program));
  delete copy.id; delete copy.builtin; delete copy.createdAt;
  return copy;
}

export function renderLibraryView(){
  if(draft){
    renderBuilder();
  }else{
    renderList();
  }
}

function renderList(){
  const programs = listPrograms();
  const active = getActiveProgram();
  const cards = programs.map(p=>{
    const isActive = active && active.id===p.id;
    const weeks = p.phases.reduce((s,ph)=>s+ph.weeks.length,0);
    return `
      <div class="card lib-card ${isActive?'active-lib':''}">
        ${isActive?'<span class="active-badge">Active</span>':''}
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="desc">${escapeHtml(p.description||'')}</div>
        <div class="meta">${p.phases.length} phase${p.phases.length===1?'':'s'} · ${weeks} week${weeks===1?'':'s'}${p.schedule?.mode==='fixed'?' · fixed days':''}${p.builtin?' · built-in':''}</div>
        <div class="lib-actions">
          ${isActive ? '' : `<button class="btn-ghost" data-activate="${p.id}">Set active</button>`}
          <button class="btn-ghost" data-edit="${p.id}">Edit</button>
          <button class="btn-ghost" data-duplicate="${p.id}">Duplicate</button>
          <button class="btn-ghost" data-share="${p.id}">Share</button>
          <button class="btn-danger" data-delete="${p.id}">Delete</button>
        </div>
      </div>`;
  }).join('');

  document.getElementById('view-library').innerHTML = `
    <div class="rowbetween">
      <h1 class="disp">LIBRARY</h1>
      <button class="btn-log" id="lib-new">+ New program</button>
    </div>
    <p class="mono" style="font-size:11px;color:var(--muted);margin:6px 0 0;">Build your own program, or keep running the built-in one.</p>
    <div class="lib-grid">${cards || '<div class="empty">No programs yet.</div>'}</div>
  `;

  document.getElementById('lib-new').addEventListener('click', ()=>{
    draft = emptyDraft(); editingId = null; renderBuilder();
  });
  document.querySelectorAll('[data-activate]').forEach(b=>b.addEventListener('click', ()=>{
    setActiveProgram(b.dataset.activate); queueSave();
    document.dispatchEvent(new CustomEvent('active-program-changed'));
    renderList();
  }));
  document.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>{
    const p = programs.find(x=>x.id===b.dataset.edit);
    draft = cloneForEdit(p); editingId = p.id; renderBuilder();
  }));
  document.querySelectorAll('[data-duplicate]').forEach(b=>b.addEventListener('click', ()=>{
    duplicateProgram(b.dataset.duplicate); queueSave();
    document.dispatchEvent(new CustomEvent('active-program-changed'));
    renderList();
  }));
  document.querySelectorAll('[data-share]').forEach(b=>b.addEventListener('click', async ()=>{
    const p = programs.find(x=>x.id===b.dataset.share);
    b.disabled = true; b.textContent = 'Creating link…';
    try{
      const id = await createProgramShare(p, getCurrentUserName());
      await copyLink(shareUrl(id), b);
    }catch(err){
      console.error(err);
      b.textContent = 'Could not create link';
      setTimeout(()=>{ b.textContent = 'Share'; }, 1800);
    }finally{
      b.disabled = false;
    }
  }));
  document.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click', ()=>{
    if(programs.length<=1){ alert('Keep at least one program in your library.'); return; }
    if(!confirm('Delete this program? Its logged sessions will be lost.')) return;
    deleteProgram(b.dataset.delete); queueSave();
    document.dispatchEvent(new CustomEvent('active-program-changed'));
    renderList();
  }));
}

function renderBuilder(){
  const fixed = draft.schedule?.mode === 'fixed';
  const weekStart = draft.schedule?.weekStart ?? 1;
  const dayOrder = [0,1,2,3,4,5,6].map(i => (weekStart + i) % 7);
  let html = `
    <h1 class="disp">${editingId ? 'EDIT PROGRAM' : 'NEW PROGRAM'}</h1>
    <div class="card builder">
      <div class="builder-row full">
        <label>Program name</label>
        <input data-field="name" value="${escapeHtml(draft.name)}" placeholder="e.g. Zone 2 base building">
      </div>
      <div class="builder-row full">
        <label>Description</label>
        <input data-field="description" value="${escapeHtml(draft.description)}" placeholder="One line describing the program">
      </div>
      <div class="builder-row">
        <div>
          <label for="b-schedule">Schedule</label>
          <select id="b-schedule" data-schedule-mode>
            <option value="flexible"${fixed?'':' selected'}>Flexible — times per week</option>
            <option value="fixed"${fixed?' selected':''}>Fixed days — set day for each workout</option>
          </select>
        </div>
        ${fixed ? `<div>
          <label for="b-weekstart">Week starts on</label>
          <select id="b-weekstart" data-week-start>
            ${DAY_LONG.map((d,i)=>`<option value="${i}"${i===weekStart?' selected':''}>${d}</option>`).join('')}
          </select>
        </div>` : '<div></div>'}
      </div>
      <p class="builder-hint">${fixed
        ? 'Each workout goes on set days, and SPLIT shows you what to do each day. Days with nothing on are rest days.'
        : 'Each activity happens a number of times per week, on whichever days suit you.'}${editingId ? ' Switching an existing program between the two clears its ticked sessions.' : ''}</p>
  `;

  draft.phases.forEach((phase, pi)=>{
    html += `<div class="builder-phase" data-phase="${pi}">
      <div class="builder-phase-head">
        <span class="mono" style="font-size:11px;color:var(--volt);">PHASE ${pi+1}</span>
        <button class="del-btn" data-remove-phase="${pi}" title="Remove phase">✕</button>
      </div>
      <div class="builder-row">
        <div><label>Phase title</label><input data-field="title" data-phase="${pi}" value="${escapeHtml(phase.title)}" placeholder="e.g. Foundation"></div>
        <div><label>Weeks label</label><input data-field="weeksLabel" data-phase="${pi}" value="${escapeHtml(phase.weeksLabel)}" placeholder="e.g. Weeks 1–4"></div>
      </div>
      <div class="builder-row full">
        <label>Goal / notes for this phase</label>
        <textarea data-field="goal" data-phase="${pi}" rows="2" placeholder="What this phase is building toward">${escapeHtml(phase.goal)}</textarea>
      </div>`;

    phase.weeks.forEach((week, wi)=>{
      html += `<div class="builder-week" data-phase="${pi}" data-week="${wi}">
        <div class="builder-week-head">
          <span class="mono" style="font-size:10px;color:var(--muted);">WEEK</span>
          <div class="week-head-actions">
            <button class="week-dup-btn" data-duplicate-week="${pi}-${wi}" title="Duplicate this week">⧉ Duplicate</button>
            <button class="del-btn" data-remove-week="${pi}-${wi}" title="Remove week">✕</button>
          </div>
        </div>
        <div class="builder-row full">
          <label>Week description</label>
          <input data-field="desc" data-phase="${pi}" data-week="${wi}" value="${escapeHtml(week.desc)}" placeholder="e.g. Walk 20–30 min, 4–5x this week">
        </div>
        ${fixed ? `<div class="week-glance">${dayOrder.map(d=>{
          const names = week.activities.filter(a=>(a.days||[]).includes(d)).map(a=>escapeHtml(a.label.trim()||'Untitled'));
          return `<div class="glance-day${names.length?'':' rest'}"><span class="mono">${DAY_SHORT[d].toUpperCase()}</span><span>${names.length ? names.join(', ') : 'Rest'}</span></div>`;
        }).join('')}</div>` : ''}
        <label style="display:block;font-family:'Space Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:6px;">Activities</label>`;
      week.activities.forEach((act, ai)=>{
        const multi = act.exercises.length > 1;
        html += `<div class="builder-activity-block" data-phase="${pi}" data-week="${wi}" data-activity="${ai}">
          <div class="builder-activity-top${fixed?' is-fixed':''}">
            <input data-field="label" data-phase="${pi}" data-week="${wi}" data-activity="${ai}" value="${escapeHtml(act.label)}" placeholder="e.g. Easy run / Gym session">
            ${fixed ? '<div></div>' : `<div class="count-field">
              <input data-field="count" data-phase="${pi}" data-week="${wi}" data-activity="${ai}" type="number" min="1" max="14" value="${act.count}">
              <span class="mono">×/week</span>
            </div>`}
            <button class="del-btn" data-remove-activity="${pi}-${wi}-${ai}" title="Remove activity">✕</button>
          </div>
          ${fixed ? `<div class="day-picker" role="group" aria-label="Days for ${escapeHtml(act.label||'this activity')}">
            ${dayOrder.map(d=>{
              const on = (act.days||[]).includes(d);
              return `<button class="day-pick${on?' on':''}" data-toggle-day="${pi}-${wi}-${ai}-${d}" aria-pressed="${on}" title="${DAY_LONG[d]}">${DAY_SHORT[d]}</button>`;
            }).join('')}
          </div>` : ''}
          <div class="exercises-list">
            ${act.exercises.map((ex,ei)=>`
              <div class="builder-exercise ${multi?'':'builder-exercise-single'}">
                ${multi ? `<div class="builder-exercise-head">
                  <input class="exercise-name" data-field="label" data-phase="${pi}" data-week="${wi}" data-activity="${ai}" data-exercise="${ei}" value="${escapeHtml(ex.label)}" placeholder="Exercise name, e.g. Leg Press">
                  <button class="del-btn" data-remove-exercise="${pi}-${wi}-${ai}-${ei}" title="Remove exercise">✕</button>
                </div>` : ''}
                <div class="metrics-row">
                  ${ex.metrics.map((m,mi)=>`
                    <div class="metric-col">
                      <button class="metric-remove" data-remove-metric="${pi}-${wi}-${ai}-${ei}-${mi}" title="Remove field">✕</button>
                      <input class="metric-name" data-field="name" data-phase="${pi}" data-week="${wi}" data-activity="${ai}" data-exercise="${ei}" data-metric="${mi}" value="${escapeHtml(m.name)}" placeholder="Field name">
                      <input class="metric-value" data-field="value" data-phase="${pi}" data-week="${wi}" data-activity="${ai}" data-exercise="${ei}" data-metric="${mi}" value="${escapeHtml(String(m.value))}" placeholder="Value">
                    </div>`).join('')}
                  <button class="add-link metric-add" data-add-metric="${pi}-${wi}-${ai}-${ei}" title="Add another field">+</button>
                </div>
              </div>`).join('')}
          </div>
          <button class="add-link" data-add-exercise="${pi}-${wi}-${ai}" style="width:100%;margin-top:6px;">+ Add exercise${multi?'':' (break this into parts, e.g. Leg Press, Calf Raises…)'}</button>
        </div>`;
      });
      html += `<button class="add-link" data-add-activity="${pi}-${wi}" style="width:100%;margin-top:4px;">+ Add activity</button>
      </div>`;
    });
    html += `<button class="add-link" data-add-week="${pi}" style="width:100%;">+ Add week</button>
    </div>`;
  });

  html += `<button class="add-link" data-add-phase style="width:100%;margin-bottom:6px;">+ Add phase</button>
      <div class="builder-actions">
        <button class="btn-log" id="builder-save">Save program</button>
        <button class="btn-ghost" id="builder-cancel">Cancel</button>
      </div>
    </div>`;

  document.getElementById('view-library').innerHTML = html;
  wireBuilderEvents();
}

function wireBuilderEvents(){
  const root = document.getElementById('view-library');

  root.oninput = onBuilderInput;
  const modeSelect = root.querySelector('[data-schedule-mode]');
  modeSelect.addEventListener('change', ()=>{
    if(modeSelect.value === 'fixed') draft.schedule = { mode:'fixed', weekStart: draft.schedule?.weekStart ?? 1 };
    else delete draft.schedule;
    renderBuilder();
  });
  root.querySelector('[data-week-start]')?.addEventListener('change', (e)=>{
    draft.schedule.weekStart = +e.target.value;
    renderBuilder();
  });
  root.querySelectorAll('[data-toggle-day]').forEach(b=>b.addEventListener('click', ()=>{
    const [pi,wi,ai,d] = b.dataset.toggleDay.split('-').map(Number);
    const act = draft.phases[pi].weeks[wi].activities[ai];
    const days = new Set(act.days || []);
    if(days.has(d)) days.delete(d); else days.add(d);
    act.days = [...days].sort((a,b)=>a-b);
    renderBuilder();
  }));
  root.querySelectorAll('[data-add-phase]').forEach(b=>b.addEventListener('click', ()=>{
    draft.phases.push(emptyPhase()); renderBuilder();
  }));
  root.querySelectorAll('[data-remove-phase]').forEach(b=>b.addEventListener('click', ()=>{
    draft.phases.splice(+b.dataset.removePhase, 1); renderBuilder();
  }));
  root.querySelectorAll('[data-add-week]').forEach(b=>b.addEventListener('click', ()=>{
    draft.phases[+b.dataset.addWeek].weeks.push(emptyWeek()); renderBuilder();
  }));
  root.querySelectorAll('[data-remove-week]').forEach(b=>b.addEventListener('click', ()=>{
    const [pi,wi] = b.dataset.removeWeek.split('-').map(Number);
    draft.phases[pi].weeks.splice(wi,1); renderBuilder();
  }));
  root.querySelectorAll('[data-duplicate-week]').forEach(b=>b.addEventListener('click', ()=>{
    const [pi,wi] = b.dataset.duplicateWeek.split('-').map(Number);
    const copy = JSON.parse(JSON.stringify(draft.phases[pi].weeks[wi]));
    draft.phases[pi].weeks.splice(wi+1, 0, copy);
    renderBuilder();
  }));
  root.querySelectorAll('[data-add-activity]').forEach(b=>b.addEventListener('click', ()=>{
    const [pi,wi] = b.dataset.addActivity.split('-').map(Number);
    draft.phases[pi].weeks[wi].activities.push(emptyActivity()); renderBuilder();
  }));
  root.querySelectorAll('[data-remove-activity]').forEach(b=>b.addEventListener('click', ()=>{
    const [pi,wi,ai] = b.dataset.removeActivity.split('-').map(Number);
    draft.phases[pi].weeks[wi].activities.splice(ai,1); renderBuilder();
  }));
  root.querySelectorAll('[data-add-exercise]').forEach(b=>b.addEventListener('click', ()=>{
    const [pi,wi,ai] = b.dataset.addExercise.split('-').map(Number);
    draft.phases[pi].weeks[wi].activities[ai].exercises.push(emptyExercise()); renderBuilder();
  }));
  root.querySelectorAll('[data-remove-exercise]').forEach(b=>b.addEventListener('click', ()=>{
    const [pi,wi,ai,ei] = b.dataset.removeExercise.split('-').map(Number);
    const exercises = draft.phases[pi].weeks[wi].activities[ai].exercises;
    if(exercises.length<=1){ alert('An activity needs at least one exercise.'); return; }
    exercises.splice(ei,1); renderBuilder();
  }));
  root.querySelectorAll('[data-add-metric]').forEach(b=>b.addEventListener('click', ()=>{
    const [pi,wi,ai,ei] = b.dataset.addMetric.split('-').map(Number);
    draft.phases[pi].weeks[wi].activities[ai].exercises[ei].metrics.push(emptyMetric()); renderBuilder();
  }));
  root.querySelectorAll('[data-remove-metric]').forEach(b=>b.addEventListener('click', ()=>{
    const [pi,wi,ai,ei,mi] = b.dataset.removeMetric.split('-').map(Number);
    const metrics = draft.phases[pi].weeks[wi].activities[ai].exercises[ei].metrics;
    if(metrics.length<=1){ alert('An exercise needs at least one field.'); return; }
    metrics.splice(mi,1); renderBuilder();
  }));

  document.getElementById('builder-save').addEventListener('click', saveBuilder);
  document.getElementById('builder-cancel').addEventListener('click', ()=>{
    draft = null; editingId = null; renderList();
  });
}

function onBuilderInput(e){
  const t = e.target;
  const field = t.dataset.field;
  if(!field) return;
  const val = t.type==='number' ? Math.max(1, parseInt(t.value,10)||1) : t.value;

  if(t.dataset.metric!==undefined){
    draft.phases[+t.dataset.phase].weeks[+t.dataset.week].activities[+t.dataset.activity]
      .exercises[+t.dataset.exercise].metrics[+t.dataset.metric][field] = val;
  }else if(t.dataset.exercise!==undefined){
    draft.phases[+t.dataset.phase].weeks[+t.dataset.week].activities[+t.dataset.activity].exercises[+t.dataset.exercise][field] = val;
  }else if(t.dataset.activity!==undefined){
    draft.phases[+t.dataset.phase].weeks[+t.dataset.week].activities[+t.dataset.activity][field] = val;
  }else if(t.dataset.week!==undefined){
    draft.phases[+t.dataset.phase].weeks[+t.dataset.week][field] = val;
  }else if(t.dataset.phase!==undefined){
    draft.phases[+t.dataset.phase][field] = val;
  }else{
    draft[field] = val;
  }
}

function saveBuilder(){
  if(!draft.name.trim()){
    alert('Give the program a name.');
    return;
  }
  const fixed = draft.schedule?.mode === 'fixed';
  if(fixed){
    const dayless = draft.phases.flatMap(p=>p.weeks.flatMap(w=>w.activities))
      .find(a => a.label.trim() && !(a.days||[]).length);
    if(dayless){
      alert(`Pick at least one day for "${dayless.label.trim()}".`);
      return;
    }
  }
  const clean = {
    name: draft.name.trim(),
    description: draft.description.trim(),
    builtin: false,
    schedule: fixed ? { mode:'fixed', weekStart: draft.schedule.weekStart ?? 1 } : undefined,
    phases: draft.phases.map(p=>({
      title: p.title.trim() || 'Untitled phase',
      weeksLabel: p.weeksLabel.trim(),
      goal: p.goal.trim(),
      weeks: p.weeks.map(w=>({
        desc: w.desc.trim(),
        activities: w.activities
          .filter(a=>a.label.trim())
          .map(a=>({
            label: a.label.trim(),
            count: fixed ? (a.days||[]).length : a.count,
            ...(fixed ? { days: [...(a.days||[])].sort((x,y)=>x-y) } : {}),
            exercises: a.exercises.map(ex=>{
              const metrics = ex.metrics
                .filter(m=>String(m.name).trim())
                .map(m=>({ name:String(m.name).trim(), value:String(m.value).trim() }));
              return { label: ex.label.trim(), metrics: metrics.length ? metrics : [emptyMetric('Minutes','')] };
            })
          }))
      }))
    }))
  };
  if(editingId){
    const wasFixed = listPrograms().find(p=>p.id===editingId)?.schedule?.mode === 'fixed';
    if(wasFixed !== fixed) clearProgress(editingId);
    updateProgram(editingId, clean);
  }else{
    const created = addProgram(clean);
    setActiveProgram(created.id);
  }
  queueSave();
  draft = null; editingId = null;
  document.dispatchEvent(new CustomEvent('active-program-changed'));
  renderList();
}
