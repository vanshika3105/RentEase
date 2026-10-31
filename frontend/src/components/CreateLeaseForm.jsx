import { useState } from "react";
import { isAddress } from "ethers";
import { uploadDocument } from "../utils/api.js";
import { useWeb3 } from "../context/Web3Context.jsx";

export default function CreateLeaseForm({ properties, onCreate }) {
  const { notify } = useWeb3();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [f, setF] = useState({ propertyId: "", tenant: "", rent: "1", deposit: "2", months: "6" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!f.propertyId) return notify("error", "Select a property");
    if (!isAddress(f.tenant)) return notify("error", "Enter a valid tenant wallet address");
    setBusy(true);
    try {
      let docHash = "";
      if (file) {
        try {
          docHash = (await uploadDocument(file)).hash;
        } catch (err) {
          notify("error", `Could not upload the PDF: ${err.message}. Is the backend running?`);
          return;
        }
      }
      const ok = await onCreate({ ...f, propertyId: Number(f.propertyId), months: Number(f.months), docHash });
      if (ok) {
        setF({ ...f, tenant: "" });
        setFile(null);
        e.target.reset?.();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!properties.length)
    return <p className="empty">Add a property first. Then you can create a lease for it.</p>;

  return (
    <form className="form-grid" onSubmit={submit}>
      <label className="field span-2">
        Property
        <select value={f.propertyId} onChange={set("propertyId")} required>
          <option value="">Select a property</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.location})</option>
          ))}
        </select>
      </label>
      <label className="field span-2">
        Tenant wallet address
        <input value={f.tenant} onChange={set("tenant")} placeholder="0x…" required />
      </label>
      <label className="field">
        Monthly rent (ETH)
        <input type="number" min="0.0001" step="any" value={f.rent} onChange={set("rent")} required />
      </label>
      <label className="field">
        Security deposit (ETH)
        <input type="number" min="0" step="any" value={f.deposit} onChange={set("deposit")} required />
      </label>
      <label className="field">
        Duration (months)
        <input type="number" min="1" max="60" value={f.months} onChange={set("months")} required />
      </label>
      <label className="field">
        Agreement PDF (optional)
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} />
      </label>
      <div className="span-2">
        <button className="btn btn-red" disabled={busy}>{busy ? "Creating…" : "Create lease and send to tenant"}</button>
      </div>
    </form>
  );
}
