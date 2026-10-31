const BASE = import.meta.env.VITE_API_URL || "/api";

async function req(path, opts) {
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}
const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const uploadDocument = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return req("/documents", { method: "POST", body: fd });
};
export const documentUrl = (hash) => `${BASE}/documents/${hash}`;

// Re-hash the stored PDF in the browser and compare with the hash saved on-chain.
export async function verifyDocument(hash) {
  const res = await fetch(documentUrl(hash));
  if (!res.ok) throw new Error("Document not found on the server");
  const digest = await crypto.subtle.digest("SHA-256", await res.arrayBuffer());
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === hash;
}

export const listMaintenance = (params = {}) => req("/maintenance?" + new URLSearchParams(params));
export const createMaintenance = (body) => req("/maintenance", json("POST", body));
export const updateMaintenance = (id, status) => req(`/maintenance/${id}`, json("PATCH", { status }));
