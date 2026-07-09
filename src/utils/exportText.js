function textUnit(character) {
  if (/[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(character)) return 1;
  if (/\s/.test(character)) return 0.35;
  if (/[ilI1.,:;|!]/.test(character)) return 0.32;
  if (/[mwMW@#%&]/.test(character)) return 0.86;
  return 0.58;
}

function textUnits(value) {
  return Array.from(String(value || "")).reduce((sum, character) => sum + textUnit(character), 0);
}

function tokenizeForSvgWrap(value) {
  const tokens = [];
  let latin = "";
  const pushLatin = () => {
    if (latin) tokens.push(latin);
    latin = "";
  };
  for (const character of String(value || "")) {
    if (character === "\n") {
      pushLatin();
      tokens.push("\n");
    } else if (/\s/.test(character)) {
      pushLatin();
      tokens.push(" ");
    } else if (/[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(character)) {
      pushLatin();
      tokens.push(character);
    } else {
      latin += character;
    }
  }
  pushLatin();
  return tokens;
}

export function wrapStaticExportText(value, maxUnits) {
  const tokens = tokenizeForSvgWrap(String(value || "").replace(/\r\n?/g, "\n").trim());
  if (!tokens.length) return [];
  const lines = [];
  let current = "";
  let currentUnits = 0;
  const pushCurrent = () => {
    if (current.trim()) lines.push(current.trim());
    current = "";
    currentUnits = 0;
  };
  for (const token of tokens) {
    if (token === "\n") {
      pushCurrent();
      continue;
    }
    const tokenUnits = textUnits(token);
    if (token === " " && !current) continue;
    if (current && currentUnits + tokenUnits > maxUnits) {
      pushCurrent();
    }
    if (tokenUnits > maxUnits && !/[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(token)) {
      let piece = "";
      let pieceUnits = 0;
      for (const character of token) {
        const unit = textUnit(character);
        if (piece && pieceUnits + unit > maxUnits) {
          lines.push(piece);
          piece = "";
          pieceUnits = 0;
        }
        piece += character;
        pieceUnits += unit;
      }
      current = piece;
      currentUnits = pieceUnits;
      continue;
    }
    current += token;
    currentUnits += tokenUnits;
  }
  pushCurrent();
  return lines;
}

export function fitStaticExportText(value, { width, height, maxFont = 28, minFont = 14, unitFactor = 0.54, lineHeight = 1.18 }) {
  const text = String(value || "").trim() || "—";
  for (let fontSize = maxFont; fontSize >= minFont; fontSize -= 1) {
    const maxUnits = Math.max(4, width / (fontSize * unitFactor));
    const lines = wrapStaticExportText(text, maxUnits);
    const gap = Math.ceil(fontSize * lineHeight);
    if (lines.length * gap <= height) {
      return { lines, fontSize, lineGap: gap };
    }
  }
  const maxUnits = Math.max(4, width / (minFont * unitFactor));
  const lines = wrapStaticExportText(text, maxUnits);
  const lineGap = lines.length <= 1 ? Math.ceil(minFont * lineHeight) : Math.max(6, Math.floor(height / Math.max(1, lines.length - 0.1)));
  return { lines, fontSize: minFont, lineGap };
}
