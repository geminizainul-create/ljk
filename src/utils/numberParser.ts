/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parses user input string like "1-5, 8, 10-15" into sorted unique array [1, 2, 3, 4, 5, 8, 10, 11, 12, 13, 14, 15]
 */
export function parseQuestionNumbers(input: string): { numbers: number[]; error?: string } {
  if (!input || !input.trim()) {
    return { numbers: [] };
  }

  const parts = input.split(/[,;\s]+/).map(p => p.trim()).filter(Boolean);
  const resultSet = new Set<number>();

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (isNaN(start) || isNaN(end)) {
        return { numbers: [], error: `Format rentang tidak valid: "${part}"` };
      }
      if (start <= 0 || end <= 0) {
        return { numbers: [], error: `Nomor soal harus lebih dari 0: "${part}"` };
      }
      if (start > end) {
        return { numbers: [], error: `Rentang terbalik: "${part}". Gunakan urutan kecil ke besar.` };
      }
      if (end - start > 100) {
        return { numbers: [], error: `Rentang terlalu besar (${part}). Maksimal 100 soal per rentang.` };
      }

      for (let i = start; i <= end; i++) {
        resultSet.add(i);
      }
    } else {
      const num = parseInt(part, 10);
      if (isNaN(num)) {
        return { numbers: [], error: `Nomor tidak valid: "${part}"` };
      }
      if (num <= 0) {
        return { numbers: [], error: `Nomor soal harus lebih dari 0: "${part}"` };
      }
      resultSet.add(num);
    }
  }

  const numbers = Array.from(resultSet).sort((a, b) => a - b);
  return { numbers };
}

/**
 * Formats an array of numbers into a compact string representation, e.g. [1,2,3,4,8,10] -> "1-4, 8, 10"
 */
export function formatQuestionNumbers(nums: number[]): string {
  if (!nums || nums.length === 0) return '';
  const sorted = [...nums].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current === prev + 1) {
      prev = current;
    } else {
      if (start === prev) {
        ranges.push(`${start}`);
      } else if (prev === start + 1) {
        ranges.push(`${start}, ${prev}`);
      } else {
        ranges.push(`${start}-${prev}`);
      }
      start = current;
      prev = current;
    }
  }

  return ranges.join(', ');
}

/**
 * Checks for collision across question type configs
 */
export function checkDuplicateQuestionNumbers(
  configs: { type: string; numbers: number[]; enabled: boolean }[]
): { hasDuplicates: boolean; duplicates: number[] } {
  const seen = new Map<number, string>();
  const duplicates = new Set<number>();

  for (const cfg of configs) {
    if (!cfg.enabled) continue;
    for (const num of cfg.numbers) {
      if (seen.has(num)) {
        duplicates.add(num);
      } else {
        seen.set(num, cfg.type);
      }
    }
  }

  return {
    hasDuplicates: duplicates.size > 0,
    duplicates: Array.from(duplicates).sort((a, b) => a - b)
  };
}
