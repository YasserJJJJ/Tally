'use client';

import { useCallback, useEffect, useState, useRef, Fragment } from 'react';
import { Activity, Plus, ChevronLeft, ChevronRight, Check, Sparkles, Flame, TrendingUp, Scale, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Toaster, toast } from 'sonner';
import { type Journal, type Profile, type Entry, type SportType, type Recommendation, defaultProfile, dateKey, parseDate, addDays, monday, weekly, recommend } from '@/lib/journal';

import { WelcomeScreen, AccountForm, ForgotPasswordForm, ResetPasswordForm, ProfileSetup, type AccountDetails } from '@/components/account-flow';
import { DashboardSidebar } from '@/components/dashboard-sidebar';

type Screen = 'loading' | 'welcome' | 'login' | 'signup' | 'forgot' | 'reset' | 'onboarding' | 'dashboard' | 'service-error';
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const fmt=(n:number)=>new Intl.NumberFormat('en-US').format(n);
const monthDay=(s:string)=>parseDate(s).toLocaleDateString('en-US',{month:'short',day:'numeric'});
class ApiError extends Error {
 constructor(message:string, public status:number) { super(message); }
}
async function api<T=Record<string,unknown>>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch(`/api/${path}`,{method,cache:'no-store',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await response.json() as T & {detail?:unknown};
 if(!response.ok){
  const detail=data.detail;
  const message=typeof detail==='string'?detail:Array.isArray(detail)?detail.map((item:{msg?:string})=>item.msg?.replace(/^Value error, /,'')).filter(Boolean).join(' '):'Unable to save. Please try again.';
  throw new ApiError(message,response.status);
 }
 return data as T;
}

export default function Home(){
 const [today,setToday]=useState('2026-10-01');
 const [journal,setJournal]=useState<Journal>({profile:null,entries:[]});
 const [screen,setScreen]=useState<Screen>('loading'),[sessionVersion,setSessionVersion]=useState(0);
 const [offset,setOffset]=useState(0),[logDate,setLogDate]=useState<string|null>(null),[profileOpen,setProfileOpen]=useState(false),[resetOpen,setResetOpen]=useState(false),[modelOpen,setModelOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [weight,setWeight]=useState(''),[calories,setCalories]=useState(''),[steps,setSteps]=useState(''),[sportType,setSportType]=useState<SportType | 'unreported'>('unreported'),[activityMinutes,setActivityMinutes]=useState('');
 const [draft,setDraft]=useState<Profile>({...defaultProfile}),[resetToken,setResetToken]=useState('');
 const profile={...defaultProfile,...journal.profile,name:journal.account_name??journal.profile?.name??''};
 const [remoteRecommendation,setRemoteRecommendation]=useState<Recommendation|null>(null);
 useEffect(()=>{
  // Password reset links carry the token in the URL fragment; take it and remove it from the address bar and history.
  // Listening for hashchange covers links opened in a tab where Tally is already loaded.
  function takeResetToken(){
   const resetLink=/^#reset=([\w-]{20,200})$/.exec(window.location.hash);
   if(resetLink){window.history.replaceState(null,'',window.location.pathname+window.location.search);setError('');setResetToken(resetLink[1]);}
  }
  takeResetToken();
  window.addEventListener('hashchange',takeResetToken);
  return()=>window.removeEventListener('hashchange',takeResetToken);
 },[]);
 useEffect(()=>{
  let active=true;
  setToday(dateKey(new Date()));
  if(resetToken){setScreen('reset');return;}
  setScreen('loading');setError('');
  async function restoreSession(){
   try{
    const config=await api<{connected:boolean}>('config');
    if(!config.connected)throw new Error('Sign-in is temporarily unavailable. Please try again shortly.');
    const data=await api<Journal>('journal');
    if(!active)return;
    setJournal(data);setScreen(data.profile?'dashboard':'onboarding');
   }catch(e){
    if(!active)return;
    if(e instanceof ApiError&&e.status===401){setJournal({profile:null,entries:[]});setScreen('welcome');}
    else {setError(e instanceof Error?e.message:'Could not connect. Please try again.');setScreen('service-error');}
   }
  }
  void restoreSession();
  return()=>{active=false;};
 },[sessionVersion,resetToken]);
 const base=addDays(monday(today),offset*7),starts=Array.from({length:5},(_,i)=>addDays(base,-i*7));
 const current=weekly(journal.entries,monday(today)),previous=weekly(journal.entries,addDays(monday(today),-7));
 const recommendation=recommend(profile,journal.entries,monday(today));
 useEffect(()=>{
  let active=true;setRemoteRecommendation(null);
  if(screen==='dashboard'&&journal.profile)api<Recommendation>(`recommendation?before=${monday(today)}`).then(data=>{if(active)setRemoteRecommendation(data);}).catch(()=>{});
  return()=>{active=false;};
 },[journal,screen,today]);
 const activeRecommendation=remoteRecommendation??recommendation;
 const change=current.weight!=null&&previous.weight!=null?current.weight-previous.weight:null;
 function openLog(date:string){setError('');const entry=journal.entries.find(e=>e.date===date);setWeight(entry?.weight?.toString()??'');setCalories(entry?.calories?.toString()??'');setSteps(entry?.steps?.toString()??'');setSportType(entry?.sport_type??'unreported');setActivityMinutes(entry?.activity_minutes?.toString()??'');setLogDate(date);}
 const saveEntry=useCallback(async(entry:Entry)=>{
  if(screen!=='dashboard')throw new Error('Sign in and complete your profile first.');
  if(entry.date>dateKey(new Date()))throw new Error('Choose today or an earlier day.');
  if(entry.weight!==null&&(!Number.isFinite(entry.weight)||entry.weight<25||entry.weight>350))throw new Error('Enter a weight between 25 and 350 kg.');
  if(entry.calories!==null&&(!Number.isInteger(entry.calories)||entry.calories<0||entry.calories>15000))throw new Error('Enter whole calories between 0 and 15,000.');
  if(entry.steps!==undefined&&entry.steps!==null&&(!Number.isInteger(entry.steps)||entry.steps<0||entry.steps>100000))throw new Error('Enter whole steps between 0 and 100,000.');
  if(entry.sport_type!==undefined){const sport=entry.sport_type,minutes=entry.activity_minutes;if((sport===null&&minutes!==null)||(sport==='none'&&minutes!==0)||(sport!==null&&sport!=='none'&&(!Number.isInteger(minutes)||minutes===undefined||minutes===null||minutes<1||minutes>600)))throw new Error('Choose a sport and 1–600 minutes, or select no sport.');}
  const previous=journal.entries.find(e=>e.date===entry.date);const saved={...previous,...entry};
  await api(`entries/${entry.date}`,'PUT',saved);
  setJournal(j=>({...j,entries:[...j.entries.filter(e=>e.date!==entry.date),saved].sort((a,b)=>a.date.localeCompare(b.date))}));
  return {saved:true,date:entry.date};
 },[journal.entries,screen]);
 const toolState=useRef({journal,recommendation:activeRecommendation,saveEntry});toolState.current={journal,recommendation:activeRecommendation,saveEntry};
 useEffect(()=>{
  if(screen!=='dashboard')return;
  const context=(document as Document&{modelContext?:{registerTool:(t:unknown,o:unknown)=>Promise<void>|void}}).modelContext;if(!context)return;
  const lifecycle=new AbortController();
  const tools=[{name:'read_weekly_journal',title:'Read weekly journal',description:'Read the signed-in profile, daily entries, and current calorie estimate.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({mode:'account',journal:toolState.current.journal,recommendation:toolState.current.recommendation})},{name:'save_daily_log',title:'Save daily log',description:'Save weight, calories, and optional steps for one day in the signed-in journal.',inputSchema:{type:'object',properties:{date:{type:'string',format:'date'},weight:{type:['number','null']},calories:{type:['integer','null']},steps:{type:['integer','null']}},required:['date','weight','calories'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async(input:unknown)=>{const e=input as Entry;if(!e||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||dateKey(parseDate(e.date))!==e.date||!('weight'in e)||!('calories'in e))throw new Error('Invalid daily log.');return toolState.current.saveEntry(e);}}];
  for(const t of tools)try{void Promise.resolve(context.registerTool(t,{signal:lifecycle.signal})).catch(()=>{});}catch{}
  return()=>lifecycle.abort();
 },[screen]);
 async function submitLog(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await saveEntry({date:logDate!,weight:weight===''?null:Number(weight),calories:calories===''?null:Number(calories),steps:steps===''?null:Number(steps),sport_type:sportType==='unreported'?null:sportType,activity_minutes:sportType==='unreported'?null:sportType==='none'?0:activityMinutes===''?null:Number(activityMinutes)});setLogDate(null);toast.success('Check-in saved');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function persistProfile(nextProfile:Profile){
  setBusy(true);setError('');
  try{const saved=await api<Profile>('profile','PUT',nextProfile);setJournal(j=>({...j,profile:saved,account_name:saved.name}));setProfileOpen(false);setScreen('dashboard');toast.success('Profile saved');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function saveProfile(e:React.FormEvent){e.preventDefault();await persistProfile(draft);}
 async function submitAuth(details:AccountDetails,kind:'login'|'signup'){
  setBusy(true);setError('');
  try{const result=await api<{name:string}>(`auth/${kind}`,'POST',details);const data=await api<Journal>('journal');setJournal({...data,account_name:data.account_name??result.name});setOffset(0);setScreen(data.profile?'dashboard':'onboarding');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function requestPasswordReset(email:string){
  setBusy(true);setError('');
  try{await api('auth/forgot-password','POST',{email});return true;}
  catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
 }
 async function saveNewPassword(password:string,confirmation:string){
  setBusy(true);setError('');
  // Clearing the token reloads the now signed-in session.
  try{await api('auth/reset-password','POST',{token:resetToken,password,confirm_password:confirmation});setOffset(0);setResetToken('');toast.success('Your password has been updated');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 function navigateAuth(next:Screen){setError('');setScreen(next);}
 function editProfile(){setDraft({...profile});setError('');setProfileOpen(true);}
 async function signout(){
  setBusy(true);setError('');
  try{await api('auth/logout','POST',{});setJournal({profile:null,entries:[]});setRemoteRecommendation(null);setLogDate(null);setProfileOpen(false);setModelOpen(false);setResetOpen(false);setOffset(0);setScreen('welcome');}
  catch(e){setError((e as Error).message);toast.error('Could not sign out. Try again.');}finally{setBusy(false);}
 }
 async function resetJournal(){
  setBusy(true);setError('');
  try{await api('entries','DELETE',{confirm:true});setJournal(j=>({...j,entries:[]}));setRemoteRecommendation(null);setOffset(0);setResetOpen(false);toast.success('Your journal is ready for your first check-in');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 if(screen!=='dashboard')return <><Toaster position="bottom-center" richColors/>
  {screen==='loading'?<main className="auth-shell"><div className="session-loading" role="status"><Loader2 className="animate-spin" size={26}/><span>Opening Tally…</span></div></main>:null}
  {screen==='service-error'?<main className="auth-shell"><div className="auth-card"><h1>Let’s try again.</h1><p role="alert" className="auth-description">{error}</p><Button className="full-button" onClick={()=>setSessionVersion(v=>v+1)}>Try again</Button></div></main>:null}
  {screen==='welcome'?<WelcomeScreen onChoose={navigateAuth}/>:null}
  {screen==='login'||screen==='signup'?<AccountForm key={screen} kind={screen} busy={busy} error={error} onBack={()=>navigateAuth('welcome')} onSwitch={()=>navigateAuth(screen==='login'?'signup':'login')} onForgot={()=>navigateAuth('forgot')} onSubmit={details=>submitAuth(details,screen)}/>:null}
  {screen==='forgot'?<ForgotPasswordForm busy={busy} error={error} onBack={()=>navigateAuth('login')} onSubmit={requestPasswordReset}/>:null}
  {screen==='reset'?<ResetPasswordForm busy={busy} error={error} onCancel={()=>setResetToken('')} onSubmit={saveNewPassword}/>:null}
  {screen==='onboarding'?<ProfileSetup name={journal.account_name??''} busy={busy} error={error} onSubmit={persistProfile} onSignOut={signout}/>:null}
 </>;
 return <div className="app-shell dashboard-shell"><Toaster position="bottom-center" richColors/>
 <DashboardSidebar name={profile.name} busy={busy} onProfile={editProfile} onReset={()=>{setError('');setResetOpen(true);}} onSignOut={signout}/>
 <main className="dashboard-main">
 <section className="page-heading"><div><p className="eyebrow">{parseDate(today).toLocaleDateString('en-US',{month:'long',year:'numeric'}).toUpperCase()}</p><h1>Your weekly journal<span>.</span></h1><p className="heading-sub">Daily weight, calorie, and step check-ins, one week at a time.</p></div><Button className="log-today" onClick={()=>openLog(today)}><Plus size={18}/>Log today</Button></section>
 <section className="summary-grid" aria-label="This week at a glance"><div className="stat"><div className="stat-label"><Scale size={17}/>Average weight<span>This week</span></div><div className="stat-value">{current.weight?.toFixed(1)??'—'}<span>kg</span></div><p>{change!==null?<><span className="blue-text">{change>=0?'+':''}{change.toFixed(2)} kg</span> vs. last week</>:'Log your weight to see your weekly average'}</p></div><div className="stat"><div className="stat-label"><Flame size={17}/>Average calories<span>This week</span></div><div className="stat-value">{current.calories!==null?fmt(Math.round(current.calories)):'—'}<span>kcal</span></div><p>{current.meals} of 7 days logged<span className="mini-bars">{days.map((_,i)=><i className={current.days[i]?.calories!=null?'filled':''} key={i}/>)}</span></p></div><div className="stat target-stat"><div className="stat-label"><Sparkles size={17}/>Daily calorie target<span className="target-badge">{activeRecommendation.status==='experimental'?'Experimental':'Starting target'}</span></div><div className="stat-value">{fmt(activeRecommendation.target)}<span>kcal</span></div><button onClick={()=>setModelOpen(true)}>{activeRecommendation.status==='experimental'?'Review your estimate':'Learning from your check-ins'}<Info size={14}/></button></div></section>
 <section className="journal-section"><div className="journal-toolbar"><div className="journal-title"><h2>Weekly overview</h2><span className="goal-pill"><TrendingUp size={14}/>{profile.goal==='maintain'?'Maintain weight':`${profile.goal==='gain'?'Gain':'Lose'} ${profile.pace} kg / week`}</span></div><div className="journal-controls"><button className="icon-button" aria-label="Show older weeks" onClick={()=>setOffset(o=>o-5)}><ChevronLeft size={18}/></button><span>{monthDay(addDays(base,-28))} – {monthDay(addDays(base,6))}</span><button className="icon-button" aria-label="Show newer weeks" disabled={offset===0} onClick={()=>setOffset(o=>Math.min(0,o+5))}><ChevronRight size={18}/></button></div></div>
 <div className="journal-table"><Table><TableHeader><TableRow>{days.map(day=><TableHead key={day}>{day}</TableHead>)}<TableHead className="average-head">Weekly average</TableHead><TableHead className="target-head"><Sparkles size={14}/>Adjusted target</TableHead></TableRow></TableHeader><TableBody>{starts.map(start=>{const w=weekly(journal.entries,start),r=start===monday(today)?activeRecommendation:recommend(profile,journal.entries,start),isCurrent=start===monday(today);return <Fragment key={start}><TableRow className="week-label-row"><TableCell colSpan={9}><span>{monthDay(start)} – {monthDay(addDays(start,6))}</span>{isCurrent?<span className="this-week">This week</span>:null}<span className="week-coverage">{w.weights} weigh-ins · {w.meals} calorie logs · {w.step_logs} step logs{w.activity_minutes>0?` · ${w.activity_minutes} sport min`:''}</span></TableCell></TableRow><TableRow className={isCurrent?'data-row current-row':'data-row'}>{days.map((day,i)=>{const date=addDays(start,i),entry=w.days[i],future=date>today;return <TableCell key={date} className={`${date===today?'today-cell':''} ${future?'future-cell':''}`}><button className="day-cell" onClick={()=>openLog(date)} disabled={future} aria-label={`Edit ${day}, ${monthDay(date)}: ${entry?.weight??'no'} kg, ${entry?.calories??'no'} calories, ${entry?.steps??'no'} steps`}><span className="cell-date">{parseDate(date).getDate()}{date===today?<span>Today</span>:null}</span><span className={`cell-weight ${entry?.weight==null?'empty-value':''}`}>{entry?.weight!=null?entry.weight.toFixed(1):'—'}<small>kg</small></span><span className={`cell-calories ${entry?.calories==null?'empty-value':''}`}>{entry?.calories!=null?fmt(entry.calories):future?'—':<span className="add-entry">+ Add</span>}<small>kcal</small></span><span className={`cell-steps ${entry?.steps==null?'empty-value':''}`}>{entry?.steps!=null?fmt(entry.steps):'—'}<small>steps</small></span></button></TableCell>;})}<TableCell className="average-cell"><span className="cell-date">{isCurrent?'So far':'Week average'}</span><span className="cell-weight">{w.weight?.toFixed(1)??'—'}<small>kg</small></span><span className="cell-calories">{w.calories!==null?fmt(Math.round(w.calories)):'—'}<small>kcal</small></span><span className="cell-steps">{w.steps!==null?fmt(Math.round(w.steps)):'—'}<small>steps / day</small></span></TableCell><TableCell className="target-cell"><button onClick={()=>setModelOpen(true)}><span className="cell-date">Daily calories</span><strong>{fmt(r.target)}</strong><small>kcal / day</small><span className="model-state">{r.status==='experimental'?'Experimental':r.status==='uncertain'?'More data needed':'Starting target'}</span></button></TableCell></TableRow></Fragment>;})}</TableBody></Table></div>
 <div className="table-footnote"><span><span className="legend-dot"/>Weight, calories, then steps. Click a day to check in.</span><span>Missing days are excluded from averages.</span></div></section>
 </main>
 <Dialog open={logDate!==null} onOpenChange={o=>{if(!o)setLogDate(null);}}><DialogContent className="tally-dialog sm:max-w-[440px]"><div className="dialog-icon"><Plus size={23}/></div><DialogTitle className="dialog-title">Your daily check-in</DialogTitle><DialogDescription>{logDate?parseDate(logDate).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}):''}</DialogDescription><form onSubmit={submitLog} className="form-stack"><label htmlFor="daily-weight">Weight <span>kg</span></label><Input autoFocus id="daily-weight" type="number" min="25" max="350" step="0.1" placeholder="e.g. 68.4" value={weight} onChange={e=>setWeight(e.target.value)}/><label htmlFor="daily-calories">Calories consumed <span>kcal</span></label><Input id="daily-calories" type="number" min="0" max="15000" step="1" placeholder="e.g. 2,500" value={calories} onChange={e=>setCalories(e.target.value)}/><div className="field"><Label htmlFor="daily-steps">Steps walked</Label><Input id="daily-steps" type="number" min="0" max="100000" step="1" placeholder="e.g. 8000" value={steps} onChange={e=>setSteps(e.target.value)}/></div><div className="field"><Label htmlFor="daily-sport">Sport today</Label><Select value={sportType} onValueChange={v=>{setSportType(v as SportType | 'unreported');setActivityMinutes('');}}><SelectTrigger id="daily-sport" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unreported">Not logged</SelectItem><SelectItem value="none">No sport</SelectItem><SelectItem value="strength">Strength training</SelectItem><SelectItem value="endurance">Running, cycling or other cardio</SelectItem><SelectItem value="team">Team sport</SelectItem><SelectItem value="other">Other activity</SelectItem></SelectContent></Select></div>{sportType!=='unreported'&&sportType!=='none'?<div className="field"><Label htmlFor="daily-activity">Time spent (minutes)</Label><Input id="daily-activity" required type="number" min="1" max="600" step="1" placeholder="e.g. 45" value={activityMinutes} onChange={e=>setActivityMinutes(e.target.value)}/></div>:null}<p className="form-hint">Log sport even on rest days to build a complete weekly history. Clear weight, calories, or steps to remove those values. Zero steps is a valid log.</p>{error?<p role="alert" className="form-error">{error}</p>:null}<Button type="submit" disabled={busy} className="full-button">{busy?<Loader2 className="animate-spin" size={16}/>:<Check size={17}/>}Save check-in</Button></form></DialogContent></Dialog>
 <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent className="tally-dialog profile-dialog sm:max-w-[570px]"><DialogTitle className="dialog-title">Your profile & goals</DialogTitle><DialogDescription>Start with your measurements and the daily calorie target you want to follow.</DialogDescription><form className="form-stack" onSubmit={saveProfile}><div className="field"><Label htmlFor="profile-name">Name</Label><Input required id="profile-name" value={draft.name} maxLength={80} onChange={e=>setDraft({...draft,name:e.target.value})}/></div><div className="form-grid">{([{key:'height_cm',label:'Height (cm)',min:100,max:250,step:1},{key:'weight_kg',label:'Starting weight (kg)',min:25,max:350,step:0.1},{key:'age',label:'Age',min:18,max:100,step:1},{key:'body_fat',label:'Body fat (%) · optional',min:3,max:65,step:0.1}] as const).map(f=><div className="field" key={f.key}><Label htmlFor={f.key}>{f.label}</Label><Input id={f.key} type="number" required={f.key!=='body_fat'} min={f.min} max={f.max} step={f.step} value={draft[f.key]??''} onChange={e=>setDraft({...draft,[f.key]:e.target.value===''?null:Number(e.target.value)})}/></div>)}</div><div className="switch-row"><Label htmlFor="gain-difficulty">Do you find it difficult to gain weight?</Label><span>{draft.difficulty_gain?'Yes':'No'}<Switch id="gain-difficulty" checked={draft.difficulty_gain} onCheckedChange={v=>setDraft({...draft,difficulty_gain:v})}/></span></div><div className="switch-row"><Label htmlFor="lose-difficulty">Do you find it difficult to lose weight?</Label><span>{draft.difficulty_lose?'Yes':'No'}<Switch id="lose-difficulty" checked={draft.difficulty_lose} onCheckedChange={v=>setDraft({...draft,difficulty_lose:v})}/></span></div><div className="field"><Label htmlFor="profile-activity">Main activity</Label><Select value={draft.activity_type} onValueChange={v=>setDraft({...draft,activity_type:v as SportType,activity_sessions_per_week:v==='none'?0:draft.activity_sessions_per_week||3})}><SelectTrigger id="profile-activity" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">No regular activity</SelectItem><SelectItem value="strength">Strength training</SelectItem><SelectItem value="endurance">Running, cycling or other cardio</SelectItem><SelectItem value="team">Team sport</SelectItem><SelectItem value="other">Other activity</SelectItem></SelectContent></Select></div><div className="field"><Label htmlFor="profile-activity-frequency">Sessions per week</Label><Input id="profile-activity-frequency" type="number" min="1" max="7" step="1" required={draft.activity_type!=='none'} disabled={draft.activity_type==='none'} value={draft.activity_sessions_per_week} onChange={e=>setDraft({...draft,activity_sessions_per_week:Number(e.target.value)})}/></div><div className="field"><Label htmlFor="goal">Your goal</Label><Select value={draft.goal} onValueChange={v=>setDraft({...draft,goal:v as Profile['goal']})}><SelectTrigger id="goal" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="gain">Gain weight</SelectItem><SelectItem value="lose">Lose weight</SelectItem><SelectItem value="maintain">Maintain weight</SelectItem></SelectContent></Select></div><div className="form-grid">{draft.goal!=='maintain'?<div className="field"><Label htmlFor="pace">Weekly change (kg)</Label><Input id="pace" required type="number" min="0.05" max="0.5" step="0.05" value={draft.pace} onChange={e=>setDraft({...draft,pace:Number(e.target.value)})}/></div>:null}<div className="field"><Label htmlFor="baseline">Starting target (kcal / day)</Label><Input id="baseline" required type="number" min="1500" max="4500" step="25" value={draft.baseline_calories} onChange={e=>setDraft({...draft,baseline_calories:Number(e.target.value)})}/></div></div><p className="form-hint">For adults. Your main activity and weekly frequency describe your usual routine. Log actual sport and duration in daily check-ins; the model learns from those logs once enough history is available.</p>{error?<p role="alert" className="form-error">{error}</p>:null}<Button className="full-button" type="submit" disabled={busy}>Save profile</Button></form></DialogContent></Dialog>
 <Dialog open={modelOpen} onOpenChange={setModelOpen}><DialogContent className="tally-dialog sm:max-w-[480px]"><div className="dialog-icon lime"><Sparkles size={23}/></div><DialogTitle className="dialog-title">A target that learns.</DialogTitle><DialogDescription>Starting target: {fmt(profile.baseline_calories)} kcal / day</DialogDescription><div className="model-details"><p>{activeRecommendation.reason}</p><ol><li><strong>Build a useful history.</strong><span>At least 5 weigh-ins and 5 calorie logs per week. Six eligible week-to-week changes are needed.</span></li><li><strong>Check the pattern.</strong><span>The model compares weekly weight changes with calorie intake. With enough logs, it tests steps and sport by week. It uses them only if they improve predictions on later weeks.</span></li><li><strong>Keep changes small.</strong><span>Estimates are limited to ±100 kcal from your starting target. No automatic changes are applied to your plan.</span></li></ol><div className="model-caution">Experimental planning estimate, not a validated nutrition prescription. {activeRecommendation.model_features&&activeRecommendation.model_features!=='calories'?`This estimate assumes your latest logged weekly ${activeRecommendation.model_features==='calories_sport_steps'?'step and sport':activeRecommendation.model_features==='calories_and_steps'?'step':'sport'} routine continues.`:'Steps and sport are recorded but affect the estimate only if enough varied weeks demonstrate better predictions.'} Water, illness, and incomplete logs can affect the result.</div><a href="https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner" target="_blank" rel="noreferrer">About weight-planning estimates · NIDDK</a></div></DialogContent></Dialog>
 <AlertDialog open={resetOpen} onOpenChange={open=>{if(!busy)setResetOpen(open);}}><AlertDialogContent><AlertDialogTitle>Start with an empty journal?</AlertDialogTitle><AlertDialogDescription>This permanently removes all daily entries from your account, including weight, calories, steps, and sport logs. Your profile and goals stay saved. This cannot be undone.</AlertDialogDescription>{error?<p role="alert" className="form-error">{error}</p>:null}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event=>{event.preventDefault();void resetJournal();}}>{busy?'Clearing journal…':'Start fresh'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
