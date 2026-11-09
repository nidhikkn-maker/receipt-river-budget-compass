const chain: any = new Proxy(function () {}, { get: () => chain, apply: () => chain });
export const createServerFn = () => chain; export const createMiddleware = () => chain; export const createIsomorphicFn = () => chain;
export const useServerFn = (f: any) => f; export const getRequest = () => null; export const getRequestHeader = () => null;
export default chain;
