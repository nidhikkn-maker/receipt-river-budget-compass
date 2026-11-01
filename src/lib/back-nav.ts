/** Pages that are a starting point never show a Back button. */
const HOME = new Set(["/", "/dashboard"]);
export function showBackButton(pathname: string): boolean {
  return !HOME.has(pathname.replace(/\/+$/, "") || "/");
}
