import assert from "node:assert/strict";
import telemetryHandler from "../api/telemetry.js";
import { enforceRateLimit } from "../api/_lib/rate-limit.js";

process.env.NODE_ENV = "development";

function responseMock() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
    end() { return this; },
    setHeader() {}
  };
}

const invalid = responseMock();
await telemetryHandler({ method: "POST", headers: {}, body: { kind: "unknown" } }, invalid);
assert.equal(invalid.statusCode, 400);

const valid = responseMock();
const originalConsoleError = console.error;
try {
  console.error = () => {};
  await telemetryHandler({ method: "POST", headers: {}, body: { kind: "error", path: "/assessment" } }, valid);
} finally {
  console.error = originalConsoleError;
}
assert.equal(valid.statusCode, 204);

assert.equal(await enforceRateLimit({ namespace: "test", subject: "subject", limit: 2, windowSeconds: 60 }), true);
assert.equal(await enforceRateLimit({ namespace: "test", subject: "subject", limit: 2, windowSeconds: 60 }), true);
assert.equal(await enforceRateLimit({ namespace: "test", subject: "subject", limit: 2, windowSeconds: 60 }), false);

console.log("API security tests passed.");
