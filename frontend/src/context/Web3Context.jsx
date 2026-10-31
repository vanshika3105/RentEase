import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import artifact from "../contracts/RentEase.json";

const Web3Ctx = createContext(null);
export const useWeb3 = () => useContext(Web3Ctx);

// Role numbers returned by RentEase.getRole()
export const ROLE = { TENANT: 0, ADMIN: 1, OWNER: 2, PENDING: 3, REJECTED: 4 };

export function readError(e) {
  return (
    e?.revert?.args?.[0] ||
    e?.reason ||
    e?.info?.error?.data?.message ||
    e?.info?.error?.message ||
    e?.shortMessage ||
    e?.message ||
    "Transaction failed"
  );
}

export function Web3Provider({ children }) {
  const [account, setAccount] = useState(null);
  const [role, setRole] = useState(null);
  const [contract, setContract] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((type, message) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const reset = () => {
    setAccount(null);
    setRole(null);
    setContract(null);
  };

  // request=true opens the MetaMask prompt, request=false only restores an existing session
  const setup = useCallback(async (request) => {
    setError("");
    const ethereum = window.ethereum?.providers?.find((wallet) => wallet.isMetaMask) ?? window.ethereum;
    if (!ethereum) {
      setError("MetaMask was not found. Install the MetaMask browser extension to continue.");
      return null;
    }
    try {
      setLoading(true);
      const provider = new BrowserProvider(ethereum);
      if (request) await provider.send("eth_requestAccounts", []);
      const accounts = await provider.send("eth_accounts", []);
      if (!accounts.length) {
        reset();
        if (request) setError("MetaMask did not authorize an account. Unlock MetaMask and approve the connection request.");
        return null;
      }
      if (!artifact.address) {
        throw new Error("Contract not deployed yet. Run `npm run migrate` in the project root.");
      }
      const network = await provider.getNetwork();
      if (network.chainId !== 31337n) {
        throw new Error(
          `MetaMask is connected to chain ${network.chainId}. Switch to Hardhat Local (RPC http://127.0.0.1:8545, chain ID 31337).`
        );
      }
      const code = await provider.getCode(artifact.address);
      if (code === "0x") {
        throw new Error(
          "RentEase is not deployed on Hardhat Local. Make sure `npm run hardhat` is running, then run `npm run migrate` from the project folder."
        );
      }
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      const c = new Contract(artifact.address, artifact.abi, signer);
      const r = Number(await c.getRole(addr));
      setAccount(addr);
      setContract(c);
      setRole(r);
      return { account: addr, role: r };
    } catch (e) {
      reset();
      setError(readError(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setReady(true);
    const ethereum = window.ethereum?.providers?.find((wallet) => wallet.isMetaMask) ?? window.ethereum;
    if (!ethereum) return undefined;
    const onAccounts = () => setup(false);
    const onChain = () => window.location.reload();
    ethereum.on("accountsChanged", onAccounts);
    ethereum.on("chainChanged", onChain);
    return () => {
      ethereum.removeListener("accountsChanged", onAccounts);
      ethereum.removeListener("chainChanged", onChain);
    };
  }, [setup]);

  // Sends a transaction, waits for it to be mined and shows toasts.
  const send = useCallback(
    async (action, successMessage) => {
      try {
        const tx = await action();
        notify("info", "Transaction sent. Waiting for confirmation…");
        await tx.wait();
        notify("success", successMessage);
        return true;
      } catch (e) {
        notify("error", readError(e));
        return false;
      }
    },
    [notify]
  );

  const value = {
    account, role, contract, error, loading, ready, toasts,
    connect: () => setup(true),
    refreshRole: () => setup(false),
    disconnect: reset,
    send, notify,
  };
  return <Web3Ctx.Provider value={value}>{children}</Web3Ctx.Provider>;
}
