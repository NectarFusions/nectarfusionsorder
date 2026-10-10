import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const TOPICS = [
  'From the Hive · Our story',
  'Honey 101 · Helpful tips',
  'Flavor Spotlight · Ways to enjoy it',
  'Behind the Scenes · Michigan & what is next',
];
const blank = { full_name:'', email:'', phone:'', source:'manual', consent_status:'needs_permission', consent_detail:'', permitted:false };
const issueFields = ['subject','preheader','title','body'];
const monthNow = () => {const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',year:'numeric',month:'2-digit'}).formatToParts(new Date());return `${parts.find(p=>p.type==='year')?.value}-${parts.find(p=>p.type==='month')?.value}`;};
const css = `
.nf-news{--ink:#17384B;--muted:#67808D;--line:#D8E5EB;--gold:#F7C41C;max-width:1040px;margin:0 auto 48px;color:var(--ink);font-family:inherit}
.nf-news *{box-sizing:border-box}.nf-news .news-hero{background:linear-gradient(130deg,#F4FAFD,#FFF);border:1px solid var(--line);border-radius:22px;padding:26px;margin-bottom:14px;box-shadow:0 12px 27px #17384B0C}
.nf-news .news-eyebrow{font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.14em;color:#4086A4}.nf-news h2{font-size:clamp(26px,4vw,36px);line-height:1.1;margin:8px 0;color:#15384B}.nf-news h3{font-size:20px;margin:0 0 10px}.nf-news h4{font-size:16px;margin:0 0 7px}.nf-news p{color:var(--muted);line-height:1.55;margin:7px 0 12px;font-size:13px}
.nf-news .news-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}.nf-news button,.nf-news input,.nf-news textarea,.nf-news select{font:inherit}.nf-news button{cursor:pointer}.nf-news button:disabled{opacity:.55;cursor:not-allowed}.nf-news .news-tab{border:1px solid var(--line);border-radius:12px;background:#FFF;padding:13px 7px;font-weight:800;color:#315B70}.nf-news .news-tab.selected{background:var(--ink);border-color:var(--ink);color:#FFF}
.nf-news .news-panel{border:1px solid var(--line);border-radius:18px;background:#fff;padding:20px;margin:12px 0;box-shadow:0 8px 20px #17384B0B}.nf-news .news-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.nf-news .news-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.nf-news .news-space{justify-content:space-between}.nf-news .news-field{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}.nf-news label{font-size:11px;letter-spacing:.02em;font-weight:850;color:#48697C}.nf-news input:not([type=checkbox]):not([type=file]),.nf-news textarea,.nf-news select{width:100%;background:#FFF;border:1px solid #BFCFD8;border-radius:10px;padding:11px;color:#17384B;min-height:42px}.nf-news input:focus,.nf-news textarea:focus,.nf-news select:focus{outline:2px solid #98C6DE;outline-offset:1px}.nf-news textarea{resize:vertical;line-height:1.55}.nf-news .news-btn{background:#FFF;color:var(--ink);border:1px solid #AECAD7;border-radius:10px;padding:10px 13px;min-height:41px;font-size:13px;font-weight:850}.nf-news .news-btn.primary{background:#163C52;color:white;border-color:#163C52}.nf-news .news-btn.gold{background:var(--gold);color:#18384A;border-color:#D6A400}.nf-news .news-btn.danger{color:#993535;border-color:#DFBEBE}.nf-news .news-btn.small{padding:7px 9px;min-height:32px;font-size:12px}.nf-news .news-chip{font-size:11px;font-weight:850;padding:5px 8px;border-radius:25px;background:#EAF3F7;color:#29546B;white-space:nowrap}.nf-news .news-chip.subscribed{background:#E5F3EB;color:#246446}.nf-news .news-chip.unsubscribed{background:#FCEDED;color:#943F3F}.nf-news .news-chip.needs_permission{background:#FFF5D5;color:#70541A}
.nf-news .news-stat{border:1px solid var(--line);border-radius:14px;padding:14px;background:#FCFEFF}.nf-news .news-stat b{font-size:26px;display:block}.nf-news .news-stat span{font-size:11px;color:var(--muted);font-weight:700}.nf-news .news-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.nf-news .news-card{border:1px solid var(--line);border-radius:14px;padding:13px;background:#FBFDFE;margin:8px 0}.nf-news .news-card strong{word-break:break-word}.nf-news .news-muted{font-size:12px;color:#67808D}.nf-news .news-note{border:1px solid #E5D5A6;background:#FFF9E9;border-radius:11px;padding:12px 14px;font-size:12px;line-height:1.6;color:#5B4E32;margin:12px 0}.nf-news .news-error{background:#FFF0EC;border:1px solid #DFAFA3;padding:12px;border-radius:10px;color:#803D32;white-space:pre-wrap}.nf-news .news-success{background:#EDF8F0;border:1px solid #B9DCC8;padding:12px;border-radius:10px;color:#285E3B}.nf-news .news-preview{overflow:hidden;border:1px solid #D6E5EB;border-radius:17px;background:white;margin:15px 0}.nf-news .news-preview-head{background:#15384B;color:white;padding:23px}.nf-news .news-preview-head h3{font-size:26px;line-height:1.2;color:white;margin:10px 0 0}.nf-news .news-preview-body{padding:21px;white-space:pre-wrap;line-height:1.75;font-size:14px}.nf-news .news-preview-body p{color:#284A5B;font-size:14px;margin:0 0 14px}.nf-news .news-preview-footer{background:#FAFCFD;border-top:1px solid var(--line);padding:15px;color:#6C808C;font-size:11px}.nf-news .news-check{display:inline-flex;align-items:center;gap:8px;font-size:12px;letter-spacing:0;font-weight:650}.nf-news .news-check input{height:16px;width:16px}
@media(max-width:650px){.nf-news .news-hero{padding:19px}.nf-news .news-grid{grid-template-columns:1fr}.nf-news .news-panel{padding:15px}.nf-news .news-tabs{gap:5px}.nf-news .news-tab{font-size:11px;padding:11px 5px}.nf-news .news-row>button{flex:0 1 auto}}
`;

async function request(action, fields={}) {
  const {data,error}=await supabase.auth.getSession();
  if(error) throw new Error(error.message);
  if(!data?.session?.access_token) throw new Error('Sign in to the Back Room again.');
  const r=await fetch('/.netlify/functions/newsletter-admin',{
    method:action==='list'?'GET':'POST',
    headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},
    ...(action==='list'?{}:{body:JSON.stringify({action,...fields})}),
  });
  const body=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(body.error || `Request failed (${r.status}).`);
  return body;
}
async function resizePhoto(file) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG or WebP photo.');
  if(file.size>18*1024*1024) throw new Error('Please choose a photo smaller than 18 MB.');
  return new Promise((resolve,reject)=>{
    const img=new Image();const url=URL.createObjectURL(file);
    img.onload=()=>{try{
      const scale=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',.84);URL.revokeObjectURL(url);resolve(data);
    }catch(err){URL.revokeObjectURL(url);reject(err);}};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not read the selected photo.'));};
    img.src=url;
  });
}
const statusText = (s)=>({needs_permission:'Needs permission',subscribed:'Subscribed',unsubscribed:'Unsubscribed'}[s]||s);

export default function AdminNewsletterStudio(){
  const [mode,setMode]=useState('contacts');
  const [contacts,setContacts]=useState([]);
  const [issues,setIssues]=useState([]);
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [query,setQuery]=useState('');
  const [staged,setStaged]=useState([]);
  const [importSource,setImportSource]=useState('Market sign-up sheet');
  const [importNote,setImportNote]=useState('');
  const [manual,setManual]=useState({...blank});
  const [edit,setEdit]=useState(null);
  const [month,setMonth]=useState(monthNow());
  const [week,setWeek]=useState(1);
  const [keywords,setKeywords]=useState('');
  const [funFact,setFunFact]=useState('');
  const [activeId,setActiveId]=useState('');
  const [draft,setDraft]=useState(null);

  async function reload(){const data=await request('list');setContacts(data.contacts||[]);setIssues(data.issues||[]);return data;}
  useEffect(()=>{let on=true;request('list').then(d=>{if(on){setContacts(d.contacts||[]);setIssues(d.issues||[]);}}).catch(e=>{if(on)setError(e.message);}).finally(()=>{if(on)setLoading(false);});return ()=>{on=false;};},[]);
  const eligible=contacts.filter(c=>c.consent_status==='subscribed'&&c.email);
  const counts=useMemo(()=>({all:contacts.length,ready:eligible.length,review:contacts.filter(c=>c.consent_status==='needs_permission').length}),[contacts]);
  const matched=useMemo(()=>contacts.filter(c=>[c.full_name,c.email,c.phone].join(' ').toLowerCase().includes(query.toLowerCase())),[contacts,query]);
  const chosen=issues.find(i=>i.id===activeId)||null;
  const dirty=Boolean(chosen&&draft&&issueFields.some(k=>String(draft[k]||'')!==String(chosen[k]||'')));
  const busy=Boolean(working);
  async function run(name,fn){setWorking(name);setError('');setNotice('');try{await fn();}catch(e){setError(e.message||'Something went wrong.');}finally{setWorking('');}}
  function chooseIssue(issue){setActiveId(issue.id);setDraft({...issue});setMode('editor');}
  async function scanPhoto(file){if(!file)return;await run('scan',async()=>{
    const imageData=await resizePhoto(file);
    const result=await request('scan',{imageData});
    setStaged((result.contacts||[]).map((row,index)=>({...blank,...row,selected:true,permitted:false,rowKey:`${Date.now()}-${index}`})));
    setNotice(`${result.contacts.length} possible contact${result.contacts.length===1?'':'s'} found. Check every field against the paper before saving.`);
  });}
  function modifyStage(index,patch){setStaged(old=>old.map((row,i)=>i===index?{...row,...patch}:row));}
  async function saveStaged(){await run('import',async()=>{
    const selected=staged.filter(r=>r.selected);
    if(!selected.length)throw new Error('Select at least one contact.');
    if(selected.some(r=>r.permitted)&&importNote.trim().length<8)throw new Error('Describe when and how these people agreed to receive the newsletter.');
    let done=0;const failed=[];
    for(const row of selected){
      try{await request('save_contact',{...row,source:importSource,consent_status:row.permitted?'subscribed':'needs_permission',consent_detail:row.permitted?importNote:'',permission_confirmed:!!row.permitted});done++;}
      catch(e){failed.push(`${row.full_name||row.email||'Row'}: ${e.message}`);}
    }
    await reload();setStaged([]);
    setNotice(`Saved ${done} contact${done===1?'':'s'}${failed.length?`; ${failed.length} need correction`:''}.`);
    if(failed.length)setError(failed.slice(0,8).join('\n'));
  });}
  async function saveSingle(input){await run('contact',async()=>{
    await request('save_contact',{...input,source:input.source||'manual',permission_confirmed:input.consent_status==='subscribed'&&!!input.permitted});
    await reload();setManual({...blank});setEdit(null);setNotice('Contact saved.');
  });}
  async function archive(id){if(!window.confirm('Archive this contact from the newsletter list?'))return;await run('archive',async()=>{
    await request('archive_contact',{id});await reload();setEdit(null);setNotice('Contact archived.');
  });}
  async function generate(){await run('generate',async()=>{
    const out=await request('generate',{month,week:Number(week),keywords,funFact});
    const data=await reload();const issue=data.issues.find(i=>i.id===out.issue.id)||out.issue;
    chooseIssue(issue);setNotice('Newsletter draft created. Read, edit, save, and approve it before sending.');
  });}
  async function saveDraft(){await run('save',async()=>{
    await request('save_issue',{id:activeId,...Object.fromEntries(issueFields.map(k=>[k,draft[k]]))});
    const data=await reload();const revised=data.issues.find(i=>i.id===activeId);setDraft(revised||draft);setNotice('Changes saved. Approve this version to enable sending.');
  });}
  async function approve(){if(dirty){setError('Save your edits before approving the newsletter.');return;}await run('approve',async()=>{
    await request('approve',{id:activeId});const data=await reload();setDraft({...data.issues.find(i=>i.id===activeId)});setNotice('Approved. Ready to send to subscribers.');
  });}
  async function send(){if(dirty){setError('Save edits and approve again before sending.');return;}
    if(!window.confirm(`Send this approved newsletter separately to up to ${eligible.length} subscribed email contacts? This cannot be undone.`))return;
    await run('send',async()=>{
      let result={remaining:1,total_sent:0,failed:[]};let cycles=0;
      while(result.remaining>0&&cycles<400){
        result=await request('send',{id:activeId});cycles++;
        setNotice(`Newsletter sending: ${result.total_sent} delivered to the email provider, ${result.remaining} remaining.`);
        if(result.failed?.length && result.successful===0)throw new Error(`Sending paused. ${result.failed[0].contact}: ${result.failed[0].error}. You can resume later.`);
      }
      const data=await reload();setDraft(data.issues.find(i=>i.id===activeId)||null);
      setNotice(result.remaining===0?`Newsletter submitted individually for ${result.total_sent} subscribed contacts.`:`Paused after ${result.total_sent} emails. Select Send / Resume later to continue.`);
    });
  }

  return <section className="nf-news"><style>{css}</style>
    <div className="news-hero"><div className="news-eyebrow">NectarFusions · Back Room</div><h2>Newsletter Studio</h2>
      <p>Grow your hive, turn paper sign-up sheets into editable contacts, and share helpful honey stories in a consistent newsletter series.</p>
      <div className="news-stats"><div className="news-stat"><b>{counts.all}</b><span>Contacts</span></div><div className="news-stat"><b>{counts.ready}</b><span>Email subscribers</span></div><div className="news-stat"><b>{counts.review}</b><span>Need permission</span></div></div>
    </div>
    <div className="news-tabs" role="tablist" aria-label="Newsletter Studio">
      <button className={`news-tab ${mode==='contacts'?'selected':''}`} onClick={()=>setMode('contacts')}>Contacts</button>
      <button className={`news-tab ${mode==='create'?'selected':''}`} onClick={()=>setMode('create')}>Create Newsletter</button>
      <button className={`news-tab ${mode==='editor'?'selected':''}`} onClick={()=>setMode('editor')}>Drafts & Sends</button>
    </div>
    {loading&&<div className="news-note">Loading newsletter contacts...</div>}
    {error&&<div role="alert" className="news-error" style={{marginBottom:12}}>{error}</div>}
    {notice&&<div role="status" className="news-success" style={{marginBottom:12}}>{notice}</div>}

    {mode==='contacts'&&<>
      <div className="news-panel"><div className="news-row news-space"><div><h3>Import contacts from a photo</h3><p>Take a photo on your phone or upload a saved sign-up sheet. Check the extracted information before saving.</p></div>
      <label className="news-btn gold" style={{display:'inline-flex',alignItems:'center',cursor:busy?'default':'pointer'}}> {working==='scan'?'Reading photo...':'Take / Upload Photo'}
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} style={{display:'none'}} onChange={e=>{scanPhoto(e.target.files?.[0]);e.target.value='';}} />
      </label></div>
      <div className="news-note">For privacy, the photo is processed securely by the AI service and not kept in your Newsletter Studio. It may contain personal details, so only upload sheets you have permission to process. AI handwriting recognition can make mistakes.</div>
      {staged.length>0&&<>
        <div className="news-grid"><div className="news-field"><label>Where these contacts came from</label><input value={importSource} onChange={e=>setImportSource(e.target.value)}/></div>
        <div className="news-field"><label>If anyone opted in, where and when did they agree?</label><input placeholder="Example: Newsletter signup at Oct. market" value={importNote} onChange={e=>setImportNote(e.target.value)}/></div></div>
        <p>{staged.length} rows extracted. Names, email addresses, phone numbers and permission need your review.</p>
        {staged.map((row,i)=><div className="news-card" key={row.rowKey}>
          <div className="news-row news-space"><strong>Person {i+1}</strong><label className="news-check"><input type="checkbox" checked={row.selected} onChange={e=>modifyStage(i,{selected:e.target.checked})}/> Include</label></div>
          <div className="news-grid"><div className="news-field"><label>Full name</label><input value={row.full_name} onChange={e=>modifyStage(i,{full_name:e.target.value})}/></div><div className="news-field"><label>Email</label><input type="email" value={row.email} onChange={e=>modifyStage(i,{email:e.target.value})}/></div><div className="news-field"><label>Phone</label><input type="tel" value={row.phone} onChange={e=>modifyStage(i,{phone:e.target.value})}/></div></div>
          <label className="news-check" style={{marginTop:12}}><input type="checkbox" checked={row.permitted} onChange={e=>modifyStage(i,{permitted:e.target.checked})}/> I verified this person expressly asked to receive email newsletters</label>
        </div>)}
        <div className="news-row"><button className="news-btn primary" disabled={busy} onClick={saveStaged}>{working==='import'?'Saving contacts...':'Save reviewed contacts'}</button><button className="news-btn" disabled={busy} onClick={()=>setStaged([])}>Discard scan</button></div>
      </>}
      </div>
      <div className="news-panel"><h3>Add a contact manually</h3><div className="news-grid">
        <div className="news-field"><label>Name</label><input value={manual.full_name} onChange={e=>setManual(m=>({...m,full_name:e.target.value}))}/></div>
        <div className="news-field"><label>Email</label><input type="email" value={manual.email} onChange={e=>setManual(m=>({...m,email:e.target.value}))}/></div>
        <div className="news-field"><label>Phone</label><input type="tel" value={manual.phone} onChange={e=>setManual(m=>({...m,phone:e.target.value}))}/></div>
        <div className="news-field"><label>Source</label><input value={manual.source} onChange={e=>setManual(m=>({...m,source:e.target.value}))}/></div>
      </div><label className="news-check" style={{margin:'13px 0'}}><input type="checkbox" checked={manual.permitted} onChange={e=>setManual(m=>({...m,permitted:e.target.checked,consent_status:e.target.checked?'subscribed':'needs_permission'}))}/> This person explicitly requested newsletter emails</label>
      {manual.permitted&&<div className="news-field" style={{marginBottom:12}}><label>When and how did they opt in?</label><input value={manual.consent_detail} onChange={e=>setManual(m=>({...m,consent_detail:e.target.value}))} placeholder="Example: Signed our email signup sheet at..."/></div>}
      <button className="news-btn primary" disabled={busy} onClick={()=>saveSingle(manual)}>Add contact</button></div>

      <div className="news-panel"><div className="news-row news-space"><h3>Contacts ({matched.length})</h3><div className="news-field" style={{maxWidth:300}}><label htmlFor="news-contact-search">Search</label><input id="news-contact-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, email or phone" /></div></div>
        {matched.length===0&&<p>No contacts to show.</p>}
        {matched.map(person=><div className="news-card" key={person.id}>
          <div className="news-row news-space"><div style={{minWidth:0,flex:1}}><strong>{person.full_name||'No name listed'}</strong><div className="news-muted">{person.email||'No email'} · {person.phone||'No phone'}</div></div>
            <span className={`news-chip ${person.consent_status}`}>{statusText(person.consent_status)}</span><button className="news-btn small" onClick={()=>setEdit(edit?.id===person.id?null:{...person,permitted:false})}>{edit?.id===person.id?'Close':'Edit'}</button></div>
          {edit?.id===person.id&&<div style={{marginTop:14}}><div className="news-grid">
            <div className="news-field"><label>Name</label><input value={edit.full_name||''} onChange={e=>setEdit(m=>({...m,full_name:e.target.value}))}/></div>
            <div className="news-field"><label>Email</label><input type="email" value={edit.email||''} onChange={e=>setEdit(m=>({...m,email:e.target.value}))}/></div>
            <div className="news-field"><label>Phone</label><input value={edit.phone||''} onChange={e=>setEdit(m=>({...m,phone:e.target.value}))}/></div>
            <div className="news-field"><label>Permission status</label><select value={edit.consent_status} onChange={e=>setEdit(m=>({...m,consent_status:e.target.value,permitted:false}))}><option value="needs_permission">Needs permission</option><option value="subscribed">Subscribed</option><option value="unsubscribed">Unsubscribed</option></select></div>
            <div className="news-field"><label>Signup source</label><input value={edit.source||''} onChange={e=>setEdit(m=>({...m,source:e.target.value}))}/></div>
            <div className="news-field"><label>Permission evidence</label><input value={edit.consent_detail||''} onChange={e=>setEdit(m=>({...m,consent_detail:e.target.value}))}/></div>
          </div>
          {edit.consent_status==='subscribed'&&<label className="news-check" style={{margin:'12px 0'}}><input type="checkbox" checked={edit.permitted} onChange={e=>setEdit(m=>({...m,permitted:e.target.checked}))}/> I confirm the recorded newsletter signup permission</label>}
          <div className="news-row" style={{marginTop:12}}><button className="news-btn primary small" disabled={busy} onClick={()=>saveSingle(edit)}>Save</button><button className="news-btn danger small" disabled={busy} onClick={()=>archive(edit.id)}>Archive</button></div></div>}
        </div>)}
      </div>
    </>}

    {mode==='create'&&<div className="news-panel"><div className="news-eyebrow">Editorial calendar</div><h3>Create a newsletter</h3><p>A consistent four-week series. Each week has a fresh topic, but the voice and format stay familiar. You choose when to generate and send each edition.</p>
      <div className="news-grid"><div className="news-field"><label>Month</label><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div><div className="news-field"><label>Week and topic</label><select value={week} onChange={e=>setWeek(Number(e.target.value))}>{TOPICS.map((label,i)=><option key={label} value={i+1}>Week {i+1} · {label}</option>)}</select></div></div>
      <div className="news-note"><strong>Week {week}:</strong> {TOPICS[week-1]}<div style={{marginTop:5}}>The next edition uses the next topic, and the four-part rotation repeats each month.</div></div>
      <div className="news-field"><label>Keywords, new products, announcements or themes</label><textarea rows={3} value={keywords} onChange={e=>setKeywords(e.target.value)} placeholder="Examples: cinnamon, cozy fall evenings, lemon honey in tea, new retail partner"/></div>
      <div className="news-field" style={{marginTop:12}}><label>Fun details, verified facts or a story you want included (optional)</label><textarea rows={3} value={funFact} onChange={e=>setFunFact(e.target.value)} placeholder="Example: We spotted bees feeding a young bee inside a cell this week"/></div>
      <div className="news-note">The AI writes the complete first draft without inventing discounts, availability, health benefits or events. You review all claims before sending.</div>
      <button className="news-btn gold" disabled={busy} onClick={generate}>{working==='generate'?'Creating your draft...':'Generate complete newsletter'}</button>
    </div>}

    {mode==='editor'&&<>
      <div className="news-panel"><h3>Newsletter editions</h3>
        {issues.length===0&&<p>No newsletters yet. Open Create Newsletter to generate your first draft.</p>}
        {issues.map(issue=><div className="news-card" key={issue.id}><div className="news-row news-space"><div><strong>{issue.month_key} · Week {issue.week_number} · {issue.subject||'Untitled'}</strong><div className="news-muted">{issue.topic} · {issue.sent_count||0} sent</div></div><div className="news-row"><span className={`news-chip ${issue.status==='sent'?'subscribed':''}`}>{issue.status}</span><button className="news-btn small" onClick={()=>chooseIssue(issue)}>{issue.id===activeId?'Selected':'Open'}</button></div></div></div>)}
      </div>
      {draft&&<div className="news-panel"><div className="news-row news-space"><div><div className="news-eyebrow">{draft.month_key} · Week {draft.week_number} · {draft.topic}</div><h3>Review & approve</h3></div><span className="news-chip">{draft.status}</span></div>
        {issueFields.map(field=><div key={field} className="news-field" style={{margin:'12px 0'}}><label>{field==='body'?'Newsletter body':field.charAt(0).toUpperCase()+field.slice(1)}</label>
          {field==='body'?<textarea rows={12} value={draft[field]||''} disabled={['sending','sent'].includes(draft.status)} onChange={e=>setDraft(d=>({...d,[field]:e.target.value}))}/>
          :<input value={draft[field]||''} disabled={['sending','sent'].includes(draft.status)} onChange={e=>setDraft(d=>({...d,[field]:e.target.value}))}/>}</div>)}
        <div className="news-row">{['draft','approved'].includes(draft.status)&&<><button className="news-btn primary" disabled={busy||!dirty} onClick={saveDraft}>Save edits</button><button className="news-btn gold" disabled={busy||dirty} onClick={approve}>Approve newsletter</button></>}
        {['approved','sending'].includes(draft.status)&&<button className="news-btn primary" disabled={busy||dirty||!eligible.length} onClick={send}>{working==='send'?'Sending individually...':draft.status==='sending'?'Resume sending':'Send newsletter by email'}</button>}</div>
        {dirty&&<p>Unsaved changes. Save and approve the revised draft before sending.</p>}
        {draft.status==='sent'&&<div className="news-success">Sent to email provider for {draft.sent_count} subscribers. Provider delivery or open status is tracked separately.</div>}
        <div className="news-preview"><div className="news-preview-head"><div style={{fontSize:11,letterSpacing:2,color:'#F7C41C',fontWeight:850}}>NECTARFUSIONS · NATURE'S HAPPINESS</div><h3>{draft.title}</h3></div>
          <div className="news-preview-body"><p>Hi [first name],</p>{(draft.body||'').split(/\n\s*\n/).map((p,i)=><p key={i}>{p}</p>)}<p>With gratitude,<br/>The NectarFusions Hive</p><span className="news-btn gold" style={{display:'inline-block'}}>Explore our honey</span></div>
          <div className="news-preview-footer">An unsubscribe link and the business postal address will be included in every sent email.</div></div>
      </div>}
    </>}
  </section>;
}
