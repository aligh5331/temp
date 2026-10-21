// GitHub Actions entry point: prints one JSON line per run.
import { probe } from "./probe.mjs";

const out = await probe(process.env, process.env.PROBE_HOST || "github");
console.log("PROBE_RESULT " + JSON.stringify(out));
