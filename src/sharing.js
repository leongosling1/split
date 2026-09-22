import { supabase } from './supabase.js';
import { getCurrentUserId, getSession, getSessionNote, getSessionValue } from './state.js';

function newShareId(){
  return crypto.randomUUID().replace(/-/g, '');
}
export function shareUrl(id){
  return `${location.origin}${location.pathname}?share=${id}`;
}

/* ---------------------------------------------------------------------
   SHARE A PROGRAM — a frozen copy of the plan only (no progress). The
   recipient imports it as a brand-new program in their own library.
--------------------------------------------------------------------- */
export async function createProgramShare(program, createdByName){
  const id = newShareId();
  const payload = {
    name: program.name,
    description: program.description,
    phases: program.phases,
  };
  const { error } = await supabase.from('shares').insert({
    id, kind: 'program', created_by: getCurrentUserId(), created_by_name: createdByName || null, payload,
  });
  if(error) throw error;
  return id;
}

/* ---------------------------------------------------------------------
   SHARE A WEEK'S PROGRESS — a frozen, read-only snapshot of exactly
   what's rendered on the Programs page for that week: per activity,
   per exercise, per session — target values, logged actuals, done
   state, and notes. The viewer never needs the original program.
--------------------------------------------------------------------- */
export function buildWeekSnapshot(program, pi, wi){
  const phase = program.phases[pi];
  const week = phase.weeks[wi];
  let weekNum = 0;
  for(let p=0; p<=pi; p++){
    const upTo = p===pi ? wi+1 : program.phases[p].weeks.length;
    weekNum += upTo;
  }

  const activities = week.activities.map((act,ai)=>{
    const sessions = [];
    for(let ii=0; ii<act.count; ii++){
      const key = `${pi}-${wi}-${ai}-${ii}`;
      const s = getSession(program.id, key);
      const values = act.exercises.map((ex,ei)=>
        ex.metrics.map((m,mi)=>{
          const actual = getSessionValue(program.id, key, ei, mi);
          return { name: m.name, target: m.value, actual: actual!=='' ? actual : null };
        })
      );
      sessions.push({ n: ii+1, done: !!(s && s.done), date: s?.date || null, note: getSessionNote(program.id, key), values });
    }
    return {
      label: act.label,
      count: act.count,
      exercises: act.exercises.map(ex=>({ label: ex.label, metrics: ex.metrics })),
      sessions,
    };
  });

  return {
    programName: program.name,
    phaseTitle: phase.title,
    weekNum,
    weekDesc: week.desc,
    activities,
    sharedAt: new Date().toISOString(),
  };
}

export async function createProgressShare(snapshot, createdByName){
  const id = newShareId();
  const { error } = await supabase.from('shares').insert({
    id, kind: 'progress', created_by: getCurrentUserId(), created_by_name: createdByName || null, payload: snapshot,
  });
  if(error) throw error;
  return id;
}

/* ---------------------------------------------------------------------
   READ A SHARE — public: works whether or not the viewer is signed in.
--------------------------------------------------------------------- */
export async function fetchShare(id){
  const { data, error } = await supabase.from('shares')
    .select('kind,payload,created_by_name,created_at')
    .eq('id', id)
    .maybeSingle();
  if(error){ console.error('Share fetch error:', error); return null; }
  return data;
}
