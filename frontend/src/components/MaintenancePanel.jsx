import { useCallback, useState } from "react";
import { createMaintenance, listMaintenance, updateMaintenance } from "../utils/api.js";
import { useWeb3 } from "../context/Web3Context.jsx";
import usePolling from "../hooks/usePolling.js";
import { shortAddr } from "../utils/format.js";

// role: "tenant" (can submit), "owner" (can update status), "admin" (read only)
export default function MaintenancePanel({ role, account, leases = [] }) {
  const { notify } = useWeb3();
  const [items, setItems] = useState([]);
  const [offline, setOffline] = useState(false);
  const [form, setForm] = useState({ leaseId: "", title: "", description: "", priority: "Medium" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = useCallback(async () => {
    try {
      setItems(await listMaintenance(role === "admin" ? {} : { [role]: account }));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [role, account]);
  usePolling(load, 15000);

  async function submit(e) {
    e.preventDefault();
    const lease = leases.find((l) => String(l.id) === form.leaseId);
    if (!lease) return notify("error", "Select the lease this request is for");
    try {
      await createMaintenance({
        leaseId: lease.id, tenant: lease.tenant, owner: lease.owner,
        title: form.title, description: form.description, priority: form.priority,
      });
      notify("success", "Maintenance request sent to the owner");
      setForm({ leaseId: "", title: "", description: "", priority: "Medium" });
      load();
    } catch (err) {
      notify("error", err.message);
    }
  }

  async function setStatus(id, status) {
    try {
      await updateMaintenance(id, status);
      load();
    } catch (err) {
      notify("error", err.message);
    }
  }

  const activeLeases = leases.filter((l) => l.status === 1);

  return (
    <div className="stack">
      {offline && <p className="banner banner-warn">The backend is not reachable. Start it with <code>npm run backend</code>.</p>}

      {role === "tenant" && (
        <div className="panel">
          <div className="panel-head"><h3>New maintenance request</h3></div>
          {activeLeases.length === 0 ? (
            <p className="empty">You can request maintenance once you have an active lease.</p>
          ) : (
            <form className="form-grid" onSubmit={submit}>
              <label className="field">
                Lease
                <select value={form.leaseId} onChange={set("leaseId")} required>
                  <option value="">Select a lease</option>
                  {activeLeases.map((l) => <option key={l.id} value={l.id}>Lease #{l.id}</option>)}
                </select>
              </label>
              <label className="field">
                Priority
                <select value={form.priority} onChange={set("priority")}>
                  <option>Low</option><option>Medium</option><option>High</option>
                </select>
              </label>
              <label className="field span-2">
                What needs fixing?
                <input value={form.title} onChange={set("title")} maxLength={120} required />
              </label>
              <label className="field span-2">
                Details
                <textarea rows={3} value={form.description} onChange={set("description")} />
              </label>
              <div className="span-2"><button className="btn btn-green">Send request</button></div>
            </form>
          )}
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><h3>Requests</h3></div>
        {items.length === 0 ? (
          <p className="empty">No maintenance requests yet.</p>
        ) : (
          <ul className="list">
            {items.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.title}</strong>
                  <p className="muted">
                    Lease #{m.leaseId} · {m.priority} priority · tenant {shortAddr(m.tenant)} · {new Date(m.createdAt).toLocaleDateString()}
                  </p>
                  {m.description && <p>{m.description}</p>}
                </div>
                {role === "owner" ? (
                  <select value={m.status} onChange={(e) => setStatus(m.id, e.target.value)}>
                    <option>Open</option><option>In Progress</option><option>Resolved</option>
                  </select>
                ) : (
                  <span className={`badge badge-${m.status.toLowerCase().replace(" ", "")}`}>{m.status}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
