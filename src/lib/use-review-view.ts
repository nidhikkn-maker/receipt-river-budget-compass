import { useState, type SetStateAction } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useStore } from "./store";

// UI-only values stay in this tab's memory, never in plaintext device storage.
const views = new Map<string, unknown>();
export function useReviewView<T>(name: string, initial: T | (() => T)): [T, (next: SetStateAction<T>) => void] {
  const { userId } = useStore();
  const location = useRouterState({ select: s => s.location });
  const key = `${userId}:${location.state.__TSR_key ?? location.state.key ?? location.pathname}:${name}`;
  const [value, setValue] = useState<T>(() => views.has(key) ? views.get(key) as T : typeof initial === "function" ? (initial as () => T)() : initial);
  const update = (next: SetStateAction<T>) => setValue(previous => {
    const result = typeof next === "function" ? (next as (v: T) => T)(previous) : next;
    views.set(key, result);
    return result;
  });
  return [value, update];
}