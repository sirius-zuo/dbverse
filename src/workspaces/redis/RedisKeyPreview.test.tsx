import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RedisKeyPreview } from "./RedisKeyPreview";
import type { RedisKeyInfo, ConnectionProfile } from "../../api/types";

vi.mock("../../api/redis", () => ({
  redisGetKey: vi.fn(),
}));

const profile: ConnectionProfile = {
  id: "p1",
  displayName: "test",
  kind: "redis",
  config: { kind: "redis", host: "localhost", port: 6379, username: null, db: 0, keySeparator: ":" },
  secretRefs: [],
  lastUsedAt: null,
};

function makeInfo(value: RedisKeyInfo["value"]): RedisKeyInfo {
  return { key: "test:key", keyType: "string", ttl: 3600, value };
}

describe("RedisKeyPreview", () => {
  it("renders string value", () => {
    const info = makeInfo({ kind: "stringVal", value: "hello world" });
    render(
      <RedisKeyPreview
        profile={profile}
        redisKey="test:key"
        password={null}
        prefetchedInfo={info}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("hello world")).toBeTruthy();
    expect(screen.getByText(/3600s/)).toBeTruthy();
  });

  it("renders hash fields", () => {
    const info: RedisKeyInfo = {
      key: "test:key",
      keyType: "hash",
      ttl: null,
      value: { kind: "hashVal", fields: [{ name: "email", value: "a@b.com" }] },
    };
    render(
      <RedisKeyPreview
        profile={profile}
        redisKey="test:key"
        password={null}
        prefetchedInfo={info}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("email")).toBeTruthy();
    expect(screen.getByText("a@b.com")).toBeTruthy();
  });

  it("renders list items", () => {
    const info: RedisKeyInfo = {
      key: "test:key",
      keyType: "list",
      ttl: null,
      value: { kind: "listVal", items: ["alpha", "beta"] },
    };
    render(
      <RedisKeyPreview
        profile={profile}
        redisKey="test:key"
        password={null}
        prefetchedInfo={info}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    const info = makeInfo({ kind: "stringVal", value: "v" });
    render(
      <RedisKeyPreview
        profile={profile}
        redisKey="test:key"
        password={null}
        prefetchedInfo={info}
        onClose={onClose}
      />
    );
    screen.getByTitle("Close preview").click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
