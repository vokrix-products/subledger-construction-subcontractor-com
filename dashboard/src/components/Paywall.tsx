import { useState } from "react";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import { writeEntitlement } from "../lib/freemium";

export function Paywall({ onClose }: { onClose: () => void }) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  const title =
    import.meta.env.VITE_PAYWALL_TITLE || "You have used your 3 free Subcontractors";
  const description =
    import.meta.env.VITE_PAYWALL_DESCRIPTION || "Upgrade to get unlimited Subcontractors.";

  function upgrade() {
    setBusy(true);
    setTimeout(() => {
      writeEntitlement({ unlocked: true, unlockedAt: new Date().toISOString() });
      push("Workspace unlocked. Unlimited subcontractors enabled.", "success");
      setBusy(false);
      onClose();
      window.location.reload();
    }, 700);
  }

  return (
    <Modal
      title="Upgrade required"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Not now
          </button>
          <button className="btn btn-primary" onClick={upgrade} disabled={busy}>
            {busy ? <span className="spinner" /> : null}
            Unlock unlimited
          </button>
        </>
      }
    >
      <div className="badge badge-warn" style={{ marginBottom: 12 }}>
        Free tier limit reached
      </div>
      <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>{title}</h2>
      <p style={{ color: "var(--muted)", lineHeight: 1.6, margin: "0 0 12px" }}>{description}
      <ul style={{ color: "var(--muted)", lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
        <li>Unlimited subcontractor records</li>
        <li>COI, licence, W-9 and bond expiry tracking</li>
        <li>DeepSeek document extraction and compliance assistant</li>
        <li>Shared compliance activity trail for your team</li>
      </ul>
    </Modal>
  );
}
