import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

const TABLET_LANDSCAPE_QUERY = "(min-width: 1024px) and (orientation: landscape)";

/** True on iPad-style landscape screens, where list-and-detail layouts are preferred. */
export function useTabletLandscape() {
  const [matches, setMatches] = React.useState<boolean>(false);

  React.useEffect(() => {
    const mql = window.matchMedia(TABLET_LANDSCAPE_QUERY);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return matches;
}
