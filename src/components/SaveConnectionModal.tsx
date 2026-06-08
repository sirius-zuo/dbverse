import { useState } from "react";

interface Props {
  defaultName: string;
  onSave(name: string): void;
  onSkip(): void;
}

export function SaveConnectionModal({ defaultName, onSave, onSkip }: Props) {
  const [name, setName] = useState(defaultName);

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Save connection">
        <h3>Save this connection?</h3>
        <label className="field-label">
          Name
          <input
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button onClick={() => onSave(name.trim() || defaultName)}>Save</button>
          <button onClick={onSkip}>Skip</button>
        </div>
      </div>
    </div>
  );
}
