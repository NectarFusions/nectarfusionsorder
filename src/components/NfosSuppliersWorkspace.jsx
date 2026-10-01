import { useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";

const blank = () => ({
  name:"",
  vendorCode:"",
  category:"",
  contactName:"",
  phone:"",
  email:"",
  productsSupplied:"",
  preferred:false,
  active:true,
  notes:"",
});

export default function NfosSuppliersWorkspace({ suppliers, onDone }) {
  const [search,setSearch]=useState("");
  const [editingId,setEditingId]=useState("");
  const [form,setForm]=useState(blank());
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const filtered=useMemo(()=>suppliers.filter((row)=>{
    const hay=`${row.name} ${row.vendor_code||""} ${row.category||""} ${row.products_supplied||""} ${row.contact_name||""} ${row.email||""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  }),[suppliers,search]);

  const vendorGroups=filtered.filter((row)=>String(row.vendor_code||"").startsWith("VND"));
  const actualSuppliers=filtered.filter((row)=>!String(row.vendor_code||"").startsWith("VND"));

  const beginEdit=(row)=>{
    setEditingId(row.id);
    setForm({
      name:row.name||"",
      vendorCode:row.vendor_code||"",
      category:row.category||"",
      contactName:row.contact_name||"",
      phone:row.phone||"",
      email:row.email||"",
      productsSupplied:row.products_supplied||"",
      preferred:Boolean(row.preferred),
      active:Boolean(row.active),
      notes:row.notes||"",
    });
    setError("");setMessage("");
  };

  const reset=()=>{setEditingId("");setForm(blank());};

  const save=async(event)=>{
    event.preventDefault();
    setBusy(true);setError("");setMessage("");
    try{
      if(editingId){
        await nfos.updateSupplier(editingId,form);
        setMessage("Supplier updated.");
      }else{
        await nfos.createSupplier(form);
        setMessage("Supplier created.");
      }
      reset();
      await onDone?.();
    }catch(err){setError(err?.message || "Could not save supplier.");}
    finally{setBusy(false);}
  };

  return <>
    <div className="nfos-grid four">
      <div className="nfos-stat"><div className="nfos-stat-label">Actual suppliers</div><div className="nfos-stat-value">{suppliers.filter((x)=>!String(x.vendor_code||"").startsWith("VND") && x.active).length}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Workbook vendor groups</div><div className="nfos-stat-value">{suppliers.filter((x)=>String(x.vendor_code||"").startsWith("VND") && x.active).length}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Preferred</div><div className="nfos-stat-value">{suppliers.filter((x)=>x.preferred && x.active).length}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Total active</div><div className="nfos-stat-value">{suppliers.filter((x)=>x.active).length}</div></div>
    </div>

    <div className="nfos-card">
      <div className="nfos-page-head">
        <div>
          <h2>Supplier Directory</h2>
          <p>Actual companies from the workbook Receiving Brand column are listed here. Workbook vendor groups remain available as classifications/reference.</p>
        </div>
      </div>
      <div className="nfos-filterbar">
        <input placeholder="Search supplier, category, product or contact…" value={search} onChange={(e)=>setSearch(e.target.value)}/>
      </div>
      <div className="nfos-table-wrap">
        <table className="nfos-table">
          <thead><tr><th>Supplier</th><th>Category</th><th>Products supplied</th><th>Contact</th><th>Preferred</th><th>Active</th><th>Actions</th></tr></thead>
          <tbody>{actualSuppliers.map((row)=><tr key={row.id}>
            <td><strong>{row.name}</strong><div className="nfos-muted nfos-small">{row.notes||""}</div></td>
            <td>{row.category||"—"}</td>
            <td>{row.products_supplied||"—"}</td>
            <td>{row.contact_name||row.email||row.phone||"—"}</td>
            <td>{row.preferred?"Yes":"—"}</td>
            <td>{row.active?"Active":"Inactive"}</td>
            <td><button className="nfos-btn ghost" onClick={()=>beginEdit(row)}>Edit</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>

    <div className="nfos-card">
      <h2>Workbook Vendor Groups</h2>
      <p className="nfos-muted">These are the five category-style vendors from the workbook Vendors tab. They are not a substitute for the actual company/brand above.</p>
      <div className="nfos-table-wrap"><table className="nfos-table">
        <thead><tr><th>Code</th><th>Vendor group</th><th>Category</th><th>Products supplied</th><th>Preferred</th><th>Actions</th></tr></thead>
        <tbody>{vendorGroups.map((row)=><tr key={row.id}>
          <td className="nfos-mono">{row.vendor_code}</td>
          <td><strong>{row.name}</strong></td>
          <td>{row.category||"—"}</td>
          <td>{row.products_supplied||"—"}</td>
          <td>{row.preferred?"Yes":"—"}</td>
          <td><button className="nfos-btn ghost" onClick={()=>beginEdit(row)}>Edit</button></td>
        </tr>)}</tbody>
      </table></div>
    </div>

    <div className="nfos-card">
      <h2>{editingId?"Edit supplier":"Add supplier"}</h2>
      {error&&<div className="nfos-error">{error}</div>}
      {message&&<div className="nfos-success">{message}</div>}
      <form className="nfos-form" onSubmit={save}>
        <div className="nfos-field full"><label>Supplier name</label><input required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></div>
        <div className="nfos-field"><label>Vendor code</label><input value={form.vendorCode} onChange={(e)=>setForm({...form,vendorCode:e.target.value})}/></div>
        <div className="nfos-field"><label>Category</label><input value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}/></div>
        <div className="nfos-field"><label>Contact</label><input value={form.contactName} onChange={(e)=>setForm({...form,contactName:e.target.value})}/></div>
        <div className="nfos-field"><label>Phone</label><input value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})}/></div>
        <div className="nfos-field full"><label>Email</label><input type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})}/></div>
        <div className="nfos-field full"><label>Products supplied</label><input value={form.productsSupplied} onChange={(e)=>setForm({...form,productsSupplied:e.target.value})}/></div>
        <div className="nfos-field full"><label>Notes</label><textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></div>
        <div className="nfos-field"><label><input type="checkbox" checked={form.preferred} onChange={(e)=>setForm({...form,preferred:e.target.checked})}/> Preferred</label></div>
        <div className="nfos-field"><label><input type="checkbox" checked={form.active} onChange={(e)=>setForm({...form,active:e.target.checked})}/> Active</label></div>
        <div className="nfos-field full"><div className="nfos-inline-actions">
          <button className="nfos-btn" disabled={busy}>{busy?"Saving…":editingId?"Save supplier":"Create supplier"}</button>
          {editingId&&<button type="button" className="nfos-btn ghost" onClick={reset}>Cancel</button>}
        </div></div>
      </form>
    </div>
  </>;
}
