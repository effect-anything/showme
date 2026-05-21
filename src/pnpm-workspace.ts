const stripComment = (line: string): string => {
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quote != null) {
      if (char === quote && line[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "#") return line.slice(0, index);
  }
  return line;
};

const indentOf = (line: string): number => line.length - line.trimStart().length;

const unquoteYamlString = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const quote = trimmed[0];
  if ((quote !== "'" && quote !== '"') || trimmed[trimmed.length - 1] !== quote) return trimmed;

  const inner = trimmed.slice(1, -1);
  if (quote === "'") return inner.replaceAll("''", "'");
  return inner.replace(/\\(["\\/bfnrt])/gu, (_match: string, escaped: string) => {
    switch (escaped) {
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return escaped;
    }
  });
};

const parseInlineStringArray = (value: string): ReadonlyArray<string> | undefined => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return undefined;
  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) return [];
  return inner
    .split(",")
    .map((item) => unquoteYamlString(item))
    .filter((item) => item.length > 0);
};

export const parsePnpmWorkspacePackages = (content: string): ReadonlyArray<string> => {
  const lines = content.split(/\r?\n/u);
  const packages: Array<string> = [];

  for (let index = 0; index < lines.length; index++) {
    const line = stripComment(lines[index] ?? "").trimEnd();
    if (line.trim().length === 0) continue;

    const match = /^(\s*)packages\s*:\s*(.*)$/u.exec(line);
    if (match == null) continue;

    const baseIndent = match[1]?.length ?? 0;
    const inlineValue = match[2] ?? "";
    const inlinePackages = parseInlineStringArray(inlineValue);
    if (inlinePackages != null) return inlinePackages;
    if (inlineValue.trim().length > 0) return [];

    for (index += 1; index < lines.length; index++) {
      const itemLine = stripComment(lines[index] ?? "").trimEnd();
      if (itemLine.trim().length === 0) continue;
      const itemIndent = indentOf(itemLine);
      if (itemIndent <= baseIndent) {
        index -= 1;
        break;
      }

      const trimmed = itemLine.trimStart();
      if (!trimmed.startsWith("-")) continue;
      const value = trimmed.slice(1).trim();
      if (value.length > 0) packages.push(unquoteYamlString(value));
    }

    return packages;
  }

  return packages;
};
