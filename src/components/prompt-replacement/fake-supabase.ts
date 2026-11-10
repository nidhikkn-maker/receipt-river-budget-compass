// In-memory stand-in for the Supabase client in prompt-replacement tests: every query chain resolves to the rows
// set for its table (or the rpc result), and every write is recorded. Nothing reaches a hosted service.
export const fake = {
  rows: {} as Record<string, unknown[]>,
  rpc: {} as Record<string, unknown>,
  writes: [] as { table: string; op: string; value: unknown; filters: unknown[][] }[],
  rpcCalls: [] as { name: string; args: unknown }[],
};

export function resetFake(rows: Record<string, unknown[]> = {}, rpc: Record<string, unknown> = {}) {
  fake.rows = rows;
  fake.rpc = rpc;
  fake.writes = [];
  fake.rpcCalls = [];
}

function chain(table: string) {
  let write: { op: string; value: unknown } | null = null;
  const filters: unknown[][] = [];
  const result = () => {
    if (write) {
      fake.writes.push({ table, ...write, filters });
      return { data: [{ id: filters.find((f) => f[0] === "id")?.[1] ?? "x" }], error: null };
    }
    return { data: fake.rows[table] ?? [], error: null };
  };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "order", "limit", "gte", "lte", "neq", "match"])
    q[m] = (...args: unknown[]) => {
      if (m !== "select") filters.push([...args]);
      return q;
    };
  for (const op of ["update", "insert", "upsert", "delete"])
    q[op] = (value?: unknown) => {
      write = { op, value };
      return q;
    };
  q["maybeSingle"] = async () => ({ data: (fake.rows[table] ?? [])[0] ?? null, error: null });
  q["single"] = q["maybeSingle"];
  q["then"] = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return q;
}

export const supabaseMock = {
  supabase: {
    from: (table: string) => chain(table),
    rpc: async (name: string, args?: unknown) => {
      fake.rpcCalls.push({ name, args });
      return { data: fake.rpc[name] ?? null, error: null };
    },
    storage: { from: () => ({ remove: async () => ({ error: null }), upload: async () => ({ error: null }) }) },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  },
};
