import { seedPrograms } from './data/seedPrograms.js';
import { todayISO } from './utils/dates.js';
import { activityMinutes } from './metrics.js';
import { supabase, supabaseConfigured } from './supabase.js';

let currentUserId = null;
let currentUserName = '';
export function setCurrentUser(userId, name=''){
  if(userId !== currentUserId) resetState();
  currentUserId = userId;
  currentUserName = name;
}
export function getCurrentUserId(){ return currentUserId; }
export function getCurrentUserName(){ return currentUserName; }

/* ---------------------------------------------------------------------
   STATE SHAPE
   programs:   { [programId]: Program }
   progress:   { [programId]: {
     sessions:{key:{done,date,ts}}, sessionNotes:{}, phaseNotes:{},
     sessionValues:{ key: { [exerciseIndex]: { [metricIndex]: value } } }
   }}
   manualLogs: [{id,date,minutes,type,note,ts}]   -- not tied to any program
   activeProgramId: string | null

   An activity is { label, count, exercises:[{label,metrics:[{name,value}]}] }.
   `count` is structural (times/week -> number of session checkboxes).
   `exercises` breaks a session down into trackable sub-items — a simple
   activity has one exercise with an empty label; a composite one like
   "Gym session" has several named exercises, each with its own metrics.
--------------------------------------------------------------------- */
export const state = {
  programs: {},
  progress: {},
  manualLogs: [],
  activeProgramId: null,
};

let saveTimer = null;

export function sessionKey(pi, wi, ai, ii){ return `${pi}-${wi}-${ai}-${ii}`; }

/* ---------------------------------------------------------------------
   SCHEDULE — a program is either flexible ("3× per week", the default)
   or fixed-days (`schedule: { mode:'fixed', weekStart }`), where each
   activity lists the weekdays it falls on (`days`, 0=Sun … 6=Sat).
   A session's slot (the last part of its key) is its index for flexible
   activities and its weekday for fixed ones, so editing days or changing
   the week's start day never re-points tracked sessions.
--------------------------------------------------------------------- */
export const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const DAY_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export function isFixedDays(program){ return program?.schedule?.mode === 'fixed'; }
export function weekStartOf(program){ return program?.schedule?.weekStart ?? 1; }
export function orderedDays(program){
  const start = weekStartOf(program);
  return [0,1,2,3,4,5,6].map(i => (start + i) % 7);
}
export function sessionSlots(program, act){
  if(isFixedDays(program)) return [...(act.days || [])].sort((a,b)=>a-b);
  return Array.from({ length: act.count || 0 }, (_, i) => i);
}

/* Where a weekday sits relative to today within the program's week order. */
export function dayTiming(program, day, today = new Date().getDay()){
  const order = orderedDays(program);
  const d = order.indexOf(day), t = order.indexOf(today);
  return d === t ? 'today' : d < t ? 'past' : 'future';
}

/* What the current week asks of the user today (fixed-days programs only). */
export function todayPlan(programId){
  const program = getProgram(programId);
  if(!isFixedDays(program)) return null;
  const cur = currentProgramWeek(programId);
  if(!cur) return { program, finished:true };
  const today = new Date().getDay();
  const itemsFor = day => cur.week.activities
    .map((act, ai) => ({ act, ai, key: sessionKey(cur.pi, cur.wi, ai, day) }))
    .filter(x => (x.act.days || []).includes(day));
  const items = itemsFor(today);
  const order = orderedDays(program);
  const nextDay = order.slice(order.indexOf(today) + 1).find(d => itemsFor(d).length);
  return { program, cur, today, items, next: nextDay === undefined ? null : { day: nextDay, items: itemsFor(nextDay) } };
}

function ensureProgress(programId){
  if(!state.progress[programId]){
    state.progress[programId] = { sessions:{}, sessionNotes:{}, phaseNotes:{}, sessionValues:{}, exerciseDone:{}, weeksDone:{} };
  }
  const prog = state.progress[programId];
  if(!prog.exerciseDone) prog.exerciseDone = {};
  if(!prog.weeksDone) prog.weeksDone = {};
  return prog;
}

function exercisesForKey(programId, key){
  const [pi,wi,ai] = key.split('-').map(Number);
  const program = getProgram(programId);
  return program?.phases[pi]?.weeks[wi]?.activities[ai]?.exercises || [];
}

/* ---------------------------------------------------------------------
   PROGRAM CRUD
--------------------------------------------------------------------- */
export function listPrograms(){
  return Object.values(state.programs).sort((a,b)=> (a.createdAt||0)-(b.createdAt||0));
}
export function getProgram(id){ return state.programs[id] || null; }
export function getActiveProgram(){
  return state.activeProgramId ? getProgram(state.activeProgramId) : null;
}
export function setActiveProgram(id){
  if(state.programs[id]) state.activeProgramId = id;
}
export function addProgram(program){
  const id = program.id || 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const withId = { ...program, id, createdAt: Date.now() };
  state.programs[id] = withId;
  ensureProgress(id);
  if(!state.activeProgramId) state.activeProgramId = id;
  return withId;
}
export function updateProgram(id, patch){
  if(!state.programs[id]) return;
  state.programs[id] = { ...state.programs[id], ...patch, id };
}
export function clearProgress(id){
  delete state.progress[id];
  ensureProgress(id);
}
export function deleteProgram(id){
  delete state.programs[id];
  delete state.progress[id];
  if(state.activeProgramId===id){
    const remaining = listPrograms();
    state.activeProgramId = remaining.length ? remaining[0].id : null;
  }
}
export function duplicateProgram(id){
  const src = getProgram(id);
  if(!src) return null;
  const copy = JSON.parse(JSON.stringify(src));
  delete copy.id;
  copy.name = src.name + ' (copy)';
  copy.builtin = false;
  return addProgram(copy);
}

/* Appends a copy of week `wi` right after it within phase `pi`. Only
   safe to call with the LAST week of a phase — inserting in the middle
   would shift every later week's array index, and session progress is
   keyed positionally (pi-wi-ai-ii), so anything already tracked for
   later weeks would silently point at the wrong week. Appending at the
   end never shifts an existing index, so it's always safe. */
export function duplicateWeek(programId, pi, wi){
  const program = getProgram(programId);
  if(!program) return;
  const copy = JSON.parse(JSON.stringify(program.phases[pi].weeks[wi]));
  program.phases[pi].weeks.splice(wi + 1, 0, copy);
}

/* ---------------------------------------------------------------------
   PROGRESS (per-program session tracking)
--------------------------------------------------------------------- */
export function getSession(programId, key){
  return ensureProgress(programId).sessions[key];
}
export function toggleSession(programId, key){
  const prog = ensureProgress(programId);
  const willBeDone = !(prog.sessions[key] && prog.sessions[key].done);
  prog.sessions[key] = willBeDone
    ? { done:true, date: todayISO(), ts: Date.now() }
    : { done:false, date:null, ts:0 };
  return willBeDone;
}
export function setSessionNote(programId, key, value){
  ensureProgress(programId).sessionNotes[key] = value;
}
export function getSessionNote(programId, key){
  return ensureProgress(programId).sessionNotes[key] || '';
}
export function setPhaseNote(programId, phaseIndex, value){
  ensureProgress(programId).phaseNotes[phaseIndex] = value;
}
export function getPhaseNote(programId, phaseIndex){
  return ensureProgress(programId).phaseNotes[phaseIndex] || '';
}
export function getSessionValue(programId, key, ei, mi){
  const sv = ensureProgress(programId).sessionValues[key];
  return sv?.[ei]?.[mi] ?? '';
}
export function setSessionValue(programId, key, ei, mi, value){
  const prog = ensureProgress(programId);
  if(!prog.sessionValues[key]) prog.sessionValues[key] = {};
  if(!prog.sessionValues[key][ei]) prog.sessionValues[key][ei] = {};
  prog.sessionValues[key][ei][mi] = value;
}

/* Per-exercise completion within a composite session. The overall
   session (`sessions[key].done`, used everywhere else — streak,
   progress %, dashboard logs) is kept in sync: done once every
   exercise in that session is checked, undone the moment one isn't. */
export function getExerciseDone(programId, key, ei){
  return !!ensureProgress(programId).exerciseDone[key]?.[ei];
}
export function toggleExerciseDone(programId, key, ei){
  const prog = ensureProgress(programId);
  if(!prog.exerciseDone[key]) prog.exerciseDone[key] = {};
  const nowDone = !prog.exerciseDone[key][ei];
  prog.exerciseDone[key][ei] = nowDone;
  syncSessionFromExercises(programId, key);
  return nowDone;
}
export function toggleAllExercises(programId, key){
  const prog = ensureProgress(programId);
  const exercises = exercisesForKey(programId, key);
  const newDone = !(prog.sessions[key] && prog.sessions[key].done);
  prog.exerciseDone[key] = {};
  exercises.forEach((_,ei)=>{ prog.exerciseDone[key][ei] = newDone; });
  prog.sessions[key] = newDone
    ? { done:true, date: todayISO(), ts: Date.now() }
    : { done:false, date:null, ts:0 };
  return newDone;
}
function syncSessionFromExercises(programId, key){
  const prog = ensureProgress(programId);
  const exercises = exercisesForKey(programId, key);
  const allDone = exercises.length>0 && exercises.every((_,ei)=>!!prog.exerciseDone[key][ei]);
  const wasDone = !!(prog.sessions[key] && prog.sessions[key].done);
  if(allDone && !wasDone){
    prog.sessions[key] = { done:true, date: todayISO(), ts: Date.now() };
  }else if(!allDone && wasDone){
    prog.sessions[key] = { done:false, date:null, ts:0 };
  }
}

/* ---------------------------------------------------------------------
   LOG AGGREGATION
--------------------------------------------------------------------- */
export function getProgramLogs(programId){
  const program = getProgram(programId);
  if(!program) return [];
  const prog = ensureProgress(programId);
  const out = [];
  program.phases.forEach((p,pi)=>{
    p.weeks.forEach((week,wi)=>{
      week.activities.forEach((act,ai)=>{
        for(const ii of sessionSlots(program, act)){
          const key = sessionKey(pi,wi,ai,ii);
          const s = prog.sessions[key];
          if(s && s.done && s.date){
            const minutes = activityMinutes(act.exercises, prog.sessionValues[key]);
            out.push({ id:`p-${programId}-${key}`, date:s.date, minutes, type:act.label,
                       note: prog.sessionNotes[key]||'', source:'program', programId, ts:s.ts||0 });
          }
        }
      });
    });
  });
  return out;
}
export function getAllProgramLogs(){
  return listPrograms().flatMap(p=>getProgramLogs(p.id));
}
export function getAllLogs(){
  return getAllProgramLogs().concat(state.manualLogs)
    .sort((a,b)=> a.date<b.date?1 : a.date>b.date?-1 : (b.ts-a.ts));
}

/* ---------------------------------------------------------------------
   PROGRAM PROGRESS HELPERS
--------------------------------------------------------------------- */
export function programProgress(programId){
  const program = getProgram(programId);
  if(!program) return { done:0, total:0 };
  const prog = ensureProgress(programId);
  let done=0, total=0;
  program.phases.forEach((p,pi)=>p.weeks.forEach((week,wi)=>week.activities.forEach((act,ai)=>{
    for(const ii of sessionSlots(program, act)){
      total++;
      const s = prog.sessions[sessionKey(pi,wi,ai,ii)];
      if(s && s.done) done++;
    }
  })));
  return { done, total };
}
/* Every week of a program in order, numbered across phases (1..N). */
export function listWeeks(program){
  const out = [];
  program.phases.forEach((p,pi)=>p.weeks.forEach((_,wi)=>out.push({ pi, wi, num: out.length+1 })));
  return out;
}

/* Week completion is an explicit tick by the user, not derived from
   sessions: people often miss a session and still move on. Keyed
   positionally like sessions, which stays valid because weeks are only
   ever appended to the end of a phase. */
export function isWeekComplete(programId, pi, wi){
  return !!ensureProgress(programId).weeksDone[`${pi}-${wi}`];
}
export function toggleWeekComplete(programId, pi, wi){
  const weeksDone = ensureProgress(programId).weeksDone;
  const key = `${pi}-${wi}`;
  if(weeksDone[key]) delete weeksDone[key];
  else weeksDone[key] = true;
  return !!weeksDone[key];
}
export function weekSessionCounts(programId, pi, wi){
  const program = getProgram(programId);
  const week = program?.phases[pi]?.weeks[wi];
  if(!week) return { done:0, total:0 };
  const prog = ensureProgress(programId);
  let done=0, total=0;
  week.activities.forEach((act,ai)=>{
    const slots = sessionSlots(program, act);
    total += slots.length;
    for(const ii of slots){ if(prog.sessions[sessionKey(pi,wi,ai,ii)]?.done) done++; }
  });
  return { done, total };
}

/* The current week is the first one not marked complete. */
export function currentProgramWeek(programId){
  const program = getProgram(programId);
  if(!program) return null;
  const weeks = listWeeks(program);
  const w = weeks.find(w => !isWeekComplete(programId, w.pi, w.wi));
  if(!w) return null; // program complete
  const { done, total } = weekSessionCounts(programId, w.pi, w.wi);
  return { pi:w.pi, wi:w.wi, phase:program.phases[w.pi], week:program.phases[w.pi].weeks[w.wi],
           weekNum:w.num, done, total, totalWeeks:weeks.length };
}

/* ---------------------------------------------------------------------
   MANUAL LOGS
--------------------------------------------------------------------- */
export function addManualLog({date, minutes, type, note}){
  state.manualLogs.push({ id:'m-'+Date.now()+Math.random().toString(36).slice(2,6), date, minutes, type, note, ts:Date.now() });
}
export function deleteManualLog(id){
  state.manualLogs = state.manualLogs.filter(l=>l.id!==id);
}

/* ---------------------------------------------------------------------
   PERSISTENCE — Supabase, scoped to the signed-in user (setCurrentUser).

   Losing a user's data is the one failure this app can't afford, so:
   1. Nothing is saved until a load for this user has fully succeeded.
   2. A save only writes rows that changed since they were last read or
      written, and only deletes rows this session loaded and the user then
      removed. A client can therefore never wipe data it never saw.
   3. An account is only seeded with the starter programs when it has no
      rows at all AND no user_state row, i.e. a genuinely new user.
--------------------------------------------------------------------- */
let onSaveState = ()=>{};
export function onSave(cb){ onSaveState = cb; }

let loadedFor = null;
let synced = emptySynced();
let saving = null;
let savePending = false;
let loadProblem = '';
function emptySynced(){ return { programs:{}, progress:{}, logs:{}, activeProgramId:null }; }
const toJson = v => JSON.stringify(v);

export function getLoadProblem(){ return loadProblem; }

/* Demo builds only: no signed-in user, so save() stays a no-op. */
export function loadDemoState(demo){
  resetState();
  Object.assign(state, demo);
}

export function resetState(){
  clearTimeout(saveTimer);
  state.programs = {}; state.progress = {}; state.manualLogs = []; state.activeProgramId = null;
  loadedFor = null; synced = emptySynced(); loadProblem = '';
}

function diffRows(current, known){
  const upserts = [];
  const deletes = Object.keys(known).filter(id => !(id in current));
  for(const id of Object.keys(current)){
    const json = toJson(current[id]);
    if(known[id] !== json) upserts.push({ id, json });
  }
  return { upserts, deletes };
}

async function writeTable(uid, table, conflict, idCol, current, known, toRow){
  const { upserts, deletes } = diffRows(current, known);
  if(upserts.length){
    const now = new Date().toISOString();
    const rows = upserts.map(u => toRow(u.id, current[u.id], now));
    const { error } = await supabase.from(table).upsert(rows, { onConflict: conflict });
    if(error) throw error;
    upserts.forEach(u => { known[u.id] = u.json; });
  }
  if(deletes.length){
    const { error } = await supabase.from(table).delete().eq('user_id', uid).in(idCol, deletes);
    if(error) throw error;
    deletes.forEach(id => { delete known[id]; });
  }
}

async function doSave(){
  const uid = currentUserId;
  const known = synced;
  if(!Object.keys(state.programs).length && Object.keys(known.programs).length){
    onSaveState('Save blocked — your program list looks empty');
    return;
  }
  try{
    await writeTable(uid, 'programs', 'id', 'id', state.programs, known.programs,
      (id, data, now) => ({ id, user_id:uid, data, updated_at:now }));
    await writeTable(uid, 'progress', 'user_id,program_id', 'program_id', state.progress, known.progress,
      (id, data, now) => ({ user_id:uid, program_id:id, data, updated_at:now }));
    const logsById = Object.fromEntries(state.manualLogs.map(l => [l.id, l]));
    await writeTable(uid, 'manual_logs', 'id', 'id', logsById, known.logs,
      (id, data, now) => ({ id, user_id:uid, data, updated_at:now }));

    const active = state.activeProgramId || null;
    if(active !== known.activeProgramId){
      const { error } = await supabase.from('user_state').upsert(
        { user_id:uid, active_program_id:active, updated_at:new Date().toISOString() }
      );
      if(error) throw error;
      known.activeProgramId = active;
    }
    onSaveState('Saved ✓');
  }catch(err){
    console.error('Save error:', err);
    onSaveState('Could not save — check connection');
  }
}

export async function save(){
  if(!supabaseConfigured || !currentUserId) return;
  if(loadedFor !== currentUserId){
    onSaveState('Not saved — your data has not finished loading');
    return;
  }
  if(saving){ savePending = true; return saving; }
  saving = doSave();
  try{ await saving; }
  finally{
    saving = null;
    if(savePending){ savePending = false; save(); }
  }
}
export function queueSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(()=>{ save(); }, 600); }

function snapshotBackup(uid){
  try{ localStorage.setItem('split-backup-'+uid, JSON.stringify(exportData())); }catch(e){ /* storage unavailable */ }
}

export function exportData(){
  return {
    app: 'split',
    exportedAt: new Date().toISOString(),
    programs: state.programs,
    progress: state.progress,
    manualLogs: state.manualLogs,
    activeProgramId: state.activeProgramId,
  };
}

/* Resolves true only when this user's data is safely in memory and saving is
   enabled. On any doubt it resolves false and leaves the cloud untouched. */
export async function load(){
  const uid = currentUserId;
  loadedFor = null;
  synced = emptySynced();
  loadProblem = '';
  if(!supabaseConfigured || !uid) return false;

  const [programsRes, progressRes, logsRes, stateRes] = await Promise.all([
    supabase.from('programs').select('id,data').eq('user_id', uid),
    supabase.from('progress').select('program_id,data').eq('user_id', uid),
    supabase.from('manual_logs').select('id,data').eq('user_id', uid),
    supabase.from('user_state').select('active_program_id').eq('user_id', uid).maybeSingle(),
  ]);
  if(currentUserId !== uid) return false;

  const firstError = programsRes.error || progressRes.error || logsRes.error || stateRes.error;
  if(firstError){
    console.error('Load error:', firstError);
    loadProblem = "We couldn't load your data. Nothing has been changed or deleted.";
    return false;
  }

  const programRows = programsRes.data || [];
  const progressRows = progressRes.data || [];
  const logRows = logsRes.data || [];
  const hasUserState = !!stateRes.data;

  if(programRows.length || progressRows.length || logRows.length){
    state.programs = {}; state.progress = {}; state.manualLogs = [];
    programRows.forEach(r => { state.programs[r.id] = r.data; synced.programs[r.id] = toJson(r.data); });
    progressRows.forEach(r => { state.progress[r.program_id] = r.data; synced.progress[r.program_id] = toJson(r.data); });
    logRows.forEach(r => { state.manualLogs.push(r.data); synced.logs[r.id] = toJson(r.data); });
    const savedActive = stateRes.data?.active_program_id || null;
    synced.activeProgramId = savedActive;
    state.activeProgramId = (savedActive && state.programs[savedActive]) ? savedActive : (listPrograms()[0]?.id || null);
    loadedFor = uid;
    snapshotBackup(uid);
    return true;
  }

  if(!hasUserState){
    state.programs = {}; state.progress = {}; state.manualLogs = []; state.activeProgramId = null;
    seedPrograms.forEach(p => addProgram({ ...p, id: undefined }));
    loadedFor = uid;
    await save();
    return true;
  }

  loadProblem = 'Your account looks empty, which is unexpected. Saving is paused so nothing is overwritten.';
  return false;
}
