import { useState, useEffect, useCallback } from "react";
import type { ConnectionProfile, RedisResponse } from "../../api/types";
import { redisExecuteCommand } from "../../api/redis";
import { RedisResultView } from "./RedisResultView";
import { RedisKeyPreview } from "./RedisKeyPreview";

interface Props {
  profile: ConnectionProfile;
  initialPassword?: string;
  selectedKey?: string | null;
  onKeyPreviewClose(): void;
}

function extractError(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const msg = typeof e.message === "string" ? e.message : "Redis command failed.";
    const details = typeof e.technicalDetails === "string" ? e.technicalDetails : null;
    return details ? `${msg}: ${details}` : msg;
  }
  return "Redis command failed.";
}

export function RedisWorkspace({ profile, initialPassword, selectedKey, onKeyPreviewClose }: Props) {
  const [command, setCommand] = useState("PING");
  const [response, setResponse] = useState<RedisResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [connStatus, setConnStatus] = useState<"testing" | "ok" | "error">("testing");

  useEffect(() => {
    redisExecuteCommand(profile, initialPassword || null, "PING")
      .then(() => setConnStatus("ok"))
      .catch((err) => {
        setConnStatus("error");
        setMessage(extractError(err));
      });
    // profile and initialPassword are fixed for the lifetime of this component instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runCommand = useCallback(async () => {
    setMessage(null);
    setRunning(true);
    try {
      const res = await redisExecuteCommand(profile, initialPassword || null, command);
      setResponse(res);
      setConnStatus("ok");
    } catch (err) {
      setMessage(extractError(err));
      setConnStatus("error");
    } finally {
      setRunning(false);
    }
  }, [profile, initialPassword, command]);

  const statusLabel =
    connStatus === "testing" ? "Testing…" :
    connStatus === "ok" ? "Connected" :
    "Connection failed";

  return (
    <section className="workspace redis-workspace">
      <header className="workspace-header">
        <div>
          <h2>Redis Workspace</h2>
          <p>{profile.displayName}</p>
        </div>
        <div className="pg-header-actions">
          <span className={`pg-conn-status pg-conn-status-${connStatus}`}>{statusLabel}</span>
          <button onClick={runCommand} disabled={running}>
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </header>
      <textarea
        className="query-editor"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder="PING"
      />
      {message && <div className="error-banner">{message}</div>}
      {!selectedKey && <RedisResultView response={response} />}
      {selectedKey && (
        <RedisKeyPreview
          profile={profile}
          redisKey={selectedKey}
          password={initialPassword}
          onClose={onKeyPreviewClose}
        />
      )}
    </section>
  );
}
