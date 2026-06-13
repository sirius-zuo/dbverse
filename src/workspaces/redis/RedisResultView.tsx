import type { RedisResponse } from "../../api/types";

interface Props {
  response: RedisResponse | null;
}

export function RedisResultView({ response }: Props) {
  if (!response) return null;
  return (
    <div className="redis-result">
      <RedisValue response={response} depth={0} />
    </div>
  );
}

function RedisValue({ response, depth }: { response: RedisResponse; depth: number }) {
  switch (response.type) {
    case "nil":
      return <span className="redis-nil">nil</span>;
    case "status":
      return <span className="redis-status">{response.value}</span>;
    case "integer":
      return <span className="redis-integer">{response.value}</span>;
    case "bulkString":
      return <pre className="redis-bulk-string">{response.value}</pre>;
    case "array":
      return (
        <ol className="redis-array" style={{ paddingLeft: depth > 0 ? "16px" : 0 }}>
          {response.value.map((item, i) => (
            <li key={i} className="redis-array-item">
              <RedisValue response={item} depth={depth + 1} />
            </li>
          ))}
        </ol>
      );
  }
}
