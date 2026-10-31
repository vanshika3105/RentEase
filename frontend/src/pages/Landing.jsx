import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const PORTALS = [
  { key: "admin", title: "Administrator", color: "purple", icon: "⚙",
    text: "Approve property owners, resolve disputes, set platform fees and review every transaction." },
  { key: "tenant", title: "Tenant", color: "green", icon: "☺",
    text: "Review leases sent to you, pay your deposit and rent, request maintenance and download agreements." },
  { key: "owner", title: "Property Owner", color: "red", icon: "⛨",
    text: "Add properties, create leases for tenants, track rental income and return deposits." },
];

const FEATURES = [
  ["Escrowed deposits", "The security deposit is locked in the smart contract until the lease ends or the admin resolves a dispute."],
  ["Automatic late fees", "If rent is paid more than 5 days after its due date, a 5% late fee is added by the contract itself."],
  ["Tamper-proof agreements", "The SHA-256 hash of the lease PDF is saved on-chain. Anyone can verify the document was not changed."],
  ["Role-based access", "Admin, owner and tenant permissions are enforced by the contract, not just hidden in the interface."],
  ["Full payment history", "Every deposit, rent payment and refund is recorded on-chain and can be exported as CSV."],
  ["Maintenance requests", "Tenants raise requests and owners update their status from one place."],
];

export default function Landing() {
  const { signInWithGoogle, error, configured } = useAuth();
  const navigate = useNavigate();
  const [loadingPortal, setLoadingPortal] = useState("");

  async function signIn(target, action) {
    const requestId = `${target}:${action}`;
    setLoadingPortal(requestId);
    try {
      if (await signInWithGoogle(target)) {
        navigate(`/${target}`);
      }
    } finally {
      setLoadingPortal("");
    }
  }

  return (
    <div className="container">
      <section className="portal-section">
        <h2 className="section-title">Access your portal</h2>
        <div className="portal-grid">
          {PORTALS.map((p) => (
            <div key={p.key} className="portal-card">
              <span className={`portal-icon bg-${p.color}`}>{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
              <div className="portal-card-actions">
                <button
                  className={`btn btn-${p.color}`}
                  disabled={!!loadingPortal}
                  onClick={() => signIn(p.key, "login")}
                >
                  {loadingPortal === `${p.key}:login` ? "Signing in…" : "Login"}
                </button>
                <button
                  className="portal-create-account"
                  disabled={!!loadingPortal}
                  onClick={() => signIn(p.key, "create")}
                >
                  {loadingPortal === `${p.key}:create` ? "Creating account…" : "Create account"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {!configured && (
          <p className="banner banner-warn">
            Google sign-in needs Firebase setup. Copy <code>frontend/.env.example</code> to <code>frontend/.env.local</code>, add your Firebase web app settings, then restart Vite. See the Firebase setup section in the README.
          </p>
        )}
        {error && <p className="banner banner-error">{error}</p>}
        <p className="portal-signup-note">Create account uses Google. Firebase creates your account the first time you sign in.</p>
      </section>

      <section className="features">
        <h2 className="section-title">Platform features</h2>
        <div className="feature-grid">
          {FEATURES.map(([title, text]) => (
            <div key={title} className="feature">
              <h4>{title}</h4>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
