import { seedPrograms } from './data/seedPrograms.js';
import { todayISO } from './utils/dates.js';
import { activityMinutes } from './metrics.js';
import { supabase, supabaseConfigured } from './supabase.js';

let currentUserId = null;
let currentUserName = '';
export function setCurrentUser(userId, name=''){ currentUserId = userId; currentUserName = name; }
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

function ensureProgress(programId){
  if(!state.progress[programId]){
    state.progress[programId] = { sessions:{}, sessionNotes:{}, phaseNotes:{}, sessionValues:{}, exerciseDone:{} };
  }
  const prog = state.progress[programId];
  if(!prog.exerciseDone) prog.exerciseDone = {};
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
        for(let ii=0; ii<act.count; ii++){
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
    for(let ii=0; ii<act.count; ii++){
      total++;
      const s = prog.sessions[sessionKey(pi,wi,ai,ii)];
      if(s && s.done) done++;
    }
  })));
  return { done, total };
}
export function currentProgramWeek(programId){
  const program = getProgram(programId);
  if(!program) return null;
  const prog = ensureProgress(programId);
  let weekCounter = 0;
  for(let pi=0; pi<program.phases.length; pi++){
    const p = program.phases[pi];
    for(let wi=0; wi<p.weeks.length; wi++){
      weekCounter++;
      const week = p.weeks[wi];
      let done=0, total=0;
      week.activities.forEach((act,ai)=>{ total+=act.count;
        for(let ii=0; ii<act.count; ii++){ const s=prog.sessions[sessionKey(pi,wi,ai,ii)]; if(s&&s.done) done++; } });
      if(done<total) return { pi, wi, phase:p, week, weekNum:weekCounter, done, total, totalWeeks: program.phases.reduce((s,ph)=>s+ph.weeks.length,0) };
    }
  }
  return null; // program complete
}

/* ---------------------------------------------------------------------
   MANUAL LOGS
--------------------------------------------------------------------- */
export function addManualLog({date, minutes, type, note}){
  state.manualLogs.push({ id:'m-'+Date.now(), date, minutes, type, note, ts:Date.now() });
}
export function deleteManualLog(id){
  state.manualLogs = state.manualLogs.filter(l=>l.id!==id);
}

/* ---------------------------------------------------------------------
   PERSISTENCE — Supabase, scoped to the signed-in user (setCurrentUser).
   Every save does a full delete+reinsert per table for this user rather
   than diffing/upserting row by row. That's the simplest way to make
   deletions (a removed program, a deleted log) actually take effect in
   the cloud without tracking a separate "pending deletes" list — and at
   this app's scale (a handful of programs, tens of logs) the cost of
   rewriting everything on every debounced save is negligible.
--------------------------------------------------------------------- */
let onSaveState = ()=>{};
export function onSave(cb){ onSaveState = cb; }

export async function save(){
  if(!supabaseConfigured || !currentUserId) return;
  try{
    const now = new Date().toISOString();

    await supabase.from('programs').delete().eq('user_id', currentUserId);
    const programRows = Object.values(state.programs).map(p=>(
      { id:p.id, user_id:currentUserId, data:p, updated_at:now }
    ));
    if(programRows.length){
      const { error } = await supabase.from('programs').insert(programRows);
      if(error) throw error;
    }

    await supabase.from('progress').delete().eq('user_id', currentUserId);
    const progressRows = Object.entries(state.progress).map(([programId,data])=>(
      { user_id:currentUserId, program_id:programId, data, updated_at:now }
    ));
    if(progressRows.length){
      const { error } = await supabase.from('progress').insert(progressRows);
      if(error) throw error;
    }

    await supabase.from('manual_logs').delete().eq('user_id', currentUserId);
    const logRows = state.manualLogs.map(l=>(
      { id:l.id, user_id:currentUserId, data:l, updated_at:now }
    ));
    if(logRows.length){
      const { error } = await supabase.from('manual_logs').insert(logRows);
      if(error) throw error;
    }

    const { error: usErr } = await supabase.from('user_state').upsert(
      { user_id:currentUserId, active_program_id: state.activeProgramId, updated_at: now }
    );
    if(usErr) throw usErr;

    onSaveState('Saved ✓');
  }catch(err){
    console.error('Save error:', err);
    onSaveState('Could not save — check connection');
  }
}
export function queueSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(()=>{ save(); }, 600); }

export async function load(){
  if(!supabaseConfigured || !currentUserId){
    state.programs = {}; state.progress = {}; state.manualLogs = []; state.activeProgramId = null;
    return;
  }

  const [programsRes, progressRes, logsRes, stateRes] = await Promise.all([
    supabase.from('programs').select('id,data').eq('user_id', currentUserId),
    supabase.from('progress').select('program_id,data').eq('user_id', currentUserId),
    supabase.from('manual_logs').select('id,data').eq('user_id', currentUserId),
    supabase.from('user_state').select('active_program_id').eq('user_id', currentUserId).maybeSingle(),
  ]);
  const firstError = programsRes.error || progressRes.error || logsRes.error || stateRes.error;
  if(firstError){
    console.error('Load error:', firstError);
    onSaveState('Could not load your data — check connection');
    state.programs = {}; state.progress = {}; state.manualLogs = []; state.activeProgramId = null;
    return;
  }

  if(programsRes.data && programsRes.data.length){
    state.programs = {};
    programsRes.data.forEach(r=>{ state.programs[r.id] = r.data; });
    state.progress = {};
    (progressRes.data||[]).forEach(r=>{ state.progress[r.program_id] = r.data; });
    state.manualLogs = (logsRes.data||[]).map(r=>r.data);
    state.activeProgramId = stateRes.data?.active_program_id || listPrograms()[0]?.id || null;
  }else{
    // first sign-in for this account — seed the default program library
    state.programs = {};
    state.progress = {};
    state.manualLogs = [];
    state.activeProgramId = null;
    seedPrograms.forEach(p=>addProgram(p));
    await save();
  }
}
