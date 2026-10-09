/* Sample data for demo builds only (VITE_DEMO=1): a fixed-days program
   that is part-way through week 2 as of the viewer's real "today", with
   one earlier day left unticked so the "Missed" state is visible. */
import { roadTo5k } from './seedPrograms.js';
import { isoDate } from '../utils/dates.js';

const mins = n => [{ label:'', metrics:[{ name:'Minutes', value:n }] }];
const lift = (label, kg, reps, sets) => ({ label, metrics:[{name:'KG',value:kg},{name:'Reps',value:reps},{name:'Sets',value:sets}] });

const MON=1, TUE=2, WED=3, THU=4, FRI=5, SAT=6;

function week(desc){
  return { desc, activities:[
    { label:'Gym — lower body', days:[MON], count:1, exercises:[lift('Leg Press',80,10,3), lift('Goblet Squat',16,12,3), lift('Calf Raises',40,15,3)] },
    { label:'Easy run', days:[TUE, FRI], count:2, exercises:mins(25) },
    { label:'Mobility', days:[WED, SAT], count:2, exercises:mins(15) },
    { label:'Gym — upper body', days:[THU], count:1, exercises:[lift('Bench Press',50,8,3), lift('Seated Row',45,10,3), lift('Shoulder Press',14,10,3)] },
    { label:'Long walk', days:[SAT], count:1, exercises:mins(60) },
  ]};
}

const regimented = {
  id: 'demo-regimented',
  name: 'Regimented 4-week starter',
  description: 'Every day is decided for you: gym, runs, mobility and rest, set to specific days.',
  builtin: false,
  schedule: { mode:'fixed', weekStart: MON },
  phases: [
    { title:'Build the habit', weeksLabel:'Weeks 1–2', goal:'Show up on the scheduled day. Keep weights light and runs conversational.',
      weeks:[ week('Same plan both weeks — just show up.'), week('Same plan both weeks — just show up.') ] },
    { title:'Step it up', weeksLabel:'Weeks 3–4', goal:'Add a little weight in the gym and a few minutes to each run.',
      weeks:[ week('Add 2.5kg to each lift.'), week('Add 5 minutes to each run.') ] },
  ],
};

export function buildDemoState(){
  const today = new Date();
  today.setHours(12,0,0,0);
  const order = [1,2,3,4,5,6,0];
  const dateOfDay = (weeksAgo, day) => {
    const d = new Date(today);
    d.setDate(d.getDate() - weeksAgo*7 + (order.indexOf(day) - order.indexOf(today.getDay())));
    return isoDate(d);
  };

  const sessions = {}, exerciseDone = {};
  const tick = (pi, wi, ai, day, date, exCount) => {
    const key = `${pi}-${wi}-${ai}-${day}`;
    sessions[key] = { done:true, date, ts: Date.parse(date) };
    if(exCount > 1){ exerciseDone[key] = {}; for(let e=0; e<exCount; e++) exerciseDone[key][e] = true; }
  };

  // Week 1: everything done, marked complete.
  regimented.phases[0].weeks[0].activities.forEach((act, ai) =>
    act.days.forEach(day => tick(0, 0, ai, day, dateOfDay(1, day), act.exercises.length)));

  // Week 2 (current): days before today are done, except the first one with
  // a workout, which is left as missed.
  const pastDays = order.slice(0, order.indexOf(today.getDay()));
  const missedDay = pastDays.find(day => regimented.phases[0].weeks[1].activities.some(a => a.days.includes(day)));
  regimented.phases[0].weeks[1].activities.forEach((act, ai) =>
    act.days.filter(day => pastDays.includes(day) && day !== missedDay)
      .forEach(day => tick(0, 1, ai, day, dateOfDay(0, day), act.exercises.length)));

  const fiveK = JSON.parse(JSON.stringify(roadTo5k));
  return {
    programs: { [regimented.id]: { ...regimented, createdAt: 2 }, [fiveK.id]: { ...fiveK, createdAt: 1 } },
    progress: {
      [regimented.id]: { sessions, sessionNotes:{}, phaseNotes:{}, sessionValues:{}, exerciseDone, weeksDone:{ '0-0': true } },
    },
    manualLogs: [
      { id:'m-demo-1', date: dateOfDay(1, 0), minutes: 45, type:'Padel', note:'', ts: 1 },
    ],
    activeProgramId: regimented.id,
  };
}
