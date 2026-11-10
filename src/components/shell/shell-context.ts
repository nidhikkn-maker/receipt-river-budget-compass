import { createContext, useContext } from "react";

/** What the Signature Flow shell shares with its pages: the real origin and the universal tools. */
export interface ShellContextValue {
  /** In-app location the person came from (for breadcrumbs and Back), if known. */
  from: string | null;
  openSearch: () => void;
  openSmartAdd: () => void;
}

const noop = () => {};
export const ShellContext = createContext<ShellContextValue>({ from: null, openSearch: noop, openSmartAdd: noop });
export const useShell = () => useContext(ShellContext);
