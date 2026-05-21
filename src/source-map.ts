interface SourceMapJson {
  readonly mappings?: unknown;
  readonly sources?: unknown;
}

interface OriginalLinePosition {
  readonly generatedLine: number;
  readonly sourceIndex: number;
  readonly originalLine: number;
}

const base64Values = new Map<string, number>(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    .split("")
    .map((char, index) => [char, index]),
);

const decodeVlq = (segment: string, offset: number): readonly [number, number] | undefined => {
  let result = 0;
  let shift = 0;
  let index = offset;

  while (index < segment.length) {
    const digit = base64Values.get(segment[index] ?? "");
    if (digit == null) return undefined;
    index += 1;

    result += (digit & 31) << shift;
    if ((digit & 32) === 0) {
      const negative = (result & 1) === 1;
      const value = result >> 1;
      return [negative ? -value : value, index];
    }
    shift += 5;
  }

  return undefined;
};

const decodeSegment = (segment: string): ReadonlyArray<number> | undefined => {
  const values: Array<number> = [];
  let index = 0;
  while (index < segment.length) {
    const decoded = decodeVlq(segment, index);
    if (decoded == null) return undefined;
    values.push(decoded[0]);
    index = decoded[1];
  }
  return values;
};

const decodeFirstColumnMappings = (mappings: string): ReadonlyArray<OriginalLinePosition> => {
  const positions: Array<OriginalLinePosition> = [];
  let sourceIndex = 0;
  let originalLine = 0;

  const lines = mappings.split(";");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    let generatedColumn = 0;
    const segments = (lines[lineIndex] ?? "").split(",").filter((segment) => segment.length > 0);

    for (const segment of segments) {
      const values = decodeSegment(segment);
      if (values == null || values.length === 0) continue;
      generatedColumn += values[0] ?? 0;
      if (values.length < 4 || generatedColumn > 0) continue;

      sourceIndex += values[1] ?? 0;
      originalLine += values[2] ?? 0;

      positions.push({
        generatedLine: lineIndex + 1,
        sourceIndex,
        originalLine: originalLine + 1,
      });
      break;
    }
  }

  return positions;
};

export const buildSourceLineMap = (
  content: string,
  mapContent: string,
): Readonly<Record<number, number>> | undefined => {
  try {
    const parsed = JSON.parse(mapContent) as SourceMapJson;
    if (typeof parsed.mappings !== "string") return undefined;

    const decoded = decodeFirstColumnMappings(parsed.mappings);
    if (decoded.length === 0) return undefined;

    const lineMap: Record<number, number> = {};
    const generatedLineCount = content.split(/\r?\n/u).length;
    for (const position of decoded) {
      if (position.generatedLine > generatedLineCount) continue;
      if (position.sourceIndex !== 0) continue;
      lineMap[position.generatedLine] = position.originalLine;
    }

    return lineMap;
  } catch {
    return undefined;
  }
};
