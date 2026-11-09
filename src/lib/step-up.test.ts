import { afterEach, describe, expect, it, vi } from "vitest";
import { isMissingFunction, isStepUpRequired, requestStepUp, settleStepUp, stepUpAction, StepUpCancelled, subscribeStepUp, withStepUp } from "./step-up";

const required = { message: "STEP_UP_REQUIRED: delete_my_finance_data", code: "42501" };

describe("step-up errors", () => {
  it("recognises the database's step-up message and its action", () => {
    expect(isStepUpRequired(required)).toBe(true);
    expect(isStepUpRequired(new Error("STEP_UP_REQUIRED: grant_entity_access"))).toBe(true);
    expect(isStepUpRequired({ message: "permission denied", code: "42501" })).toBe(false);
    expect(isStepUpRequired(null)).toBe(false);
    expect(stepUpAction(required)).toBe("delete_my_finance_data");
  });
  it("detects functions missing from the current production schema", () => {
    expect(isMissingFunction({ code: "PGRST202", message: "Could not find the function public.has_recent_step_up" })).toBe(true);
    expect(isMissingFunction({ code: "42883", message: "function public.record_step_up(uuid, text, integer) does not exist" })).toBe(true);
    expect(isMissingFunction({ code: "42501", message: "STEP_UP_REQUIRED: x" })).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });
});

describe("withStepUp", () => {
  it("fails once with STEP_UP_REQUIRED, prompts, then retries the same call once", async () => {
    const call = vi.fn().mockResolvedValueOnce({ data: null, error: required }).mockResolvedValueOnce({ data: 7, error: null });
    const prompt = vi.fn().mockResolvedValue(true);
    await expect(withStepUp(call, prompt)).resolves.toEqual({ data: 7, error: null });
    expect(prompt).toHaveBeenCalledWith("delete_my_finance_data");
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("handles thrown step-up errors the same way", async () => {
    const call = vi.fn().mockRejectedValueOnce(new Error(required.message)).mockResolvedValueOnce("ok");
    await expect(withStepUp(call, async () => true)).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("passes other errors through without prompting", async () => {
    const prompt = vi.fn();
    const other = { data: null, error: { message: "duplicate key" } };
    await expect(withStepUp(async () => other, prompt)).resolves.toBe(other);
    await expect(withStepUp(async () => { throw new Error("offline"); }, prompt)).rejects.toThrow("offline");
    expect(prompt).not.toHaveBeenCalled();
  });
  it("does not retry when the person cancels", async () => {
    const call = vi.fn().mockResolvedValue({ data: null, error: required });
    await expect(withStepUp(call, async () => false)).rejects.toBeInstanceOf(StepUpCancelled);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("a second STEP_UP_REQUIRED is returned, never retried forever", async () => {
    const call = vi.fn().mockResolvedValue({ data: null, error: required });
    const prompt = vi.fn().mockResolvedValue(true);
    await expect(withStepUp(call, prompt)).resolves.toEqual({ data: null, error: required });
    expect(call).toHaveBeenCalledTimes(2);
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});

describe("step-up prompt queue", () => {
  let unsubscribe: (() => void) | undefined;
  afterEach(() => unsubscribe?.());
  it("resolves false when no confirmation dialog is mounted", async () => {
    await expect(requestStepUp("x")).resolves.toBe(false);
  });
  it("shows requests one at a time and settles them in order", async () => {
    const seen: (string | null)[] = [];
    unsubscribe = subscribeStepUp((p) => seen.push(p?.action ?? null));
    const a = requestStepUp("a"), b = requestStepUp("b");
    settleStepUp(true); settleStepUp(false);
    await expect(a).resolves.toBe(true);
    await expect(b).resolves.toBe(false);
    expect(seen).toEqual([null, "a", "b", null]);
  });
  it("cancels pending requests when the dialog unmounts", async () => {
    unsubscribe = subscribeStepUp(() => {});
    const pending = requestStepUp("a");
    unsubscribe(); unsubscribe = undefined;
    await expect(pending).resolves.toBe(false);
  });
});
