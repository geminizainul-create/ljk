/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  OMRTemplate,
  AnswerKey,
  ScanResult,
  QuestionDetectionResult,
  DetectedAnswerStatus
} from '../types/ljk';

// Point structure
export interface Point {
  x: number;
  y: number;
}

export interface QuadCorners {
  tl: Point;
  tr: Point;
  bl: Point;
  br: Point;
}

export interface CalibrationResult {
  success: boolean;
  corners?: QuadCorners;
  confidence: number;
  message?: string;
}

/**
 * Converts any image source to an HTMLCanvasElement
 */
export function imageToCanvas(img: HTMLImageElement | ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/**
 * Loads an image from a URL, blob, or file into an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Gagal memuat gambar scan'));
    img.src = src;
  });
}

/**
 * Detects 4 solid black registration markers in the 4 corners of the scanned sheet
 */
export function detectRegistrationMarks(
  canvas: HTMLCanvasElement,
  template: OMRTemplate
): CalibrationResult {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Search zones: outer 22% of each corner quadrant
  const searchW = Math.floor(width * 0.22);
  const searchH = Math.floor(height * 0.22);

  // Helper to convert to grayscale intensity (0-255)
  const getGray = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  };

  // Find darkest dense bounding box in quadrant
  const findMarkerInZone = (
    startX: number,
    startY: number,
    w: number,
    h: number
  ): Point | null => {
    // Step 1: Compute average brightness in search zone to determine local paper threshold
    let sumGray = 0;
    let count = 0;
    const step = 4;
    for (let y = startY; y < startY + h; y += step) {
      for (let x = startX; x < startX + w; x += step) {
        sumGray += getGray(x, y);
        count++;
      }
    }
    const avgZone = count > 0 ? sumGray / count : 200;
    const darkThresh = Math.min(110, avgZone * 0.55);

    // Step 2: Find connected dark component or densest square window
    // Registration marks in PDF are 7mm squares (~3-5% of page width)
    const expectedSize = Math.max(14, Math.floor(width * 0.033));
    let bestX = -1;
    let bestY = -1;
    let maxDarkCount = 0;

    const winSize = expectedSize;
    const halfWin = Math.floor(winSize / 2);

    for (let y = startY + halfWin; y < startY + h - halfWin; y += 4) {
      for (let x = startX + halfWin; x < startX + w - halfWin; x += 4) {
        // Count dark pixels inside winSize box
        let darks = 0;
        let samples = 0;
        for (let dy = -halfWin; dy <= halfWin; dy += 2) {
          for (let dx = -halfWin; dx <= halfWin; dx += 2) {
            if (getGray(x + dx, y + dy) < darkThresh) {
              darks++;
            }
            samples++;
          }
        }
        const density = darks / samples;
        // Looking for solid square with high density (~60% - 95%)
        if (density > 0.65 && darks > maxDarkCount) {
          maxDarkCount = darks;
          bestX = x;
          bestY = y;
        }
      }
    }

    if (bestX > 0 && bestY > 0) {
      return { x: bestX, y: bestY };
    }

    return null;
  };

  const blMark = template.registrationMarks.find(m => m.corner === 'BL');
  const brMark = template.registrationMarks.find(m => m.corner === 'BR');

  // Relative expected Y ratio on full page
  const expectedBlYRatio = blMark ? blMark.y / template.paper.heightMm : 0.95;
  const expectedBrYRatio = brMark ? brMark.y / template.paper.heightMm : 0.95;

  const tl = findMarkerInZone(0, 0, searchW, searchH);
  const tr = findMarkerInZone(width - searchW, 0, searchW, searchH);

  // Search for BL:
  let bl: Point | null = null;
  const expectedBlY = Math.round(expectedBlYRatio * height);
  const startBlY = Math.max(0, Math.min(height - searchH, expectedBlY - Math.floor(searchH / 2)));
  // 1. Try near expected ratio from template (full page scan / PDF)
  bl = findMarkerInZone(0, startBlY, searchW, searchH);

  // 2. If not found or if startBlY is different from bottom, try bottom of image (for cropped camera capture where photo ends at the marks)
  if (!bl && startBlY < height - searchH) {
    bl = findMarkerInZone(0, height - searchH, searchW, searchH);
  }
  // 3. Fallback search across middle-to-bottom band
  if (!bl) {
    bl = findMarkerInZone(0, Math.max(0, Math.floor(height * 0.25)), searchW, Math.floor(height * 0.55));
  }

  // Search for BR:
  let br: Point | null = null;
  const expectedBrY = Math.round(expectedBrYRatio * height);
  const startBrY = Math.max(0, Math.min(height - searchH, expectedBrY - Math.floor(searchH / 2)));
  // 1. Try near expected ratio from template (full page scan / PDF)
  br = findMarkerInZone(width - searchW, startBrY, searchW, searchH);

  // 2. If not found or if startBrY is different from bottom, try bottom of image
  if (!br && startBrY < height - searchH) {
    br = findMarkerInZone(width - searchW, height - searchH, searchW, searchH);
  }
  // 3. Fallback search across middle-to-bottom band
  if (!br) {
    br = findMarkerInZone(width - searchW, Math.max(0, Math.floor(height * 0.25)), searchW, Math.floor(height * 0.55));
  }

  // If auto-detection misses a corner (e.g. due to lighting or crop), estimate from default page margins
  const foundCount = [tl, tr, bl, br].filter(Boolean).length;

  if (foundCount >= 3) {
    // We can infer the missing 4th corner using affine rectangle relationship:
    // tl + br = tr + bl  =>  missing = opposite1 + opposite2 - opposite3
    const finalCorners: QuadCorners = {
      tl: tl || (tr && bl && br ? { x: tr.x + bl.x - br.x, y: tr.y + bl.y - br.y } : { x: width * 0.04, y: height * 0.03 }),
      tr: tr || (tl && br && bl ? { x: tl.x + br.x - bl.x, y: tl.y + br.y - bl.y } : { x: width * 0.96, y: height * 0.03 }),
      bl: bl || (tl && br && tr ? { x: tl.x + br.x - tr.x, y: tl.y + br.y - tr.y } : { x: width * 0.04, y: height * expectedBlYRatio }),
      br: br || (tr && bl && tl ? { x: tr.x + bl.x - tl.x, y: tr.y + bl.y - tl.y } : { x: width * 0.96, y: height * expectedBrYRatio })
    };

    const confidence = Math.round((foundCount / 4) * 100);
    return {
      success: true,
      corners: finalCorners,
      confidence
    };
  }

  // Fallback: estimate standard margins if marker detection is weak
  const fallbackCorners: QuadCorners = {
    tl: { x: Math.round(width * 0.04), y: Math.round(height * 0.03) },
    tr: { x: Math.round(width * 0.96), y: Math.round(height * 0.03) },
    bl: { x: Math.round(width * 0.04), y: Math.round(height * expectedBlYRatio) },
    br: { x: Math.round(width * 0.96), y: Math.round(height * expectedBrYRatio) }
  };

  return {
    success: false,
    corners: fallbackCorners,
    confidence: 30,
    message: 'Penanda sudut LJK tidak terdeteksi otomatis secara lengkap. Gunakan kalibrasi manual untuk menyesuaikan sudut.'
  };
}

/**
 * Computes the 3x3 Projective (Homography) Transformation Matrix
 * maps src Quad [TL, TR, BR, BL] to dst Quad
 */
function getPerspectiveTransform(src: Point[], dst: Point[]): number[] {
  // Solve A * h = 0 via Gaussian elimination or direct formula for 4 points
  const a: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;

    a.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    a.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  // Gaussian elimination to solve 8 equations
  const n = 8;
  for (let i = 0; i < n; i++) {
    // Pivot
    let maxEl = Math.abs(a[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > maxEl) {
        maxEl = Math.abs(a[k][i]);
        maxRow = k;
      }
    }
    // Swap
    for (let k = i; k < n; k++) {
      const tmp = a[maxRow][k];
      a[maxRow][k] = a[i][k];
      a[i][k] = tmp;
    }
    const tmpB = b[maxRow];
    b[maxRow] = b[i];
    b[i] = tmpB;

    // Eliminate
    for (let k = i + 1; k < n; k++) {
      const c = -a[k][i] / (a[i][i] || 1e-6);
      for (let j = i; j < n; j++) {
        if (i === j) a[k][j] = 0;
        else a[k][j] += c * a[i][j];
      }
      b[k] += c * b[i];
    }
  }

  // Back substitution
  const h = new Array(9).fill(0);
  h[8] = 1;
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let j = i + 1; j < n; j++) {
      sum -= a[i][j] * h[j];
    }
    h[i] = sum / (a[i][i] || 1e-6);
  }

  return h;
}

/**
 * Inverts a 3x3 matrix
 */
function invertMatrix3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-9) return m;

  const invDet = 1 / det;
  return [
    (e * i - f * h) * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (g * b - a * h) * invDet,
    (a * e - b * d) * invDet
  ];
}

/**
 * Warps source canvas using homography into standard target dimensions
 */
export function warpPerspective(
  srcCanvas: HTMLCanvasElement,
  corners: QuadCorners,
  targetWidth: number,
  targetHeight: number,
  template: OMRTemplate
): HTMLCanvasElement {
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = targetWidth;
  dstCanvas.height = targetHeight;
  const dstCtx = dstCanvas.getContext('2d')!;

  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
  const srcImgData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const srcData = srcImgData.data;
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;

  // The template registration marks define where the 4 corners should map onto target canvas
  // Find TL, TR, BR, BL coordinates in mm from template
  const tlMark = template.registrationMarks.find(m => m.corner === 'TL');
  const trMark = template.registrationMarks.find(m => m.corner === 'TR');
  const blMark = template.registrationMarks.find(m => m.corner === 'BL');
  const brMark = template.registrationMarks.find(m => m.corner === 'BR');

  const scaleX = targetWidth / template.paper.widthMm;
  const scaleY = targetHeight / template.paper.heightMm;

  // Center of each registration mark
  const halfMark = 3.5;
  const dstPts: Point[] = [
    { x: ((tlMark?.x || 5) + halfMark) * scaleX, y: ((tlMark?.y || 5) + halfMark) * scaleY },
    { x: ((trMark?.x || template.paper.widthMm - 12) + halfMark) * scaleX, y: ((trMark?.y || 5) + halfMark) * scaleY },
    { x: ((brMark?.x || template.paper.widthMm - 12) + halfMark) * scaleX, y: ((brMark?.y || template.paper.heightMm - 12) + halfMark) * scaleY },
    { x: ((blMark?.x || 5) + halfMark) * scaleX, y: ((blMark?.y || template.paper.heightMm - 12) + halfMark) * scaleY }
  ];

  const srcPts: Point[] = [corners.tl, corners.tr, corners.br, corners.bl];

  // We compute matrix that maps dst (x, y) back to src (sx, sy) for backward mapping interpolation
  const dstToSrc = getPerspectiveTransform(dstPts, srcPts);

  const dstImgData = dstCtx.createImageData(targetWidth, targetHeight);
  const dstData = dstImgData.data;

  // Bilinear backward warp
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = dstToSrc;

  for (let dy = 0; dy < targetHeight; dy++) {
    const rowOffset = dy * targetWidth * 4;
    for (let dx = 0; dx < targetWidth; dx++) {
      const w = m6 * dx + m7 * dy + m8;
      const sx = (m0 * dx + m1 * dy + m2) / w;
      const sy = (m3 * dx + m4 * dy + m5) / w;

      const px = Math.floor(sx);
      const py = Math.floor(sy);

      const dIdx = rowOffset + dx * 4;

      if (px >= 0 && px < srcW - 1 && py >= 0 && py < srcH - 1) {
        const fx = sx - px;
        const fy = sy - py;

        const idx00 = (py * srcW + px) * 4;
        const idx10 = idx00 + 4;
        const idx01 = ((py + 1) * srcW + px) * 4;
        const idx11 = idx01 + 4;

        for (let c = 0; c < 3; c++) {
          const val =
            (1 - fx) * (1 - fy) * srcData[idx00 + c] +
            fx * (1 - fy) * srcData[idx10 + c] +
            (1 - fx) * fy * srcData[idx01 + c] +
            fx * fy * srcData[idx11 + c];
          dstData[dIdx + c] = Math.round(val);
        }
        dstData[dIdx + 3] = 255;
      } else {
        dstData[dIdx] = 255;
        dstData[dIdx + 1] = 255;
        dstData[dIdx + 2] = 255;
        dstData[dIdx + 3] = 255;
      }
    }
  }

  dstCtx.putImageData(dstImgData, 0, 0);
  return dstCanvas;
}

/**
 * Measures the dark pixel fill ratio for a single bubble in the normalized canvas
 */
export function measureBubbleFill(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radiusPx: number,
  paperBaselineGray: number
): number {
  // Sample inner 70% of radius to avoid black stroke line of the circle
  const innerRadius = radiusPx * 0.68;
  const sampleRadius = Math.ceil(innerRadius);

  const startX = Math.floor(centerX - sampleRadius);
  const startY = Math.floor(centerY - sampleRadius);
  const size = sampleRadius * 2 + 1;

  if (startX < 0 || startY < 0) return 0;

  try {
    const imgData = ctx.getImageData(startX, startY, size, size);
    const data = imgData.data;

    let darkPixels = 0;
    let totalSamples = 0;

    // Adaptive bubble dark threshold relative to background paper brightness
    // Pencil 2B marks usually lower brightness by at least 25-35%
    const threshold = Math.min(135, paperBaselineGray * 0.72);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - sampleRadius;
        const dy = y - sampleRadius;
        const distSq = dx * dx + dy * dy;

        // Check if inside inner circle
        if (distSq <= innerRadius * innerRadius) {
          const idx = (y * size + x) * 4;
          const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

          if (gray < threshold) {
            darkPixels++;
          }
          totalSamples++;
        }
      }
    }

    return totalSamples > 0 ? darkPixels / totalSamples : 0;
  } catch {
    return 0;
  }
}

/**
 * Full OMR Sheet Processing
 */
export async function processOmrSheet(
  inputCanvas: HTMLCanvasElement,
  template: OMRTemplate,
  answerKey: AnswerKey | null,
  fileName: string,
  thresholdCutoff: number = 0.40,
  forcedCorners?: QuadCorners
): Promise<ScanResult> {
  const scanId = `SCAN-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`.toUpperCase();

  // Step 1: Detect registration marks or use forced calibration
  let calibration: CalibrationResult;
  if (forcedCorners) {
    calibration = {
      success: true,
      corners: forcedCorners,
      confidence: 100
    };
  } else {
    calibration = detectRegistrationMarks(inputCanvas, template);
  }

  // Normalized standard canvas resolution (10 px per mm for A4 gives 2100x2970 px)
  const pxPerMm = 7.5; // Optimal balance of crisp precision and fast processing speed (~1575 x 2227)
  const normW = Math.round(template.paper.widthMm * pxPerMm);
  const normH = Math.round(template.paper.heightMm * pxPerMm);

  // Step 2: Perspective warp
  const normalizedCanvas = warpPerspective(
    inputCanvas,
    calibration.corners!,
    normW,
    normH,
    template
  );

  const normCtx = normalizedCanvas.getContext('2d', { willReadFrequently: true })!;

  // Measure paper baseline brightness from neutral margin (top center)
  const baselineData = normCtx.getImageData(Math.round(normW / 2), Math.round(normH * 0.05), 40, 20).data;
  let graySum = 0;
  for (let i = 0; i < baselineData.length; i += 4) {
    graySum += 0.299 * baselineData[i] + 0.587 * baselineData[i + 1] + 0.114 * baselineData[i + 2];
  }
  const paperBaseline = baselineData.length > 0 ? graySum / (baselineData.length / 4) : 230;

  // Step 3: Read Student ID Grid (if present)
  let studentNumberDetected = '';
  if (template.studentIdGrid?.enabled) {
    const digitsCount = template.studentIdGrid.digits || 9;
    const detectedDigits: string[] = [];

    for (let d = 0; d < digitsCount; d++) {
      const qNum = 9990 + d;
      const digitBubbles = template.bubbleCoordinates.filter(
        b => b.questionNumber === qNum && b.subItemIndex === d
      );

      let maxRatio = -1;
      let chosenDigit = '';

      for (const b of digitBubbles) {
        const bx = b.x * pxPerMm;
        const by = b.y * pxPerMm;
        const br = b.radius * pxPerMm;
        const ratio = measureBubbleFill(normCtx, bx, by, br, paperBaseline);

        if (ratio > maxRatio) {
          maxRatio = ratio;
          chosenDigit = b.option;
        }
      }

      if (maxRatio >= thresholdCutoff) {
        detectedDigits.push(chosenDigit);
      } else {
        detectedDigits.push('_');
      }
    }

    studentNumberDetected = detectedDigits.join('');
  }

  // Step 4: Read All Question Bubbles
  // Group bubble coordinates by question number
  const questionsMap = new Map<number, typeof template.bubbleCoordinates>();
  for (const b of template.bubbleCoordinates) {
    if (b.questionNumber >= 9990) continue; // Skip Student ID grid bubbles here
    if (!questionsMap.has(b.questionNumber)) {
      questionsMap.set(b.questionNumber, []);
    }
    questionsMap.get(b.questionNumber)!.push(b);
  }

  const questionResults: Record<number, QuestionDetectionResult> = {};
  let totalScore = 0;
  let maxScore = 0;
  let hasPendingEssay = false;
  let needsVerification = !calibration.success;

  // Process each question
  for (const [qNum, bubbles] of questionsMap.entries()) {
    const qType = bubbles[0].type;
    const fillRatios: Record<string, number> = {};

    // Measure fill for all bubbles in this question
    for (const b of bubbles) {
      const bx = b.x * pxPerMm;
      const by = b.y * pxPerMm;
      const br = b.radius * pxPerMm;
      const ratio = measureBubbleFill(normCtx, bx, by, br, paperBaseline);
      const optKey = b.subItemIndex !== undefined ? `${b.subItemIndex}-${b.option}` : b.option;
      fillRatios[optKey] = Math.round(ratio * 100) / 100;
    }

    let detectedAnswer: any = null;
    let status: DetectedAnswerStatus = 'KOSONG';

    // Scoring setup from answer key if available
    const keyItem = answerKey?.questions?.[qNum];
    const qPoints = keyItem?.points || 2;
    maxScore += qPoints;
    let scoreEarned = 0;
    let isCorrect = false;

    // --- TYPE-SPECIFIC EVALUATION ---
    if (qType === 'PG') {
      // Find options above threshold
      const filledOpts = Object.entries(fillRatios)
        .filter(([_, ratio]) => ratio >= thresholdCutoff)
        .sort((a, b) => b[1] - a[1]);

      if (filledOpts.length === 0) {
        status = 'KOSONG';
        detectedAnswer = null;
      } else if (filledOpts.length === 1) {
        status = 'TERISI';
        detectedAnswer = filledOpts[0][0];
      } else {
        // Relative analysis: if top ratio is significantly higher than 2nd (e.g. 0.82 vs 0.42), pick top
        if (filledOpts[0][1] - filledOpts[1][1] > 0.35) {
          status = 'TERISI';
          detectedAnswer = filledOpts[0][0];
        } else {
          status = 'GANDA';
          detectedAnswer = filledOpts.map(f => f[0]).join(', ');
          needsVerification = true;
        }
      }

      // Check against answer key
      if (keyItem && detectedAnswer && status === 'TERISI') {
        if (detectedAnswer === keyItem.correctAnswer) {
          isCorrect = true;
          scoreEarned = qPoints;
        } else {
          isCorrect = false;
          scoreEarned = 0;
        }
      }
    } else if (qType === 'PG_KOMPLEKS') {
      // Multiple choices can be filled
      const filledOpts = Object.entries(fillRatios)
        .filter(([_, ratio]) => ratio >= thresholdCutoff)
        .map(f => f[0]);

      if (filledOpts.length === 0) {
        status = 'KOSONG';
        detectedAnswer = [];
      } else {
        status = 'TERISI';
        detectedAnswer = filledOpts;
      }

      // Complex PG Scoring
      if (keyItem && Array.isArray(keyItem.correctAnswer)) {
        const correctSet = new Set(keyItem.correctAnswer);
        const answeredSet = new Set(filledOpts);

        const correctChosen = filledOpts.filter(o => correctSet.has(o)).length;
        const wrongChosen = filledOpts.filter(o => !correctSet.has(o)).length;

        if (answerKey?.complexScoringMode === 'partial') {
          // Partial credit: proportion of correct answers minus penalty for wrong
          const prop = correctChosen / Math.max(1, correctSet.size);
          const penalty = wrongChosen * 0.25;
          scoreEarned = Math.max(0, Math.round((prop - penalty) * qPoints * 10) / 10);
          isCorrect = scoreEarned === qPoints;
        } else {
          // Full only: exact match
          const exact =
            filledOpts.length === keyItem.correctAnswer.length &&
            filledOpts.every(o => correctSet.has(o));
          if (exact) {
            isCorrect = true;
            scoreEarned = qPoints;
          } else {
            isCorrect = false;
            scoreEarned = 0;
          }
        }
      }
    } else if (qType === 'BENAR_SALAH') {
      // Sub-items: statements 0, 1, 2...
      const subAns: Record<number, string> = {};
      let anyEmpty = false;
      let anyDouble = false;

      // Group by subItemIndex
      const subIndices = Array.from(new Set(bubbles.map(b => b.subItemIndex || 0))).sort((a, b) => a - b);

      for (const sIdx of subIndices) {
        const bRatio = fillRatios[`${sIdx}-B`] || 0;
        const sRatio = fillRatios[`${sIdx}-S`] || 0;

        const bFilled = bRatio >= thresholdCutoff;
        const sFilled = sRatio >= thresholdCutoff;

        if (bFilled && sFilled) {
          subAns[sIdx] = 'GANDA';
          anyDouble = true;
        } else if (bFilled) {
          subAns[sIdx] = 'B';
        } else if (sFilled) {
          subAns[sIdx] = 'S';
        } else {
          subAns[sIdx] = '-';
          anyEmpty = true;
        }
      }

      detectedAnswer = subAns;
      if (anyDouble) {
        status = 'GANDA';
        needsVerification = true;
      } else if (anyEmpty && Object.values(subAns).every(v => v === '-')) {
        status = 'KOSONG';
      } else {
        status = anyEmpty ? 'PERLU_VERIFIKASI' : 'TERISI';
      }

      // Check key
      if (keyItem && typeof keyItem.correctAnswer === 'object') {
        let earnedPoints = 0;
        const ptsPerSub = qPoints / Math.max(1, subIndices.length);
        subIndices.forEach(sIdx => {
          if (subAns[sIdx] === keyItem.correctAnswer[sIdx]) {
            earnedPoints += ptsPerSub;
          }
        });
        scoreEarned = Math.round(earnedPoints * 10) / 10;
        isCorrect = scoreEarned >= qPoints;
      }
    } else if (qType === 'MENJODOHKAN') {
      // Pairs
      const pairAns: Record<number, string> = {};
      const subIndices = Array.from(new Set(bubbles.map(b => b.subItemIndex || 0))).sort((a, b) => a - b);
      let anyDouble = false;

      for (const sIdx of subIndices) {
        const pairChoices = ['A', 'B', 'C', 'D', 'E']
          .filter(opt => (fillRatios[`${sIdx}-${opt}`] || 0) >= thresholdCutoff);

        if (pairChoices.length === 1) {
          pairAns[sIdx] = pairChoices[0];
        } else if (pairChoices.length > 1) {
          pairAns[sIdx] = 'GANDA';
          anyDouble = true;
        } else {
          pairAns[sIdx] = '-';
        }
      }

      detectedAnswer = pairAns;
      status = anyDouble ? 'GANDA' : Object.values(pairAns).every(v => v === '-') ? 'KOSONG' : 'TERISI';

      if (keyItem && typeof keyItem.correctAnswer === 'object') {
        let earned = 0;
        const ptsPerItem = qPoints / Math.max(1, subIndices.length);
        subIndices.forEach(sIdx => {
          if (pairAns[sIdx] === keyItem.correctAnswer[sIdx]) {
            earned += ptsPerItem;
          }
        });
        scoreEarned = Math.round(earned * 10) / 10;
        isCorrect = scoreEarned >= qPoints;
      }
    } else {
      // Essay / Uraian
      hasPendingEssay = true;
      status = 'PERLU_VERIFIKASI';
      detectedAnswer = '(Perlu koreksi manual guru)';
      scoreEarned = 0;
      isCorrect = false;
    }

    if ((status as string) === 'GANDA' || (status as string) === 'TIDAK_TERBACA' || (status as string) === 'PERLU_VERIFIKASI') {
      needsVerification = true;
    }

    totalScore += scoreEarned;

    questionResults[qNum] = {
      questionNumber: qNum,
      type: qType,
      detectedAnswer,
      status,
      fillRatios,
      isCorrect,
      scoreEarned,
      maxScore: qPoints
    };
  }

  // Also include essay questions from template that don't have bubbles
  const essayQuestions = template.questions.filter(
    q => (q.type === 'URAIAN_SINGKAT' || q.type === 'URAIAN_PANJANG') && q.enabled
  );
  for (const eq of essayQuestions) {
    for (const num of eq.numbers) {
      if (!questionResults[num]) {
        hasPendingEssay = true;
        const pts = eq.pointsPerItem || 5;
        maxScore += pts;
        questionResults[num] = {
          questionNumber: num,
          type: eq.type,
          detectedAnswer: '(Uraian tulisan tangan siswa)',
          status: 'PERLU_VERIFIKASI',
          fillRatios: {},
          scoreEarned: 0,
          maxScore: pts,
          notes: 'Menunggu penilaian manual guru'
        };
      }
    }
  }

  const finalGrade = maxScore > 0 ? Math.round((totalScore / maxScore) * 1000) / 10 : 0;
  const isPassed = finalGrade >= 75; // Checked against KKTP

  // Convert normalized sheet canvas to data URL for high-res visual verification preview
  const sheetImageDataUrl = normalizedCanvas.toDataURL('image/jpeg', 0.85);

  return {
    scanId,
    templateId: template.templateId,
    keyId: answerKey?.keyId,
    timestamp: new Date().toISOString(),
    fileName,
    studentNumberDetected: studentNumberDetected.replace(/_/g, '').length >= 3 ? studentNumberDetected : undefined,
    totalScore: Math.round(totalScore * 10) / 10,
    maxScore,
    finalGrade,
    isPassed,
    needsVerification,
    verificationStatus: 'BELUM_DIVERIFIKASI',
    questionResults,
    isPendingEssay: hasPendingEssay,
    sheetImageDataUrl,
    calibrationConfidence: calibration.confidence,
    detectedCorners: calibration.corners ? [
      calibration.corners.tl,
      calibration.corners.tr,
      calibration.corners.br,
      calibration.corners.bl
    ] : undefined
  };
}
