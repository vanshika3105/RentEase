import { useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useWeb3, ROLE } from "./context/Web3Context.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import Navbar from "./components/Navbar.jsx";
import Landing from "./pages/Landing.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import OwnerDashboard from "./pages/OwnerDashboard.jsx";
import TenantDashboard from "./pages/TenantDashboard.jsx";

function WalletConnectGate({ portal }) {
  const { account, role, contract, connect, loading, error, send, refreshRole } = useWeb3();
  const { user, logout, error: authError } = useAuth();
  const navigate = useNavigate();
  const [ownerName, setOwnerName] = useState(user?.displayName ?? "");
  const [requestPending, setRequestPending] = useState(false);

  const portalLabels = { admin: "Administrator", owner: "Property Owner", tenant: "Tenant" };
  const requestOwnerAccess = async (event) => {
    event.preventDefault();
    setRequestPending(true);
    try {
      const succeeded = await send(
        () => contract.requestOwnerAccess(ownerName.trim()),
        "Owner access request submitted"
      );
      if (succeeded) await refreshRole();
    } finally {
      setRequestPending(false);
    }
  };
  const roleAllowed = portal === "admin"
    ? role === ROLE.ADMIN
    : portal === "owner"
      ? role === ROLE.OWNER
      : role !== ROLE.ADMIN;
  const signOut = async () => {
    if (await logout()) navigate("/", { replace: true });
  };

  if (account && roleAllowed) return null;
  return (
    <div className="portal-access-shell">
      <section className="portal-access-card">
        <span className="portal-access-icon" aria-hidden="true">⌁</span>
        <p className="portal-access-eyebrow">{portalLabels[portal]} portal</p>
        <h1>{account ? "Wallet access required" : "Connect your wallet"}</h1>
        <p className="portal-access-description">
          Signed in with Google as <strong>{user?.email}</strong>. Connect the wallet used for this portal to continue.
        </p>
        {account && (
          <p className="portal-access-wallet">Connected wallet: <code>{account}</code></p>
        )}
        {account && portal === "owner" && role === ROLE.PENDING && (
          <p className="banner banner-info">Your owner request is awaiting administrator approval. This page will become available after approval.</p>
        )}
        {account && portal === "owner" && (role === ROLE.TENANT || role === ROLE.REJECTED) && (
          <form className="portal-owner-request" onSubmit={requestOwnerAccess}>
            <p className="muted">{role === ROLE.REJECTED ? "Your previous request was rejected. You can submit a new request." : "This wallet is not registered as an owner. Request access from the administrator."}</p>
            <label className="field">
              Your name or company
              <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} maxLength={80} required />
            </label>
            <button className="btn btn-red" disabled={requestPending || !contract}>
              {requestPending ? "Submitting…" : "Request owner access"}
            </button>
          </form>
        )}
        {account && portal === "admin" && (
          <p className="banner banner-warn">Connect the wallet that deployed this contract (Hardhat account #0) to access administrator controls.</p>
        )}
        {account && portal === "tenant" && role === ROLE.ADMIN && (
          <p className="banner banner-warn">The administrator wallet cannot access the tenant portal. Switch to a tenant wallet in MetaMask.</p>
        )}
        {!account && (
          <button className="btn btn-primary portal-connect-button" onClick={connect} disabled={loading}>
            {loading ? "Connecting wallet…" : "Connect MetaMask"}
          </button>
        )}
        {account && !roleAllowed && (
          <button className="btn btn-primary portal-connect-button" onClick={connect} disabled={loading}>
            {loading ? "Switching wallet…" : "Switch MetaMask account"}
          </button>
        )}
        {(error || authError) && <p className="banner banner-error">{error || authError}</p>}
        <div className="portal-access-footer">
          <button className="link-btn" onClick={() => navigate("/")}>Choose another portal</button>
          <button className="link-btn" onClick={signOut}>Sign out of Google</button>
        </div>
      </section>
    </div>
  );
}

function Guard({ portal, allow, children }) {
  const { user, selectedPortal, ready: authReady } = useAuth();
  const { account, role, ready: web3Ready } = useWeb3();
  if (!authReady || !web3Ready) return <div className="center">Loading your secure session…</div>;
  if (!user || selectedPortal !== portal) return <Navigate to="/" replace />;
  if (!account || !allow(role)) return <WalletConnectGate portal={portal} />;
  return children;
}

export default function App() {
  const { toasts } = useWeb3();
  const { pathname } = useLocation();
  return (
    <>
      {pathname !== "/admin" && pathname !== "/owner" && pathname !== "/tenant" && <Navbar />}
      <main>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/admin" element={<Guard portal="admin" allow={(r) => r === ROLE.ADMIN}><AdminDashboard /></Guard>} />
          <Route path="/owner" element={<Guard portal="owner" allow={(r) => r === ROLE.OWNER}><OwnerDashboard /></Guard>} />
          <Route path="/tenant" element={<Guard portal="tenant" allow={(r) => r !== null && r !== ROLE.ADMIN}><TenantDashboard /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
    </>
  );
}
