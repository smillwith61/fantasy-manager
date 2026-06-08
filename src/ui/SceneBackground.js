// ─────────────────────────────────────────────────────────────────────────────
// Shared background helper — stadium image + gradient overlay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draws the stadium background (cover-scaled) and a dark gradient overlay.
 * Adds both objects to the provided `objects` array for cleanup.
 *
 * @param {Phaser.Scene} scene
 * @param {Array}        objects   — the scene's this.objects array
 * @param {number}       W
 * @param {number}       H
 * @param {number}       [strength=0.82]  — max gradient alpha (0–1)
 */
export function addStadiumBg(scene, objects, W, H, strength = 0.82) {
  if (scene.textures.exists('stadium')) {
    const img = scene.add.image(W / 2, H / 2, 'stadium');
    img.setScale(Math.max(W / img.width, H / img.height));
    objects.push(img);
  } else {
    const fb = scene.add.graphics();
    fb.fillStyle(0x060e14, 1);
    fb.fillRect(0, 0, W, H);
    objects.push(fb);
  }

  const steps  = 12;
  const sliceH = Math.ceil(H / steps);
  const ov     = scene.add.graphics();
  for (let i = 0; i < steps; i++) {
    const alpha = Math.pow(i / (steps - 1), 1.6) * strength;
    ov.fillStyle(0x000000, alpha);
    ov.fillRect(0, Math.floor(i * H / steps), W, sliceH + 1);
  }
  objects.push(ov);
}

/**
 * Call in a scene's preload() to ensure the 'stadium' texture is loaded.
 * Safe to call multiple times — skips if already cached.
 *
 * @param {Phaser.Scene} scene
 */
export function preloadStadium(scene) {
  if (!scene.textures.exists('stadium')) {
    scene.load.image('stadium', '/assets/stadium.png');
  }
}
