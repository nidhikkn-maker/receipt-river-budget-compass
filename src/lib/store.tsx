import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SEED, USERS, type Expense, type User } from "./expenses";

const KEY = "ledgerline:v1";

interface Ctx {
  user: User;
  setUserId: (id: string) => void;
  expenses: Expense[];
  upsert: (e: Expense) => void;
  reset: () => void;
}
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState(USERS[0]!.id);
  const [expenses, setExpenses] = useState<Expense[]>(SEED);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.expenses) setExpenses(p.expenses);
        if (p.userId) setUserId(p.userId);
      }
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ userId, expenses }));
    } catch {}
  }, [userId, expenses, loaded]);

  const user = USERS.find((u) => u.id === userId) ?? USERS[0]!;
  return (
    <StoreCtx.Provider
      value={{
        user,
        setUserId,
        expenses,
        upsert: (e) => setExpenses((xs) => (xs.some((x) => x.id === e.id) ? xs.map((x) => (x.id === e.id ? e : x)) : [e, ...xs])),
        reset: () => setExpenses(SEED),
      }}
    >
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}
