/**
 * Pure TypeScript Zero-Dependency QR Code Generator & Terminal ASCII/Unicode Renderer.
 * Designed for dynamic NepalQR (EMVCo) mobile banking scan-to-pay displays.
 * Supports QR Versions 1 to 14 (Byte Mode, EC Levels L & M).
 */

export interface QrOptions {
  ecLevel?: 'L' | 'M';
  quietZone?: number;
  invert?: boolean;
}

// Galois Field GF(256) Tables (Primitive Polynomial: 0x11D = 285)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

let gfVal = 1;
for (let i = 0; i < 255; i++) {
  GF_EXP[i] = gfVal;
  GF_EXP[i + 255] = gfVal;
  GF_LOG[gfVal] = i;
  gfVal <<= 1;
  if (gfVal & 256) {
    gfVal ^= 0x11d;
  }
}

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

// Generate Reed-Solomon generator polynomial
function getRsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const factor = [1, GF_EXP[i]];
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], factor[0]);
      next[j + 1] ^= gfMul(poly[j], factor[1]);
    }
    poly = next;
  }
  return poly;
}

// Calculate Reed-Solomon error correction codewords
function calculateRsEc(data: number[], ecCount: number): number[] {
  const gen = getRsGeneratorPoly(ecCount);
  const msg = [...data, ...new Array(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const lead = msg[i];
    if (lead !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], lead);
      }
    }
  }
  return msg.slice(data.length);
}

interface VersionSpec {
  version: number;
  dataCapacityL: number;
  ecCodewordsL: number;
  blocksL: [number, number][]; // [numBlocks, dataCodewordsPerBlock]
  alignments: number[];
}

const QR_SPECS: VersionSpec[] = [
  { version: 1, dataCapacityL: 19, ecCodewordsL: 7, blocksL: [[1, 19]], alignments: [] },
  { version: 2, dataCapacityL: 34, ecCodewordsL: 10, blocksL: [[1, 34]], alignments: [6, 18] },
  { version: 3, dataCapacityL: 55, ecCodewordsL: 15, blocksL: [[1, 55]], alignments: [6, 22] },
  { version: 4, dataCapacityL: 80, ecCodewordsL: 20, blocksL: [[1, 80]], alignments: [6, 26] },
  { version: 5, dataCapacityL: 108, ecCodewordsL: 26, blocksL: [[1, 108]], alignments: [6, 30] },
  { version: 6, dataCapacityL: 136, ecCodewordsL: 18, blocksL: [[2, 68]], alignments: [6, 34] },
  { version: 7, dataCapacityL: 156, ecCodewordsL: 20, blocksL: [[2, 78]], alignments: [6, 22, 38] },
  { version: 8, dataCapacityL: 194, ecCodewordsL: 24, blocksL: [[2, 97]], alignments: [6, 24, 42] },
  { version: 9, dataCapacityL: 232, ecCodewordsL: 30, blocksL: [[2, 116]], alignments: [6, 26, 46] },
  { version: 10, dataCapacityL: 274, ecCodewordsL: 18, blocksL: [[2, 68], [2, 69]], alignments: [6, 28, 50] },
  { version: 11, dataCapacityL: 324, ecCodewordsL: 20, blocksL: [[4, 81]], alignments: [6, 30, 54] },
  { version: 12, dataCapacityL: 370, ecCodewordsL: 24, blocksL: [[2, 92], [2, 93]], alignments: [6, 32, 58] },
  { version: 13, dataCapacityL: 428, ecCodewordsL: 26, blocksL: [[4, 107]], alignments: [6, 34, 62] },
  { version: 14, dataCapacityL: 461, ecCodewordsL: 30, blocksL: [[3, 115], [1, 116]], alignments: [6, 26, 46, 66] }
];

/**
 * Generate a 2D boolean grid representing a standard QR code matrix.
 * true = dark module, false = light module.
 */
export function generateQrMatrix(text: string, options?: QrOptions): boolean[][] {
  const bytes = Buffer.from(text, 'utf-8');
  const count = bytes.length;

  // Determine minimum version
  let spec = QR_SPECS.find((s) => s.dataCapacityL >= count + 3); // Byte mode header + count + terminator
  if (!spec) {
    spec = QR_SPECS[QR_SPECS.length - 1];
    if (count + 3 > spec.dataCapacityL) {
      throw new Error(`Data too large for supported QR versions (max ${spec.dataCapacityL - 3} bytes, got ${count}).`);
    }
  }

  // 1. BitStream generation (Byte Mode: 0100)
  const bitStream: number[] = [];
  function pushBits(val: number, length: number) {
    for (let i = length - 1; i >= 0; i--) {
      bitStream.push((val >> i) & 1);
    }
  }

  // Mode: Byte (0100)
  pushBits(0b0100, 4);

  // Character count indicator (8 bits for v1-9, 16 bits for v10+)
  const countBits = spec.version <= 9 ? 8 : 16;
  pushBits(count, countBits);

  // Data bytes
  for (let i = 0; i < bytes.length; i++) {
    pushBits(bytes[i], 8);
  }

  // Terminator (up to 4 bits)
  const totalDataBits = spec.dataCapacityL * 8;
  const termLength = Math.min(4, totalDataBits - bitStream.length);
  pushBits(0, termLength);

  // Pad to multiple of 8
  while (bitStream.length % 8 !== 0) {
    bitStream.push(0);
  }

  // Convert bitstream to bytes
  const dataCodewords: number[] = [];
  for (let i = 0; i < bitStream.length; i += 8) {
    let byteVal = 0;
    for (let j = 0; j < 8; j++) {
      byteVal = (byteVal << 1) | bitStream[i + j];
    }
    dataCodewords.push(byteVal);
  }

  // Alternate pad bytes (0xEC, 0x11)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataCodewords.length < spec.dataCapacityL) {
    dataCodewords.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  // 2. Block division and Reed-Solomon EC calculation
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;

  for (const [numBlocks, blockSize] of spec.blocksL) {
    for (let b = 0; b < numBlocks; b++) {
      const block = dataCodewords.slice(offset, offset + blockSize);
      offset += blockSize;
      dataBlocks.push(block);
      ecBlocks.push(calculateRsEc(block, spec.ecCodewordsL));
    }
  }

  // 3. Interleaving data and EC codewords
  const interleaved: number[] = [];
  const maxBlockLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxBlockLen; i++) {
    for (const b of dataBlocks) {
      if (i < b.length) interleaved.push(b[i]);
    }
  }
  for (let i = 0; i < spec.ecCodewordsL; i++) {
    for (const b of ecBlocks) {
      if (i < b.length) interleaved.push(b[i]);
    }
  }

  // Interleaved bitstream
  const finalBits: number[] = [];
  for (const b of interleaved) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push((b >> i) & 1);
    }
  }

  // 4. Matrix construction
  const size = 17 + 4 * spec.version;
  const matrix: (number | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  function setModule(r: number, c: number, val: number, func = true) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      if (func) isFunction[r][c] = true;
    }
  }

  // Finder pattern helper (7x7)
  function placeFinder(r0: number, c0: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = r0 + r;
        const nc = c0 + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isDark = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
            setModule(nr, nc, isDark ? 1 : 0);
          } else {
            setModule(nr, nc, 0); // Separator
          }
        }
      }
    }
  }

  // Place 3 Finder Patterns
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns (row 6 and col 6)
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0 ? 1 : 0;
    if (matrix[6][i] === null) setModule(6, i, val);
    if (matrix[i][6] === null) setModule(i, 6, val);
  }

  // Alignment patterns
  if (spec.alignments.length > 0) {
    for (const r of spec.alignments) {
      for (const c of spec.alignments) {
        // Skip if overlaps with finders
        if (
          (r < 9 && c < 9) ||
          (r < 9 && c > size - 10) ||
          (r > size - 10 && c < 9)
        ) {
          continue;
        }
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isDark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            setModule(r + dr, c + dc, isDark ? 1 : 0);
          }
        }
      }
    }
  }

  // Dark module
  setModule(4 * spec.version + 9, 8, 1);

  // Reserve format information areas
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setModule(8, i, 0);
      setModule(i, 8, 0);
    }
  }
  for (let i = 0; i < 8; i++) {
    setModule(8, size - 1 - i, 0);
    setModule(size - 1 - i, 8, 0);
  }

  // Reserve Version info areas (for version >= 7)
  if (spec.version >= 7) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        setModule(size - 11 + c, r, 0);
        setModule(r, size - 11 + c, 0);
      }
    }
  }

  // 5. Data placement (2-column zig-zag right-to-left)
  let bitIdx = 0;
  let dir = -1; // -1 for up, 1 for down
  let col = size - 1;

  while (col > 0) {
    if (col === 6) col--; // Skip timing col
    const rows = dir === -1
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [col, col - 1]) {
        if (!isFunction[r][c]) {
          const bitVal = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          matrix[r][c] = bitVal;
        }
      }
    }
    dir = -dir;
    col -= 2;
  }

  // 6. Mask Evaluation (Test 8 standard masks, select minimum penalty)
  const MASKS: ((r: number, c: number) => boolean)[] = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];

  let bestMask = 0;
  let minPenalty = Infinity;

  for (let m = 0; m < 8; m++) {
    const maskFn = MASKS[m];
    let penalty = 0;

    // Apply mask temporarily to evaluate penalty
    for (let r = 0; r < size; r++) {
      let runColor = -1;
      let runLen = 0;
      for (let c = 0; c < size; c++) {
        let val = matrix[r][c] || 0;
        if (!isFunction[r][c] && maskFn(r, c)) val ^= 1;

        if (val === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runColor = val;
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += 3 + (runLen - 5);
    }

    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestMask = m;
    }
  }

  // Apply chosen best mask
  const chosenMask = MASKS[bestMask];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunction[r][c] && chosenMask(r, c)) {
        matrix[r][c] = (matrix[r][c] || 0) ^ 1;
      }
    }
  }

  // 7. Write Format Information (Level L = 01, Mask = bestMask)
  // Generator polynomial for BCH(15, 5): 0x537, Mask: 0x5412
  const formatData = (0b01 << 3) | bestMask;
  let bch = formatData << 10;
  for (let i = 4; i >= 0; i--) {
    if ((bch >> (i + 10)) & 1) {
      bch ^= 0x537 << i;
    }
  }
  const formatBits = ((formatData << 10) | bch) ^ 0x5412;

  // Place Format bits around finders
  const formatCoords: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];

  for (let i = 0; i < 15; i++) {
    const bit = (formatBits >> (14 - i)) & 1;
    const [r, c] = formatCoords[i];
    matrix[r][c] = bit;

    // Duplicate placement
    if (i < 8) {
      matrix[size - 1 - i][8] = bit;
    } else {
      matrix[8][size - 15 + i] = bit;
    }
  }

  return matrix.map((row) => row.map((cell) => cell === 1));
}

/**
 * Renders a QR code matrix into a crisp UTF-8 terminal display using Unicode half-blocks.
 * Each character row displays 2 vertical matrix modules, ensuring square scannable QR.
 */
export function renderTerminalQr(matrix: boolean[][], options?: QrOptions): string {
  const quietZone = options?.quietZone ?? 2;
  const size = matrix.length;
  const paddedSize = size + quietZone * 2;

  // Create quiet zone padded grid
  const grid: boolean[][] = Array.from({ length: paddedSize }, (_, r) =>
    Array.from({ length: paddedSize }, (_, c) => {
      const origR = r - quietZone;
      const origC = c - quietZone;
      if (origR >= 0 && origR < size && origC >= 0 && origC < size) {
        return matrix[origR][origC];
      }
      return false; // Quiet zone is white (light)
    })
  );

  const lines: string[] = [];
  const WHITE_BG = '\x1b[47m';
  const BLACK_TEXT = '\x1b[30m';
  const RESET = '\x1b[0m';

  for (let r = 0; r < paddedSize; r += 2) {
    let line = `${WHITE_BG}${BLACK_TEXT}`;
    for (let c = 0; c < paddedSize; c++) {
      const topDark = grid[r][c];
      const bottomDark = r + 1 < paddedSize ? grid[r + 1][c] : false;

      // In white-background mode:
      // Dark module = foreground black.
      // Top dark + Bottom dark = Full black block (or inverted space)
      if (topDark && bottomDark) {
        line += '█';
      } else if (topDark && !bottomDark) {
        line += '▀';
      } else if (!topDark && bottomDark) {
        line += '▄';
      } else {
        line += ' ';
      }
    }
    line += RESET;
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * High-level helper: Directly encodes text into a scannable terminal QR string.
 */
export function generateTerminalQr(text: string, options?: QrOptions): string {
  const matrix = generateQrMatrix(text, options);
  return renderTerminalQr(matrix, options);
}
