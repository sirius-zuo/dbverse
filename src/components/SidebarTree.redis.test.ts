import { describe, it, expect } from "vitest";
import { parseRedisKeys } from "./SidebarTree";
import type { NamespaceNode } from "./SidebarTree";

describe("parseRedisKeys", () => {
  it("flat key with no separator becomes single leaf", () => {
    const root = parseRedisKeys(["mykey"], ":");
    expect(root.children.size).toBe(1);
    expect(root.children.get("mykey")?.fullKey).toBe("mykey");
  });

  it("groups keys sharing a namespace prefix", () => {
    const root = parseRedisKeys(["user:1:name", "user:1:email", "user:2:name"], ":");
    expect(root.children.size).toBe(1);
    const user = root.children.get("user")!;
    expect(user.fullKey).toBeNull();
    expect(user.children.size).toBe(2);
    expect(user.children.get("1")?.children.get("name")?.fullKey).toBe("user:1:name");
  });

  it("respects custom separator", () => {
    const root = parseRedisKeys(["cache/sessions", "cache/tokens"], "/");
    expect(root.children.get("cache")?.children.size).toBe(2);
  });

  it("empty keys array returns empty root", () => {
    const root = parseRedisKeys([], ":");
    expect(root.children.size).toBe(0);
  });
});
