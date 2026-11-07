import { describe, expect, it } from "vitest";
import { selectVisible, setChecked, splitChecked } from "./audit-checked";

const items = ["a", "b", "c", "d"].map((key) => ({ key }));

describe("Records check: select, mark checked, Undo", () => {
  it("selects all visible records without duplicates", () => {
    expect(selectVisible(["a"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("marking several selected records moves them out of the open list", () => {
    const checked = setChecked([], ["a", "c"], true);
    const { open, done } = splitChecked(items, checked);
    expect(open.map((i) => i.key)).toEqual(["b", "d"]);
    expect(done.map((i) => i.key)).toEqual(["a", "c"]);
  });

  it("Undo restores exactly the records that were just marked", () => {
    const before = setChecked([], ["d"], true);
    const after = setChecked(before, ["a", "b"], true);
    const undone = setChecked(after, ["a", "b"], false);
    expect(undone).toEqual(["d"]);
    expect(splitChecked(items, undone).open.map((i) => i.key)).toEqual(["a", "b", "c"]);
  });

  it("marking the same record twice keeps a single entry", () => {
    expect(setChecked(["a"], ["a"], true)).toEqual(["a"]);
  });
});
