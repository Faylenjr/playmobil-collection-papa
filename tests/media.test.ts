import { describe, expect, it } from "vitest";
import { orderMediaForDisplay } from "../lib/media";

describe("display media order", () => {
  it("prefers box front, then box back, then product view", () => {
    const media = [
      { id: "content", kind: "main" },
      { id: "other", kind: "detail" },
      { id: "back", kind: "box_back" },
      { id: "front", kind: "box_front" },
    ];

    expect(orderMediaForDisplay(media).map(({ id }) => id)).toEqual(["front", "back", "content", "other"]);
    expect(media.map(({ id }) => id)).toEqual(["content", "other", "back", "front"]);
  });

  it("keeps the existing order for media of the same kind", () => {
    const media = [{ id: "first", kind: "main" }, { id: "second", kind: "main" }];
    expect(orderMediaForDisplay(media).map(({ id }) => id)).toEqual(["first", "second"]);
  });
});
