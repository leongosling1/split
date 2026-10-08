import './style.css';
import {
  load, save, queueSave, onSave, setCurrentUser, getLoadProblem,
  toggleSession, toggleExerciseDone, toggleAllExercises, duplicateWeek,
  setSessionNote, setPhaseNote, setSessionValue, deleteManualLog, addManualLog,
  getActiveProgram
} from './state.js';
import { todayISO } from './utils/dates.js';
import { supabaseConfigured } from './supabase.js';
import { signInWithGitHub, signInWithGoogle, signInWithEmail, signOut, onAuthChange, displayName, avatarUrl } from './auth.js';
import { renderShareGate, takePendingShare } from './views/shareView.js';
import { renderDashboard } from './views/dashboard.js';
import { renderHistory } from './views/history.js';
import { renderRecords } from './views/records.js';
import { renderProgramsView, setChecked, updateProgramCounters, syncSessionCheckboxUI, showWeek } from './views/programs.js';
import { renderLibraryView } from './views/library.js';

let currentView = 'dashboard';

function setSaveState(msg){
  const el=document.getElementById('savestate');
  el.textContent=msg;
  if(msg) setTimeout(()=>{ if(el.textContent===msg) el.textContent=''; },1200);
}
onSave(setSaveState);

function switchView(view){
  currentView = view;
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  document.getElementById('view-'+view).classList.remove('hidden');
  document.querySelectorAll('.navtab').forEach(t=>t.classList.toggle('active', t.dataset.view===view));
  window.scrollTo(0,0);
  renderCurrentView();
}
function renderCurrentView(){
  if(currentView==='dashboard') renderDashboard();
  if(currentView==='history') renderHistory();
  if(currentView==='programs') renderProgramsView();
  if(currentView==='library') renderLibraryView();
  if(currentView==='records') renderRecords();
}

document.querySelectorAll('.navtab').forEach(tab=>{
  tab.addEventListener('click', ()=>switchView(tab.dataset.view));
});

document.addEventListener('active-program-changed', ()=>{
  // 'library' and 'programs' views already re-render themselves on the
  // action that triggers this event; only the other views need a nudge.
  if(currentView!=='library' && currentView!=='programs') renderCurrentView();
});

document.addEventListener('click', (e)=>{
  const dupWeek = e.target.closest('#view-programs [data-duplicate-last-week]');
  if(dupWeek){
    const active = getActiveProgram();
    if(!active) return;
    const pi = +dupWeek.dataset.duplicateLastWeek;
    const lastWi = active.phases[pi].weeks.length - 1;
    duplicateWeek(active.id, pi, lastWi);
    queueSave();
    showWeek(active.id, pi, lastWi + 1);
    renderProgramsView();
    window.scrollTo(0,0);
    return;
  }
  const actToggle = e.target.closest('#view-programs [data-toggle-activity]');
  if(actToggle){
    const activity = actToggle.closest('.activity');
    const expanded = activity.classList.toggle('expanded');
    actToggle.setAttribute('aria-expanded', String(expanded));
    return;
  }
  const exCheck = e.target.closest('#view-programs .exercise-check');
  if(exCheck){
    const active = getActiveProgram();
    if(!active) return;
    const { key, exercise } = exCheck.dataset;
    const nowDone = toggleExerciseDone(active.id, key, exercise);
    setChecked(exCheck, nowDone);
    syncSessionCheckboxUI(active.id, key);
    updateProgramCounters(active.id);
    queueSave();
    return;
  }
  const toggle = e.target.closest('#view-programs [data-toggle-exercise]');
  if(toggle){
    const row = toggle.closest('.exercise-row');
    const expanded = row.classList.toggle('expanded');
    toggle.setAttribute('aria-expanded', String(expanded));
    return;
  }
  const box=e.target.closest('#view-programs .mini-check');
  if(box){
    const active = getActiveProgram();
    if(!active) return;
    const key=box.dataset.key;
    if(box.classList.contains('session-check-multi')){
      const nowDone = toggleAllExercises(active.id, key);
      setChecked(box, nowDone);
      document.querySelectorAll(`.exercise-check[data-key="${key}"]`).forEach(cb=>setChecked(cb, nowDone));
    }else{
      const willBeDone = toggleSession(active.id, key);
      setChecked(box, willBeDone);
    }
    updateProgramCounters(active.id);
    queueSave();
    return;
  }
  const del=e.target.closest('[data-del]');
  if(del){
    deleteManualLog(del.dataset.del);
    renderCurrentView();
    queueSave();
  }
});

document.addEventListener('keydown',(e)=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  const box=e.target.closest('#view-programs .mini-check, #view-programs .exercise-check');
  if(box){ e.preventDefault(); box.click(); return; }
  const toggle=e.target.closest('#view-programs [data-toggle-exercise], #view-programs [data-toggle-activity]');
  if(toggle){ e.preventDefault(); toggle.click(); }
});

document.addEventListener('input',(e)=>{
  const active = getActiveProgram();
  if(!active) return;
  if(e.target.matches('#view-programs input.note[data-notekey]')){
    setSessionNote(active.id, e.target.dataset.notekey, e.target.value); queueSave();
  }else if(e.target.matches('#view-programs textarea[data-phasenotekey]')){
    setPhaseNote(active.id, e.target.dataset.phasenotekey, e.target.value); queueSave();
  }else if(e.target.matches('#view-programs [data-session-value]')){
    const { key, exercise, metric } = e.target.dataset;
    setSessionValue(active.id, key, exercise, metric, e.target.value); queueSave();
  }
});

/* log session panel */
const logPanel = document.getElementById('logPanel');
document.getElementById('toggleLog').addEventListener('click', ()=>{
  const opening = !logPanel.classList.contains('open');
  logPanel.classList.toggle('open');
  if(opening){
    document.getElementById('lp-date').value = todayISO();
    document.getElementById('lp-type').focus();
  }
});
document.getElementById('lp-cancel').addEventListener('click', ()=>{
  logPanel.classList.remove('open');
  ['lp-type','lp-mins','lp-note'].forEach(id=>document.getElementById(id).value='');
});
document.getElementById('lp-save').addEventListener('click', ()=>{
  const type=document.getElementById('lp-type').value.trim();
  const mins=parseInt(document.getElementById('lp-mins').value,10);
  const note=document.getElementById('lp-note').value.trim();
  const date=document.getElementById('lp-date').value || todayISO();
  if(!type || !mins || mins<=0){
    setSaveState('Add a type and minutes to log a session');
    return;
  }
  addManualLog({ date, minutes:mins, type, note });
  ['lp-type','lp-mins','lp-note'].forEach(id=>document.getElementById(id).value='');
  logPanel.classList.remove('open');
  renderCurrentView();
  queueSave();
});

/* ---------------------------------------------------------------------
   AUTH GATES
--------------------------------------------------------------------- */
const gates = ['config','auth','share','error'];
function showGate(name){
  gates.forEach(g=>document.getElementById('gate-'+g).classList.toggle('hidden', g!==name));
  document.getElementById('app-root').classList.add('hidden');
}
function showApp(){
  gates.forEach(g=>document.getElementById('gate-'+g).classList.add('hidden'));
  document.getElementById('app-root').classList.remove('hidden');
}
function renderUserBadge(user){
  document.getElementById('user-avatar').src = avatarUrl(user);
  document.getElementById('user-name').textContent = displayName(user);
}

document.getElementById('btn-github').addEventListener('click', async ()=>{
  const err = document.getElementById('auth-error');
  err.textContent = '';
  try{ await signInWithGitHub(); }
  catch(e){ console.error(e); err.textContent = 'Could not start sign-in — try again.'; }
});
document.getElementById('btn-google').addEventListener('click', async ()=>{
  const err = document.getElementById('auth-error');
  err.textContent = '';
  try{ await signInWithGoogle(); }
  catch(e){ console.error(e); err.textContent = 'Could not start sign-in — try again.'; }
});
document.getElementById('email-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const status = document.getElementById('auth-email-status');
  const input = document.getElementById('auth-email');
  const btn = document.getElementById('btn-email');
  status.classList.remove('gate-note-ok');
  status.textContent = '';
  btn.disabled = true; btn.textContent = 'Sending…';
  try{
    await signInWithEmail(input.value.trim());
    status.textContent = 'Check your email for a sign-in link.';
    status.classList.add('gate-note-ok');
  }catch(err){
    console.error(err);
    status.textContent = 'Could not send the link — try again.';
  }finally{
    btn.disabled = false; btn.textContent = 'Send link';
  }
});
document.getElementById('btn-signout').addEventListener('click', ()=>{ signOut(); });

let pendingShareId = takePendingShare() || new URLSearchParams(location.search).get('share');
let loadedUserId = null;
let loadPromise = null;
let loadPromiseUser = null;

/* Loads this user's cloud data once. Repeat auth events for the same user
   (token refreshes, tab refocus) reuse the result instead of reloading, and
   concurrent calls share one in-flight load. */
function ensureLoaded(user){
  if(loadedUserId === user.id) return Promise.resolve(true);
  if(loadPromise && loadPromiseUser === user.id) return loadPromise;
  setCurrentUser(user.id, displayName(user));
  loadPromiseUser = user.id;
  loadPromise = load()
    .then(ok => { if(ok) loadedUserId = user.id; return ok; })
    .finally(() => { loadPromise = null; loadPromiseUser = null; });
  return loadPromise;
}

async function handleSession(session){
  const user = session?.user || null;

  if(!user){
    loadedUserId = null;
    setCurrentUser(null);
    if(pendingShareId){
      showGate('share');
      await renderShareGate(pendingShareId, {});
    }else{
      showGate('auth');
    }
    return;
  }

  renderUserBadge(user);
  if(loadedUserId === user.id) return;

  const ok = await ensureLoaded(user);
  if(!ok){
    document.getElementById('load-error-text').textContent = getLoadProblem() || "We couldn't load your data. Nothing has been changed or deleted.";
    showGate('error');
    return;
  }

  if(pendingShareId){
    showGate('share');
    await renderShareGate(pendingShareId, {
      onImported: async ()=>{
        pendingShareId = null;
        history.replaceState(null, '', location.pathname);
        await save();
        showApp();
        switchView('library');
      }
    });
    return;
  }

  showApp();
  switchView(currentView);
}

document.getElementById('btn-retry-load').addEventListener('click', ()=>{ location.reload(); });

async function boot(){
  if(!supabaseConfigured){ showGate('config'); return; }
  // Deferred so the auth client's internal lock is released before we query.
  onAuthChange(session => { setTimeout(()=>{ handleSession(session); }, 0); });
}

/* ---------------------------------------------------------------------
   INIT
--------------------------------------------------------------------- */
boot();
