import { Link, useNavigate } from "react-router-dom";
import { useWeb3 } from "../context/Web3Context.jsx";
import { ROLE_LABEL, shortAddr } from "../utils/format.js";

export default function Navbar() {
  const { account, role, disconnect } = useWeb3();
  const navigate = useNavigate();

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="brand">
          <span className="brand-icon">⌂</span>
          <span>
            <strong>RentEase</strong>
            <small>Property Management Portal</small>
          </span>
        </Link>
        {account && (
          <div className="nav-user">
            <span className={`role-chip role-${role}`}>{ROLE_LABEL[role] ?? "Tenant"}</span>
            <code title={account}>{shortAddr(account)}</code>
            <button
              className="btn btn-ghost"
              onClick={() => {
                disconnect();
                navigate("/");
              }}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
