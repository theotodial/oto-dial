import { test } from "node:test";
import assert from "node:assert/strict";
import { getDeploymentMode, isSafeDeploymentMode } from "../src/services/deploymentModeService.js";

test("deployment mode reads DEPLOYMENT_MODE at call time", () => {
  const prev = process.env.DEPLOYMENT_MODE;
  process.env.DEPLOYMENT_MODE = "safe";
  assert.equal(getDeploymentMode(), "safe");
  assert.equal(isSafeDeploymentMode(), true);
  process.env.DEPLOYMENT_MODE = "staging";
  assert.equal(isSafeDeploymentMode(), false);
  if (prev === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = prev;
});
