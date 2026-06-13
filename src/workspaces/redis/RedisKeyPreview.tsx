import { useEffect, useState } from "react";
import type { ConnectionProfile, RedisKeyInfo, RedisKeyType } from "../../api/types";
import { redisGetKey } from "../../api/redis";

interface Props {
  profile: ConnectionProfile;
  redisKey: string;
  password: string | null | undefined;
  prefetchedInfo?: RedisKeyInfo;
  onClose(): void;
}

const TYPE_LABELS: Record<RedisKeyType, string> = {
  string: "STRING",
  hash: "HASH",
  list: "LIST",
  set: "SET",
  zSet: "ZSET",
  stream: "STREAM",
  unknown: "?",
};

function extractError(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as Record<string, unknown>).message);
  }
  return "Failed to load key";
}

export function RedisKeyPreview({ profile, redisKey, password, prefetchedInfo, onClose }: Props) {
  const [info, setInfo] = useState<RedisKeyInfo | null>(prefetchedInfo ?? null);
  const [loading, setLoading] = useState(!prefetchedInfo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefetchedInfo) {
      setInfo(prefetchedInfo);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    redisGetKey(profile, password ?? null, redisKey)
      .then((res) => {
        if (!cancelled) {
          setInfo(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(extractError(err));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redisKey]);

  const ttlLabel = info?.ttl != null ? `TTL: ${info.ttl}s` : "no expiry";

  return (
    <div className="table-preview">
      <div className="table-preview-toolbar">
        <span className="table-preview-title">{redisKey}</span>
        {info && (
          <>
            <span className={`redis-type-badge redis-type-${info.keyType}`}>
              {TYPE_LABELS[info.keyType]}
            </span>
            <span className="redis-ttl-chip">{ttlLabel}</span>
          </>
        )}
        <button className="table-preview-close" onClick={onClose} title="Close preview">
          ✕
        </button>
      </div>
      {loading && <div className="table-preview-loading">Loading…</div>}
      {error && <div className="table-preview-error">{error}</div>}
      {!loading && !error && info && <RedisKeyBody info={info} />}
    </div>
  );
}

function RedisKeyBody({ info }: { info: RedisKeyInfo }) {
  const { value } = info;
  switch (value.kind) {
    case "stringVal":
      return <pre className="redis-key-string">{value.value}</pre>;
    case "hashVal":
      return (
        <table className="redis-hash-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {value.fields.map((f) => (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td>{f.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "listVal":
      return (
        <ol className="redis-list">
          {value.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case "setVal":
      return (
        <ul className="redis-list">
          {value.members.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      );
    case "zSetVal":
      return (
        <table className="redis-hash-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {value.entries.map((e, i) => (
              <tr key={i}>
                <td>{e.member}</td>
                <td>{e.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "streamVal":
      return (
        <div className="redis-stream">
          {value.entries.map((entry) => (
            <div key={entry.id} className="redis-stream-entry">
              <div className="redis-stream-id">{entry.id}</div>
              {entry.fields.map((f) => (
                <div key={f.name} className="redis-stream-field">
                  <span className="redis-stream-fname">{f.name}</span>
                  <span className="redis-stream-fval">{f.value}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    default:
      return <div className="table-preview-error">Cannot display this key type.</div>;
  }
}
