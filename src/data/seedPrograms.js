/* ---------------------------------------------------------------------
   SEED PROGRAMS
   A program is: { id, name, description, phases }
   phases: [{ title, weeksLabel, goal, weeks: [{ desc, activities:
     [{ label, count, exercises: [{label, metrics:[{name,value}]}] }] }] }]

   `count` is how many times/week the activity should happen — it's
   structural: it decides how many session checkboxes render.
   `exercises` breaks the activity down into trackable sub-items. A
   simple activity (a run, a walk) has one exercise with an empty label,
   whose `metrics` is a free-form spreadsheet-style row (e.g. Minutes).
   A composite activity ("Gym session") has several named exercises,
   each with its own metrics (weight/reps/sets, etc). A metric named
   "Minutes" (case-insensitive) is summed across exercises to power the
   dashboard's time-based stats; any other metric is purely descriptive.
--------------------------------------------------------------------- */

function mins(n){ return [{ label:'', metrics:[{ name:'Minutes', value:n }] }]; }

export const roadTo5k = {
  id: 'road-to-5k',
  name: 'Road to 5K',
  description: 'A gradual 16-week walk-to-run progression for a first 5K.',
  builtin: true,
  phases: [
    { title:'Foundation', weeksLabel:'Weeks 1–4',
      goal:'Walking only — no running yet. Build tendon and ligament tolerance before adding impact. Strength work is capped at 2x/week, alongside walking — never on its own.',
      weeks:[
        { desc:'Walk 20–30 min, flat ground, 4–5x this week', activities:[
          { label:'Walk 20–30 min, flat ground', count:5, exercises:mins(25) } ] },
        { desc:'Walk 20–30 min, 4–5x + 2x strength: calf raises, ankle circles, glute bridges, wall sits, low step-ups', activities:[
          { label:'Walk 20–30 min', count:5, exercises:mins(25) },
          { label:'Strength: calf raises, ankle circles, glute bridges, wall sits, low step-ups', count:2, exercises:mins(20) } ] },
        { desc:'Walk 25–35 min, 4–5x + 2x strength', activities:[
          { label:'Walk 25–35 min', count:5, exercises:mins(30) },
          { label:'Strength session', count:2, exercises:mins(20) } ] },
        { desc:'Walk 25–35 min, 4–5x + 2x strength — check: pain-free by end of week?', activities:[
          { label:'Walk 25–35 min', count:5, exercises:mins(30) },
          { label:'Strength session', count:2, exercises:mins(20) },
          { label:'Pain-free check-in', count:1, exercises:mins(5) } ] }
      ]},
    { title:'Walk–Run Introduction', weeksLabel:'Weeks 5–8',
      goal:'Short, frequent jog intervals with full walk recovery — not pushing to continuous running yet. Strength stays capped at 2x/week, on top of walk/run days.',
      weeks:[
        { desc:'30 sec easy jog / 90 sec walk × 6–8, 3x this week + easy walks on off days', activities:[
          { label:'30 sec jog / 90 sec walk × 6–8', count:3, exercises:mins(20) },
          { label:'Easy walk (off day)', count:2, exercises:mins(25) } ] },
        { desc:'Same intervals, 3x + 2x strength (add single-leg balance for ankle stability)', activities:[
          { label:'Jog/walk intervals', count:3, exercises:mins(20) },
          { label:'Strength + single-leg balance', count:2, exercises:mins(20) } ] },
        { desc:'Same intervals, 3–4x + 2x strength', activities:[
          { label:'Jog/walk intervals', count:4, exercises:mins(22) },
          { label:'Strength session', count:2, exercises:mins(20) } ] },
        { desc:'Review week: any pain by minute 20? Note it below', activities:[
          { label:'Review run — any pain by minute 20?', count:1, exercises:mins(22) } ] }
      ]},
    { title:'Building Run Intervals', weeksLabel:'Weeks 9–16',
      goal:'Gradually shift the run:walk ratio. Apply the 10% rule — never raise weekly running time by more than ~10%. Strength stays capped at 2x/week.',
      weeks:[
        { desc:'1 min run / 2 min walk, repeated, 3–4x this week + 2x strength', activities:[
          { label:'1 min run / 2 min walk, repeated', count:4, exercises:mins(24) },
          { label:'Strength session', count:2, exercises:mins(20) } ] },
        { desc:'2 min run / 2 min walk, repeated, 3–4x this week + 2x strength', activities:[
          { label:'2 min run / 2 min walk, repeated', count:4, exercises:mins(24) },
          { label:'Strength session', count:2, exercises:mins(20) } ] },
        { desc:'3 min run / 1 min walk, repeated, 3–4x this week + 2x strength', activities:[
          { label:'3 min run / 1 min walk, repeated', count:4, exercises:mins(24) },
          { label:'Strength session', count:2, exercises:mins(20) } ] },
        { desc:'Hold steady if any soreness lingers past 48 hrs; keep running 3–4x + 2x strength', activities:[
          { label:'Run (hold ratio steady if sore)', count:4, exercises:mins(24) },
          { label:'Strength session', count:2, exercises:mins(20) } ] }
      ]},
    { title:'Continuous Running', weeksLabel:'Weeks 17–24+',
      goal:'Extend continuous running in small steps and add one longer, easier session. Strength stays capped at 2x/week.',
      weeks:[
        { desc:'Continuous run: 5 min blocks, rest walk, repeat — 3–4x this week + 2x strength', activities:[
          { label:'Continuous run: 5 min blocks', count:4, exercises:mins(22) },
          { label:'Strength session', count:2, exercises:mins(20) } ] },
        { desc:'Continuous run: 8 min blocks, 3–4x this week + 2x strength', activities:[
          { label:'Continuous run: 8 min blocks', count:4, exercises:mins(26) },
          { label:'Strength session', count:2, exercises:mins(20) } ] },
        { desc:'Continuous run: 12 min + one longer/slower weekly session, + 2x strength', activities:[
          { label:'Continuous run: 12 min', count:4, exercises:mins(28) },
          { label:'Longer, slower session', count:1, exercises:mins(40) },
          { label:'Strength session', count:2, exercises:mins(20) } ] },
        { desc:'Build toward 30 minutes of continuous running, 3–4x this week + 2x strength', activities:[
          { label:'Continuous run toward 30 min', count:4, exercises:mins(30) },
          { label:'Strength session', count:2, exercises:mins(20) } ] }
      ]}
  ]
};

export const strengthExample = {
  id: 'strength-example',
  name: 'Strength Basics (example)',
  description: 'A sample program showing composite activities — a "Gym session" broken down into individual exercises, each with its own weight/reps/sets.',
  builtin: true,
  phases: [
    { title:'Block 1', weeksLabel:'Weeks 1–4',
      goal:'Learn the lifts with light, consistent load.',
      weeks:[
        { desc:'Padel once a week, gym twice a week', activities:[
          { label:'Padel', count:1, exercises:mins(90) },
          { label:'Gym session', count:2, exercises:[
            { label:'Leg Press', metrics:[{name:'KG',value:80},{name:'Reps',value:10},{name:'Sets',value:3}] },
            { label:'Calf Raises', metrics:[{name:'KG',value:40},{name:'Reps',value:15},{name:'Sets',value:3}] },
            { label:'Cable Curl', metrics:[{name:'KG',value:30},{name:'Reps',value:15},{name:'Sets',value:3}] },
            { label:'Goblet Squat', metrics:[{name:'KG',value:16},{name:'Reps',value:12},{name:'Sets',value:3}] }
          ]}
        ]}
      ]}
  ]
};

export const seedPrograms = [roadTo5k, strengthExample];
