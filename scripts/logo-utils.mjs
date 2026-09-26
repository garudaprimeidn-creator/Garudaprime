import sharp from "sharp";

/** Turn near-black pixels transparent, removes remove.bg fringe without touching artwork. */
export async function removeNearBlackBackground(input, cutoff = 18) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    if (r <= cutoff && g <= cutoff && b <= cutoff) {
      px[i + 3] = 0;
    }
  }

  return sharp(
    await sharp(px, {
      raw: { width: info.width, height: info.height, channels: 4 },
    }).png().toBuffer(),
  );
}

/**
 * Remove low-saturation dark matte (solid black / gray JPEG box behind lockups).
 * Keeps coloured logo artwork (emerald, gold) intact.
 */
export async function removeDarkMatte(input, { maxLuma = 36, maxSat = 0.14 } = {}) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
    if (luma <= maxLuma && sat <= maxSat) {
      px[i + 3] = 0;
    }
  }

  return sharp(
    await sharp(px, {
      raw: { width: info.width, height: info.height, channels: 4 },
    }).png().toBuffer(),
  );
}

/** Turn near-white pixels transparent, keeps coloured logo artwork intact. */
export async function removeNearWhiteBackground(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    if (r >= 248 && g >= 248 && b >= 248) {
      px[i + 3] = 0;
    }
  }

  return sharp(
    await sharp(px, {
      raw: { width: info.width, height: info.height, channels: 4 },
    }).png().toBuffer(),
  );
}

export const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Matches launch splash / TWA background, charcoal canvas behind emblem. */
export const SPLASH_BG = { r: 20, g: 20, b: 20, alpha: 255 };

/** App tab / body canvas (index.html theme-color). */
export const APP_PAGE_BG = { r: 4, g: 9, b: 15, alpha: 255 };

/** Marketing site body background. */
export const MARKETING_PAGE_BG = { r: 255, g: 255, b: 255, alpha: 255 };

/** Marketing footer background (--fg). */
export const MARKETING_FOOTER_BG = { r: 15, g: 23, b: 42, alpha: 255 };

/** Strip near-black / near-white matte from emblem masters. */
export async function stripLogoMatte(input, { blackCutoff = 18, darkMatteLuma = 36 } = {}) {
  let buf = await sharp(input).ensureAlpha().png().toBuffer();
  buf = await (await removeNearBlackBackground(buf, blackCutoff)).png().toBuffer();
  buf = await (await removeDarkMatte(buf, { maxLuma: darkMatteLuma })).png().toBuffer();
  buf = await (await removeNearWhiteBackground(buf)).png().toBuffer();
  return sharp(buf);
}

/** Fit emblem inside a square canvas with transparent safe-zone padding (Android / iOS). */
export async function renderIconWithSafeZone(pipeline, size, { insetRatio = 0.14 } = {}) {
  const inset = Math.round(size * insetRatio);
  const inner = Math.max(1, size - inset * 2);

  return pipeline
    .clone()
    .resize(inner, inner, {
      fit: "contain",
      background: TRANSPARENT,
      kernel: sharp.kernel.lanczos3,
    })
    .extend({
      top: inset,
      bottom: inset,
      left: inset,
      right: inset,
      background: TRANSPARENT,
    })
    .png({ compressionLevel: 6, adaptiveFiltering: true });
}

/** Launcher / install splash icons, solid light background (Android renders transparent as black). */
export async function renderIconOnBackground(
  pipeline,
  size,
  background = SPLASH_BG,
  { insetRatio = 0.14 } = {},
) {
  const inset = Math.round(size * insetRatio);
  const inner = Math.max(1, size - inset * 2);

  const emblem = await pipeline
    .clone()
    .resize(inner, inner, {
      fit: "contain",
      background: TRANSPARENT,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: emblem, gravity: "center" }])
    .png({ compressionLevel: 6, adaptiveFiltering: true });
}

/** Favicon / tab icon, circular badge on transparent square canvas. */
export async function renderCircularIconOnBackground(
  pipeline,
  size,
  background,
  { insetRatio = 0.16 } = {},
) {
  const radius = size / 2;
  const emblemSize = Math.max(1, Math.round(size * (1 - insetRatio * 2)));

  const emblem = await pipeline
    .clone()
    .resize(emblemSize, emblemSize, {
      fit: "contain",
      background: TRANSPARENT,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  const { r, g, b } = background;
  const circleSvg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${radius}" cy="${radius}" r="${radius}" fill="rgb(${r},${g},${b})"/>
    </svg>`,
  );
  const circleBg = await sharp(circleSvg).png().toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite([
      { input: circleBg, gravity: "center" },
      { input: emblem, gravity: "center" },
    ])
    .png({ compressionLevel: 6, adaptiveFiltering: true });
}
