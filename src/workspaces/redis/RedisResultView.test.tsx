import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RedisResultView } from "./RedisResultView";

describe("RedisResultView", () => {
  it("renders nil", () => {
    render(<RedisResultView response={{ type: "nil" }} />);
    expect(screen.getByText("nil")).toBeTruthy();
  });

  it("renders status OK", () => {
    render(<RedisResultView response={{ type: "status", value: "OK" }} />);
    expect(screen.getByText("OK")).toBeTruthy();
  });

  it("renders integer", () => {
    render(<RedisResultView response={{ type: "integer", value: 42 }} />);
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("renders bulk string", () => {
    render(<RedisResultView response={{ type: "bulkString", value: "hello" }} />);
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("renders array with items", () => {
    render(
      <RedisResultView
        response={{
          type: "array",
          value: [
            { type: "bulkString", value: "foo" },
            { type: "integer", value: 1 },
          ],
        }}
      />
    );
    expect(screen.getByText("foo")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });
});
