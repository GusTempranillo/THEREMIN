import test from "node:test";
import assert from "node:assert/strict";
import { PERFORMANCE_PRESETS } from "../src/config.js";
import { HandMapper } from "../src/mapping.js";
import { HandTracking } from "../src/handTracking.js";
import { normalizeCalibrated } from "../src/settings.js";

function fakeHand(axis, pitch) {
  const raw = 1 - pitch;
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  landmarks[0] = { x: 0.45, y: 0.7 };
  landmarks[9] = { x: 0.45, y: 0.5 };
  landmarks[4] = { x: 0.4, y: 0.45 };
  landmarks[8] = { x: 0.6, y: 0.45 };
  return { landmarks, palm: axis === "x" ? { x: raw, y: 0.5 } : { x: 0.5, y: raw } };
}

test("historical performance ranges map their calibrated endpoints", () => {
  for (const key of ["rca1929", "rockmore", "comfortable"]) {
    const preset = PERFORMANCE_PRESETS[key];
    const mapper = new HandMapper("classic");
    mapper.setPitchConfig({ ...preset, inputLow: 0.15, inputHigh: 0.85 });
    const low = mapper.process(fakeHand(preset.axis, 0.15), 1).frequency;
    mapper.reset();
    const high = mapper.process(fakeHand(preset.axis, 0.85), 2).frequency;
    assert.ok(Math.abs(low - preset.minHz) < 0.03, `${key} low endpoint`);
    assert.ok(Math.abs(high - preset.maxHz) < 0.03, `${key} high endpoint`);
  }
});

test("calibration normalization supports normal and reversed gestures", () => {
  assert.ok(Math.abs(normalizeCalibrated(0.5, 0.2, 0.8) - 0.5) < 1e-12);
  assert.ok(Math.abs(normalizeCalibrated(0.5, 0.8, 0.2) - 0.5) < 1e-12);
  assert.equal(normalizeCalibrated(1, 0.2, 0.8), 1);
});

test("temporal hand association survives a crossing", () => {
  const tracking = new HandTracking(null);
  const out1 = { left: null, right: null };
  tracking._assignTrackedHands([
    { palm: { x: 0.2, y: 0.5 } },
    { palm: { x: 0.8, y: 0.5 } },
  ], out1);
  assert.equal(out1.right.palm.x, 0.2);
  const out2 = { left: null, right: null };
  tracking._assignTrackedHands([
    { palm: { x: 0.55, y: 0.5 } },
    { palm: { x: 0.45, y: 0.5 } },
  ], out2);
  assert.ok(out2.left && out2.right);
});
