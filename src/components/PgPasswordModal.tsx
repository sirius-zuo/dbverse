import { useState } from "react";

interface Props {
  profileName: string;
  onConfirm(password: string): void;
  onCancel(): void;
}

export function PgPasswordModal({ profileName, onConfirm, onCancel }: Props) {
  const [password, setPassword] = useState("");
  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="PostgreSQL password">
        <h3>Connect to {profileName}</h3>
        <p className="modal-subtitle">Enter the password for this PostgreSQL connection.</p>
        <label className="field-label">
          Password
          <input
            type="password"
            autoFocus
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onConfirm(password); }}
            placeholder="Leave blank if no password"
          />
        </label>
        <div className="modal-actions">
          <button onClick={() => onConfirm(password)}>Connect</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
