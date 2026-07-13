import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PERFORMANCE_PRESET,
  DEFAULT_SOUND_PRESET,
  PERFORMANCE_PRESETS,
} from "../src/config.js";
import { HandMapper } from "../src/mapping.js";
import { HandTracking } from "../src/handTracking.js";
import { ScaleTuner } from "../src/scale.js";
import {
  DEFAULT_SETTINGS,
  migrateLegacySettings,
  normalizeCalibrated,
} from "../src/settings.js";
import {
  continuousPitchTransition,
  scheduleContinuousFrequency,
  updateFrameIntervalEstimate,
} from "../src/pitchTrajectory.js";

function fakeHand(pitch, x = 0.5) {
  const raw = 1 - pitch;
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  landmarks[0] = { x: 0.45, y: 0.7 };
  landmarks[9] = { x: 0.45, y: 0.5 };
  landmarks[4] = { x: 0.4, y: 0.45 };
  landmarks[8] = { x: 0.6, y: 0.45 };
  return { landmarks, palm: { x, y: raw } };
}

test("historical performance ranges map their calibrated endpoints", () => {
  for (const key of ["concertFull", "rca1929", "rockmore", "comfortable"]) {
    const preset = PERFORMANCE_PRESETS[key];
    const mapper = new HandMapper("classic");
    mapper.setPitchConfig({ ...preset, inputLow: 0.15, inputHigh: 0.85 });
    const low = mapper.process(fakeHand(0.15), 1).frequency;
    mapper.reset();
    const high = mapper.process(fakeHand(0.85), 2).frequency;
    assert.ok(Math.abs(low - preset.minHz) < 0.03, `${key} low endpoint`);
    assert.ok(Math.abs(high - preset.maxHz) < 0.03, `${key} high endpoint`);
  }
});

test("factory defaults open as a full-range classic concert theremin", () => {
  assert.equal(DEFAULT_SOUND_PRESET, "rockmore");
  assert.equal(DEFAULT_PERFORMANCE_PRESET, "concertFull");
  assert.equal(DEFAULT_SETTINGS.mode, "classic");
  assert.equal(DEFAULT_SETTINGS.scale, "free");
  assert.equal(DEFAULT_SETTINGS.cabinetEnabled, true);
  assert.equal(DEFAULT_SETTINGS.reverb, 0.12);
  assert.ok(Math.abs(DEFAULT_SETTINGS.pitch.minHz - 32.70319566) < 1e-8);
  assert.ok(Math.abs(DEFAULT_SETTINGS.pitch.maxHz - 2093.004522) < 1e-6);
  assert.equal("axis" in DEFAULT_SETTINGS.pitch, false);
});

test("pitch is always vertical and free scale is an exact identity", () => {
  const mapperA = new HandMapper("classic");
  const mapperB = new HandMapper("classic");
  mapperA.setPitchConfig({ minHz: 32.70319566, maxHz: 2093.004522 });
  mapperB.setPitchConfig({ minHz: 32.70319566, maxHz: 2093.004522 });
  const a = mapperA.process(fakeHand(0.5, 0.05), 1).frequency;
  const b = mapperB.process(fakeHand(0.5, 0.95), 1).frequency;
  assert.ok(Math.abs(a - b) < 1e-12, "horizontal movement must not affect pitch");

  const tuner = new ScaleTuner();
  let previous = 0;
  for (let i = 0; i <= 1200; i++) {
    const frequency = 32.70319566 * Math.pow(2, 6 * i / 1200);
    const output = tuner.apply(frequency, 0, "free", 0, 1 / 60);
    assert.equal(output, frequency, `free scale changed sample ${i}`);
    assert.ok(output > previous, `free sweep is not strictly increasing at ${i}`);
    previous = output;
  }
});

test("v4 migration rejects horizontal pitch calibration but preserves safe data", () => {
  const migrated = migrateLegacySettings({
    soundPreset: "scifi",
    mode: "duo",
    cameraDeviceId: "camera-2",
    trainingEnabled: true,
    pitch: { axis: "x", inputLow: 0.2, inputHigh: 0.8 },
    volumeCalibration: { silent: 0.1, loud: 0.9 },
  });
  assert.equal(migrated.soundPreset, "rockmore");
  assert.equal(migrated.mode, "classic");
  assert.equal(migrated.cameraDeviceId, "camera-2");
  assert.equal(migrated.trainingEnabled, true);
  assert.equal(migrated.pitch.inputLow, 0);
  assert.equal(migrated.pitch.inputHigh, 1);
  assert.deepEqual(migrated.volumeCalibration, { silent: 0.1, loud: 0.9 });

  const custom = migrateLegacySettings({
    performancePreset: "custom",
    pitch: {
      axis: "y",
      minHz: 55,
      maxHz: 1760,
      glideMs: 27,
      volumeResponseMs: 31,
      inputLow: 0.2,
      inputHigh: 0.8,
    },
  });
  assert.equal(custom.performancePreset, "custom");
  assert.equal(custom.pitch.minHz, 55);
  assert.equal(custom.pitch.maxHz, 1760);
  assert.equal(custom.pitch.inputLow, 0.2);
  assert.equal(custom.pitch.inputHigh, 0.8);
});

test("camera frames are bridged by continuous log-frequency automation", () => {
  assert.ok(Math.abs(continuousPitchTransition(0.010, 1 / 30) - (1.15 / 30)) < 1e-12);
  assert.equal(continuousPitchTransition(0.050, 1 / 60), 0.050);
  const recovered60Fps = updateFrameIntervalEstimate(1 / 30, 1 / 60);
  assert.ok(recovered60Fps > 1 / 60, "estimate must decay gradually");
  assert.equal(updateFrameIntervalEstimate(recovered60Fps, 1 / 30), 1 / 30);
  const calls = [];
  const param = {
    cancelScheduledValues: (time) => calls.push(["cancel", time]),
    setValueAtTime: (value, time) => calls.push(["set", value, time]),
    cancelAndHoldAtTime: (time) => calls.push(["hold", time]),
    exponentialRampToValueAtTime: (value, time) => calls.push(["ramp", value, time]),
    setTargetAtTime: (value, time, constant) => calls.push(["target", value, time, constant]),
  };
  scheduleContinuousFrequency(param, 440, 2, 0.04);
  assert.deepEqual(calls, [["hold", 2], ["ramp", 440, 2.04]]);

  const fallbackCalls = [];
  const fallbackParam = {
    value: 110,
    cancelScheduledValues: (time) => fallbackCalls.push(["cancel", time]),
    setValueAtTime: (value, time) => fallbackCalls.push(["set", value, time]),
    exponentialRampToValueAtTime: (value, time) => fallbackCalls.push(["ramp", value, time]),
    setTargetAtTime: (value, time, constant) => fallbackCalls.push(["target", value, time, constant]),
  };
  scheduleContinuousFrequency(fallbackParam, 220, 4, 0.03);
  scheduleContinuousFrequency(fallbackParam, 440, 4.015, 0.03);
  assert.deepEqual(fallbackCalls.slice(0, 3), [
    ["cancel", 4], ["set", 110, 4], ["ramp", 220, 4.03],
  ]);
  assert.equal(fallbackCalls[3][0], "cancel");
  assert.ok(Math.abs(fallbackCalls[4][1] - Math.sqrt(110 * 220)) < 1e-10);
  assert.deepEqual(fallbackCalls[5], ["ramp", 440, 4.045]);
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

test("frame timestamps remain valid when MediaPipe rejects a frame", () => {
  const video = { readyState: 2, currentTime: 1 };
  const tracking = new HandTracking(video);
  const callbacks = [];
  tracking.landmarker = {
    detectForVideo: () => ({ landmarks: [] }),
  };
  tracking.onResults = (hands, info) => callbacks.push({ hands, info });

  tracking._processFrame(1_000);
  assert.equal(callbacks[0].info.timestampSeconds, 1);
  assert.equal(callbacks[0].info.inferenceError, undefined);

  video.currentTime = 2;
  tracking.landmarker.detectForVideo = () => {
    throw new Error("temporary inference failure");
  };
  assert.doesNotThrow(() => tracking._processFrame(1_010));
  assert.equal(callbacks[1].info.timestampSeconds, 1.01);
  assert.equal(callbacks[1].info.inferenceError, true);
  assert.deepEqual(callbacks[1].hands, { left: null, right: null });
});
