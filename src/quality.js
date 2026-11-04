import * as THREE from 'three';
import { setCloudDensity } from './clouds.js';

export const QUALITY_PRESETS = {
  low: {
    maxDpr: 1,
    pixelBudget: 1280 * 720,
    shadow: false,
    clouds: 0.38,
    glow: 0.4,
  },
  medium: {
    maxDpr: 1.15,
    pixelBudget: 1600 * 900,
    shadow: false,
    clouds: 0.7,
    glow: 0.72,
  },
  high: {
    maxDpr: 1.5,
    pixelBudget: 1920 * 1080,
    shadow: true,
    clouds: 1,
    glow: 1,
  },
};

export function detectPhone() {
  const narrow = window.matchMedia('(max-width: 820px)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  return narrow || (coarse && window.innerWidth < 1100);
}

/**
 * Resolution, shadow, and cloud density start at the chosen quality
 * and step down when frames stay slow. Phones aim at 30fps, desktops at 60.
 * A display that is idle on its refresh rate is left alone.
 */
export function createAdaptive({
  renderer,
  sunLight,
  sunDirection,
  clouds,
  getQuality,
  phone,
}) {
  const target = phone ? 1 / 30 : 1 / 60;
  let resolutionScale = 1;
  let shadowAllowed = true;
  let cloudScale = 1;
  let width = window.innerWidth;
  let height = Math.max(window.innerHeight, 1);
  let samples = [];
  let strikes = 0;
  const armAt = performance.now() + 2500;
  const shadowSize = 1024;

  sunLight.shadow.mapSize.set(shadowSize, shadowSize);
  sunLight.shadow.camera.near = 8;
  sunLight.shadow.camera.far = 420;
  const extent = 140;
  sunLight.shadow.camera.left = -extent;
  sunLight.shadow.camera.right = extent;
  sunLight.shadow.camera.top = extent;
  sunLight.shadow.camera.bottom = -extent;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.04;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  function preset() {
    return QUALITY_PRESETS[getQuality()] || QUALITY_PRESETS.high;
  }

  function pixelRatio() {
    const cap = preset();
    let ratio = Math.min(window.devicePixelRatio || 1, cap.maxDpr) * resolutionScale;
    const pixels = width * height * ratio * ratio;
    if (pixels > cap.pixelBudget) ratio *= Math.sqrt(cap.pixelBudget / pixels);
    return Math.max(0.45, ratio);
  }

  function applyShadow() {
    const enabled = preset().shadow && shadowAllowed;
    renderer.shadowMap.enabled = enabled;
    sunLight.castShadow = enabled;
    if (enabled) sunLight.shadow.camera.updateProjectionMatrix();
  }

  function applyClouds() {
    setCloudDensity(clouds, preset().clouds * cloudScale);
  }

  function resize(nextWidth = width, nextHeight = height) {
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(width, height);
  }

  function reset() {
    resolutionScale = 1;
    shadowAllowed = true;
    cloudScale = 1;
    samples = [];
    strikes = 0;
    applyShadow();
    applyClouds();
    resize();
  }

  function degrade() {
    samples = [];
    strikes = 0;
    if (resolutionScale > 0.6) {
      resolutionScale = Math.max(0.58, resolutionScale * 0.8);
      resize();
      return;
    }
    if (sunLight.castShadow) {
      shadowAllowed = false;
      applyShadow();
      return;
    }
    if (cloudScale > 0.45) {
      cloudScale = Math.max(0.4, cloudScale * 0.72);
      applyClouds();
    }
  }

  function idleRefresh(avgElapsed, avgRender) {
    if (avgRender > target * 0.6) return false;
    const ms = avgElapsed * 1000;
    return [16.67, 33.34, 41.67, 50, 66.67].some((step) => Math.abs(ms - step) < 4);
  }

  function note(elapsed, renderSec) {
    if (performance.now() < armAt) return;
    if (elapsed > 0.12) {
      if (renderSec > target * 0.7) strikes += 1;
      else strikes = 0;
      if (strikes >= 10) degrade();
      return;
    }
    strikes = 0;
    samples.push({ elapsed, render: renderSec });
    if (samples.length > 40) samples.shift();
    if (samples.length < 28) return;
    let elapsedSum = 0;
    let renderSum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      elapsedSum += samples[i].elapsed;
      renderSum += samples[i].render;
    }
    const avgElapsed = elapsedSum / samples.length;
    const avgRender = renderSum / samples.length;
    if (idleRefresh(avgElapsed, avgRender)) return;
    if (avgRender > target * 0.72) degrade();
    else if (avgElapsed > target * 1.35 && avgRender > target * 0.35) degrade();
  }

  function placeShadow(position) {
    if (!sunLight.castShadow) return;
    sunLight.target.position.copy(position);
    sunLight.position.copy(position).addScaledVector(sunDirection, 220);
    sunLight.shadow.camera.updateProjectionMatrix();
  }

  return {
    reset,
    resize,
    note,
    placeShadow,
    glow() {
      return preset().glow;
    },
    stats() {
      let elapsedSum = 0;
      let renderSum = 0;
      for (let i = 0; i < samples.length; i += 1) {
        elapsedSum += samples[i].elapsed;
        renderSum += samples[i].render;
      }
      const avgElapsed = samples.length ? elapsedSum / samples.length : 0;
      const avgRender = samples.length ? renderSum / samples.length : 0;
      return {
        fps: avgElapsed > 0 ? 1 / avgElapsed : 0,
        frameMs: avgElapsed * 1000,
        renderMs: avgRender * 1000,
        resolutionScale,
        shadow: sunLight.castShadow,
        clouds: clouds.active,
        cloudScale,
        dpr: renderer.getPixelRatio(),
        quality: getQuality(),
        phone,
        targetFps: phone ? 30 : 60,
      };
    },
  };
}
