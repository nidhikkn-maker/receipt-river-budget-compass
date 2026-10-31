// Ensures the Reflect metadata polyfill runs before tsyringe (pulled in by passkey verification).
// Without this the production edge bundle crashed on every request.
import "./reflect-polyfill";
export * from "tsyringe/dist/esm2015/index.js";
