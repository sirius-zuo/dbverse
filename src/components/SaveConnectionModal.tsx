import { useState } from "react";

interface Props {
  defaultName: string;
  error?: string;
  onSave(name: string): void;
  onSkip(): void;
  onCancel(): void;
}

export function SaveConnectionModal({ defaultName, error, onSave, onSkip, onCancel }: Props) {
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
        {error && <div className="error-banner">{error}</div>}
        <div className="modal-actions">
          <button onClick={() => onSave(name.trim() || defaultName)}>Save</button>
          <button onClick={onSkip}>Open without saving</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
