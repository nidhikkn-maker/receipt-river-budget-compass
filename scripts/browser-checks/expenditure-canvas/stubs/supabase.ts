const w = window as any;
export const supabase = {
  storage: { from: () => ({ upload: async (_p: string, blob: Blob) => { w.__uploaded = blob; return { error: null }; } }) },
  from: () => { const q: any = {}; for (const m of ['select','eq','order','range','contains','limit']) q[m] = () => q;
    q.then = (d: any) => Promise.resolve({ data: [], error: null }).then(d);
    q.maybeSingle = async () => ({ data: w.__history ?? null, error: null });
    q.insert = async (row: any) => { w.__history = row; return { error: null }; }; return q; },
};
