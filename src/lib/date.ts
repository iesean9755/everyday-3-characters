export const todayKey=()=>{const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const dayDiff=(a:string,b:string)=>{const parse=(s:string)=>{const [y,m,d]=s.split('-').map(Number);return Date.UTC(y,m-1,d)};return Math.round((parse(b)-parse(a))/86400000)};
export const safeCourseIndex=(date:string)=>{const start='2026-01-01';return Math.abs(dayDiff(start,date))%30};
