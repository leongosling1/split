export function isoDate(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
export function todayISO(){ return isoDate(new Date()); }
export function parseISO(s){ return new Date(s+'T00:00:00'); }
export function mondayOf(d){
  const dt=new Date(d); const day=(dt.getDay()+6)%7; dt.setDate(dt.getDate()-day); dt.setHours(0,0,0,0); return dt;
}
export function fmtShort(iso){
  const d=parseISO(iso);
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
export function relDate(iso){
  const today=parseISO(todayISO());
  const d=parseISO(iso);
  const diff=Math.round((today-d)/86400000);
  if(diff===0) return 'TODAY';
  if(diff===1) return 'YESTERDAY';
  if(diff>1 && diff<7) return `-${diff}D`;
  return fmtShort(iso).toUpperCase();
}
export function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
