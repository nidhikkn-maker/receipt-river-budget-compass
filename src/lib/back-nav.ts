/** Pages that are a starting point never show a Back button. */
const HOME = new Set(["/", "/dashboard", "/spaces", "/inbox"]);
export function showBackButton(pathname: string): boolean {
  return !HOME.has(pathname.replace(/\/+$/, "") || "/");
}

/** Where Back should send the user: the app's own history, the browser's, or home.
 *  The app's history only knows pages opened since the page loaded, so after a refresh or a
 *  shared link the browser's own back step is used before giving up and going to the dashboard. */
export function backStep(routerCanGoBack: boolean, historyLength: number): "router" | "browser" | "home" {
  if (routerCanGoBack) return "router";
  return historyLength > 1 ? "browser" : "home";
}
