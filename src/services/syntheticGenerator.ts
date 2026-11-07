/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OMRTemplate, AnswerKey } from '../types/ljk';
import { generateLjkPdfAndTemplate } from './pdfGenerator';

export interface SyntheticScanOptions {
  template: OMRTemplate;
  answerKey?: AnswerKey | null;
  studentNumber?: string; // e.g. "090010001"
  fillAccuracy?: number; // 0.0 to 1.0 (proportion answering correctly according to key)
  introduceDoubleMark?: boolean;
  introduceBlank?: boolean;
  introduceTiltAngle?: number; // degrees, e.g. 0.8
  pencilDarkness?: number; // 0.6 to 0.95
}

/**
 * Generates an HTMLCanvasElement rendering a realistic scanned paper sheet with filled pencil marks
 */
export async function generateSyntheticScanCanvas(
  options: SyntheticScanOptions
): Promise<{
  canvas: HTMLCanvasElement;
  groundTruth: Record<number, any>;
  studentNumber: string;
}> {
  const {
    template,
    answerKey,
    studentNumber = '090010001',
    fillAccuracy = 0.85,
    introduceDoubleMark = true,
    introduceBlank = true,
    introduceTiltAngle = 0.5,
    pencilDarkness = 0.85
  } = options;

  // Render base PDF using pdfGenerator
  const { doc } = generateLjkPdfAndTemplate({
    exam: template.exam,
    questions: template.questions,
    paperSize: template.paper.size,
    orientation: template.paper.orientation,
    studentIdGridEnabled: !!template.studentIdGrid?.enabled,
    studentIdDigits: template.studentIdGrid?.digits || 9
  });

  // Convert PDF page 1 to an image via blob / pdfjs-dist or render directly on canvas
  const pxPerMm = 7.5;
  const canvasW = Math.round(template.paper.widthMm * pxPerMm);
  const canvasH = Math.round(template.paper.heightMm * pxPerMm);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;

  // 1. Base paper background (slightly off-white like real photocopy paper)
  ctx.fillStyle = '#fbfbfa';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 2. Draw standard layout elements onto canvas for high-fidelity rendering
  // Registration marks at 4 corners
  template.registrationMarks.forEach(m => {
    const rx = m.x * pxPerMm;
    const ry = m.y * pxPerMm;
    const rSize = m.size * pxPerMm;
    ctx.fillStyle = '#111111';
    ctx.fillRect(rx, ry, rSize, rSize);
    // Center white dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(rx + rSize / 2, ry + rSize / 2, 0.75 * pxPerMm, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw Header text & boxes
  ctx.fillStyle = '#111111';
  ctx.font = `bold ${Math.round(2.6 * pxPerMm)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(template.exam.pemerintah.toUpperCase(), canvasW / 2, 14 * pxPerMm);
  ctx.fillText(template.exam.dinas.toUpperCase(), canvasW / 2, 18.5 * pxPerMm);
  ctx.font = `bold ${Math.round(3.4 * pxPerMm)}px sans-serif`;
  ctx.fillText(template.exam.namaSekolah.toUpperCase(), canvasW / 2, 23 * pxPerMm);

  // Sesuai aturan terbaru: Kop surat tanpa garis pembatas bawah

  // Draw title banner
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(10 * pxPerMm, 30 * pxPerMm, canvasW - 20 * pxPerMm, 7 * pxPerMm);
  ctx.strokeRect(10 * pxPerMm, 30 * pxPerMm, canvasW - 20 * pxPerMm, 7 * pxPerMm);
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${Math.round(2.6 * pxPerMm)}px sans-serif`;
  ctx.fillText(`LEMBAR JAWABAN KOMPUTER - ${template.exam.namaUjian.toUpperCase()}`, canvasW / 2, 35 * pxPerMm);

  // Draw Student ID grid outline and bubbles
  if (template.studentIdGrid?.enabled) {
    const grid = template.studentIdGrid;
    const digits = grid.digits || 9;
    const idBubbles = template.bubbleCoordinates.filter(b => b.questionNumber >= 9990);

    for (const b of idBubbles) {
      const bx = b.x * pxPerMm;
      const by = b.y * pxPerMm;
      const br = b.radius * pxPerMm;

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#334155';
      ctx.font = `${Math.round(1.5 * pxPerMm)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(b.option, bx, by + 0.5 * pxPerMm);
    }
  }

  // Draw Question bubbles outlines and labels
  const qBubbles = template.bubbleCoordinates.filter(b => b.questionNumber < 9990);
  for (const b of qBubbles) {
    const bx = b.x * pxPerMm;
    const by = b.y * pxPerMm;
    const br = b.radius * pxPerMm;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.font = `bold ${Math.round(1.8 * pxPerMm)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(b.option, bx, by + 0.6 * pxPerMm);
  }

  // Helper to draw realistic 2B pencil shading inside a bubble
  const shadePencilBubble = (centerX: number, centerY: number, radiusPx: number) => {
    const fillR = radiusPx * 0.88;
    const jitterX = (Math.random() - 0.5) * 0.8;
    const jitterY = (Math.random() - 0.5) * 0.8;

    // Dark graphite core
    const grad = ctx.createRadialGradient(
      centerX + jitterX, centerY + jitterY, fillR * 0.2,
      centerX, centerY, fillR
    );
    grad.addColorStop(0, `rgba(32, 35, 42, ${pencilDarkness})`);
    grad.addColorStop(0.75, `rgba(40, 44, 52, ${pencilDarkness * 0.9})`);
    grad.addColorStop(1, `rgba(60, 64, 72, ${pencilDarkness * 0.65})`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(centerX + jitterX, centerY + jitterY, fillR, 0, Math.PI * 2);
    ctx.fill();

    // Subtle pencil stroke texture
    ctx.strokeStyle = `rgba(20, 22, 28, ${pencilDarkness * 0.4})`;
    ctx.lineWidth = 0.8;
    for (let i = -fillR * 0.7; i <= fillR * 0.7; i += 2) {
      ctx.beginPath();
      ctx.moveTo(centerX - fillR * 0.6, centerY + i);
      ctx.lineTo(centerX + fillR * 0.6, centerY + i + 1);
      ctx.stroke();
    }
  };

  // 3. Shade Student ID Grid according to studentNumber digits
  const cleanDigits = studentNumber.replace(/\D/g, '').padEnd(template.studentIdGrid?.digits || 9, '0');
  for (let d = 0; d < cleanDigits.length; d++) {
    const digitChar = cleanDigits[d];
    const targetBubble = template.bubbleCoordinates.find(
      b => b.questionNumber === 9990 + d && b.option === digitChar
    );
    if (targetBubble) {
      shadePencilBubble(
        targetBubble.x * pxPerMm,
        targetBubble.y * pxPerMm,
        targetBubble.radius * pxPerMm
      );
    }
  }

  // 4. Decide Ground Truth answers and shade questions
  const groundTruth: Record<number, any> = {};
  const questionsMap = new Map<number, typeof template.bubbleCoordinates>();
  for (const b of qBubbles) {
    if (!questionsMap.has(b.questionNumber)) {
      questionsMap.set(b.questionNumber, []);
    }
    questionsMap.get(b.questionNumber)!.push(b);
  }

  const qNumbers = Array.from(questionsMap.keys()).sort((a, b) => a - b);

  // Pick a couple questions for testing edge cases
  const blankQ = introduceBlank && qNumbers.length > 5 ? qNumbers[Math.floor(qNumbers.length * 0.7)] : -1;
  const doubleQ = introduceDoubleMark && qNumbers.length > 8 ? qNumbers[Math.floor(qNumbers.length * 0.4)] : -1;

  for (const qNum of qNumbers) {
    const bubbles = questionsMap.get(qNum)!;
    const qType = bubbles[0].type;
    const keyItem = answerKey?.questions?.[qNum];

    if (qNum === blankQ) {
      // Leave empty
      groundTruth[qNum] = null;
      continue;
    }

    if (qType === 'PG') {
      const options = Array.from(new Set(bubbles.map(b => b.option)));
      let chosenOpt = options[0];

      if (keyItem && Math.random() < fillAccuracy) {
        chosenOpt = keyItem.correctAnswer;
      } else {
        chosenOpt = options[Math.floor(Math.random() * options.length)];
      }

      const bubbleToFill = bubbles.find(b => b.option === chosenOpt);
      if (bubbleToFill) {
        shadePencilBubble(bubbleToFill.x * pxPerMm, bubbleToFill.y * pxPerMm, bubbleToFill.radius * pxPerMm);
      }

      if (qNum === doubleQ) {
        // Also shade another option to simulate double fill error
        const otherOpt = options.find(o => o !== chosenOpt) || options[1];
        const otherBubble = bubbles.find(b => b.option === otherOpt);
        if (otherBubble) {
          shadePencilBubble(otherBubble.x * pxPerMm, otherBubble.y * pxPerMm, otherBubble.radius * pxPerMm);
        }
        groundTruth[qNum] = `${chosenOpt}, ${otherOpt}`;
      } else {
        groundTruth[qNum] = chosenOpt;
      }
    } else if (qType === 'PG_KOMPLEKS') {
      // Fill 1 or 2 options
      const options = Array.from(new Set(bubbles.map(b => b.option)));
      const chosenOpts = (keyItem && Array.isArray(keyItem.correctAnswer) && Math.random() < fillAccuracy)
        ? keyItem.correctAnswer
        : [options[0], options[2] || options[1]];

      chosenOpts.forEach((opt: string) => {
        const b = bubbles.find(bub => bub.option === opt);
        if (b) shadePencilBubble(b.x * pxPerMm, b.y * pxPerMm, b.radius * pxPerMm);
      });
      groundTruth[qNum] = chosenOpts;
    } else if (qType === 'BENAR_SALAH') {
      const subIndices = Array.from(new Set(bubbles.map(b => b.subItemIndex || 0)));
      const res: Record<number, string> = {};

      subIndices.forEach(sIdx => {
        const correct = keyItem?.correctAnswer?.[sIdx] || (Math.random() > 0.5 ? 'B' : 'S');
        const b = bubbles.find(bub => bub.subItemIndex === sIdx && bub.option === correct);
        if (b) shadePencilBubble(b.x * pxPerMm, b.y * pxPerMm, b.radius * pxPerMm);
        res[sIdx] = correct;
      });
      groundTruth[qNum] = res;
    } else if (qType === 'MENJODOHKAN') {
      const subIndices = Array.from(new Set(bubbles.map(b => b.subItemIndex || 0)));
      const res: Record<number, string> = {};
      const opts = ['A', 'B', 'C', 'D', 'E'];

      subIndices.forEach((sIdx, idx) => {
        const opt = keyItem?.correctAnswer?.[sIdx] || opts[idx % opts.length];
        const b = bubbles.find(bub => bub.subItemIndex === sIdx && bub.option === opt);
        if (b) shadePencilBubble(b.x * pxPerMm, b.y * pxPerMm, b.radius * pxPerMm);
        res[sIdx] = opt;
      });
      groundTruth[qNum] = res;
    }
  }

  // 5. Add slight realistic tilt and paper texture if requested
  if (Math.abs(introduceTiltAngle) > 0.05) {
    const tiltedCanvas = document.createElement('canvas');
    tiltedCanvas.width = canvasW;
    tiltedCanvas.height = canvasH;
    const tCtx = tiltedCanvas.getContext('2d')!;

    // Background scanner bed
    tCtx.fillStyle = '#e2e8f0';
    tCtx.fillRect(0, 0, canvasW, canvasH);

    tCtx.save();
    tCtx.translate(canvasW / 2, canvasH / 2);
    tCtx.rotate((introduceTiltAngle * Math.PI) / 180);
    tCtx.drawImage(canvas, -canvasW / 2, -canvasH / 2);
    tCtx.restore();

    return {
      canvas: tiltedCanvas,
      groundTruth,
      studentNumber
    };
  }

  return {
    canvas,
    groundTruth,
    studentNumber
  };
}
