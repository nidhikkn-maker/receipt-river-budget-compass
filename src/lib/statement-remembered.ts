// Which account a statement file was matched to last time (file-name pattern → account key), for StatementInbox.
// A failed read throws (P0-004): it is never treated as "no remembered account", so the screen can say so and retry.
import { supabase } from "@/integrations/supabase/client";
import { filePattern } from "./statement-fingerprint";

export async function rememberedStatementAccount(fileName: string, accountIds: readonly string[]): Promise<string | null> {
  const { data, error } = await supabase.from("statement_line_imports").select("account_key").eq("file_label", filePattern(fileName)).neq("account_key", "all").order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error("Couldn't check which account this statement used last time.");
  const remembered = data?.[0]?.account_key;
  return remembered && accountIds.includes(remembered) ? remembered : null;
}
