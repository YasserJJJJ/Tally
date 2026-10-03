export type Profile = { name: string; height_cm: number; weight_kg: number; age: number; body_fat: number | null; difficulty_gain: boolean; difficulty_lose: boolean; activity_type: SportType; activity_sessions_per_week: number; goal: 'gain' | 'lose' | 'maintain'; pace: number; baseline_calories: number };
export type SportType = 'none' | 'strength' | 'endurance' | 'team' | 'other';
export type Entry = { date: string; weight: number | null; calories: number | null; sport_type?: SportType | null; activity_minutes?: number | null };
export type Journal = { account_name?: string; profile: Profile | null; entries: Entry[] };
export type Recommendation = { target: number; status: 'baseline' | 'collecting' | 'uncertain' | 'experimental'; samples: number; reason: string; validation_mae?: number; model_features?: 'calories' | 'calories_and_sport' };
export const defaultProfile: Profile = { name: 'Alex', height_cm: 175, weight_kg: 68.4, age: 25, body_fat: 18, difficulty_gain: true, difficulty_lose: false, activity_type: 'none', activity_sessions_per_week: 0, goal: 'gain', pace: 0.2, baseline_calories: 2500 };
export function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function parseDate(s: string) { return new Date(`${s}T12:00:00`); }
export function addDays(s: string, n: number) { const d=parseDate(s); d.setDate(d.getDate()+n); return dateKey(d); }
export function monday(s: string) { const d=parseDate(s); d.setDate(d.getDate()-((d.getDay()+6)%7)); return dateKey(d); }
export function average(values: (number | null | undefined)[]) { const v=values.filter((n):n is number=>n!=null); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; }
export function weekly(entries: Entry[], start: string) { const days=Array.from({length:7},(_,i)=>entries.find(e=>e.date===addDays(start,i))); return {days, weight:average(days.map(e=>e?.weight)), calories:average(days.map(e=>e?.calories)), weights:days.filter(e=>e?.weight!=null).length, meals:days.filter(e=>e?.calories!=null).length, activity_minutes:days.reduce((total,e)=>total+(e?.activity_minutes??0),0)}; }
export function sampleJournal(today: string): Journal {
 const start=addDays(monday(today),-28); const entries: Entry[]=[];
 for(let i=0;i<35;i++){const date=addDays(start,i);if(date>=today)break;entries.push({date,weight:Math.round((67.65+i*0.027+[0.1,-0.08,0.02,0.13,-0.1,0.06,-0.03][i%7])*10)/10,calories:Math.round((2430+[80,-100,140,50,-40,170,-10][i%7]+Math.floor(i/7)*20)/10)*10});}
 return {profile:{...defaultProfile},entries};
}
export function recommend(profile: Profile, entries: Entry[], before: string): Recommendation {
 const result: Recommendation={target:profile.baseline_calories,status:'collecting',samples:0,reason:'Keep your starting target while you build a consistent history.'};
 const groups=[...new Set(entries.filter(e=>e.date<before).map(e=>monday(e.date)))].sort();
 const samples: {x:number;y:number}[]=[];
 for(const start of groups){ if(addDays(start,7)>before)continue;const prev=weekly(entries,addDays(start,-7)),curr=weekly(entries,start);if(prev.weights>=5&&curr.weights>=5&&curr.meals>=5)samples.push({x:curr.calories!,y:curr.weight!-prev.weight!}); }
 const recent=samples.slice(-12);result.samples=recent.length;
 if(recent.length<6)return result;
 function fit(data: {x:number;y:number}[]){const mx=average(data.map(s=>s.x))!,my=average(data.map(s=>s.y))!;const covariance=data.reduce((a,s)=>a+(s.x-mx)*(s.y-my),0),variance=data.reduce((a,s)=>a+(s.x-mx)**2,0);const slope=covariance/(variance+40000);return {slope,intercept:my-slope*mx,mx,my,sd:Math.sqrt(variance/data.length)};}
 const train=recent.slice(0,-2),test=recent.slice(-2),model=fit(train);
 const mae=average(test.map(s=>Math.abs(s.y-(model.intercept+model.slope*s.x))))!,naive=average(test.map(s=>Math.abs(s.y-model.my)))!;
 const final=fit(recent);
 if(model.sd<100||final.slope<0.0002||final.slope>0.002||mae>=naive||mae>0.35)return {...result,status:'uncertain',reason:'The pattern is not reliable yet. Your starting target stays in place.'};
 const goal=profile.goal==='maintain'?0:profile.pace*(profile.goal==='gain'?1:-1);
 const estimate=(goal-final.intercept)/final.slope;
 if(!Number.isFinite(estimate)||estimate<1500||estimate>4500)return {...result,status:'uncertain',reason:'The estimate is outside the supported planning range. Keep your starting target.'};
 return {...result,target:Math.round(Math.max(profile.baseline_calories-100,Math.min(profile.baseline_calories+100,estimate))/25)*25,status:'experimental',reason:'An experimental estimate from your history, limited to a 100 kcal change from your starting target.',validation_mae:mae};
}
