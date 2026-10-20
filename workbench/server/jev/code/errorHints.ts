/**
 * EXECUTION ERRORS → EXACT FIX. Every Python / JavaScript error returned to the model carries the cause and the
 * fix for the cases that cost the most retries (seen in real runs): %-format strings, merged cells, helpers that
 * return nothing, broken f-string quotes, wrong column indices, header rows, missing sheets… A JavaScript syntax
 * error is caught BEFORE running (nothing half-written). Repeating the same error is called out: change approach.
 */
export interface Hint {
  id: string;
  text: string;
}
const RULES: { id: string; lang: 'python' | 'javascript' | 'any'; re: RegExp; fix: string }[] = [
  { id: 'py-percent-format', lang: 'python', re: /not enough arguments for format string|unsupported format character|not all arguments converted during string formatting/i, fix: 'A literal « % » inside a %-formatted string. Use f-strings everywhere (f"{x:.1%}"), or double the sign (%%) in the template.' },
  { id: 'py-merged-cell', lang: 'python', re: /MergedCell.*read-only|'MergedCell' object attribute 'value' is read-only/i, fix: 'You wrote into a cell covered by a merge. Write ONLY in the top-left cell of the merged range, and merge AFTER writing (ws.merge_cells(...)); never write the header on the row you just merged.' },
  { id: 'py-none-return', lang: 'python', re: /'NoneType' object (is not subscriptable|is not iterable|has no attribute)|cannot unpack non-iterable NoneType/i, fix: 'A function returned None: a helper is missing its `return` (or a lookup found nothing). Add the return, and check the lookup result before using it.' },
  { id: 'py-fstring', lang: 'python', re: /f-string: (unmatched|expecting|single '}'|empty expression)|f-string expression part cannot include a backslash|EOL while scanning string literal|unterminated string literal|unterminated f-string/i, fix: 'Broken string: inside an f-string use the OTHER quote type for keys (f"{d[\'k\']}"), no backslash inside {…} (compute the value first), and close every quote. Prefer building long texts with "\\n".join([...]).' },
  { id: 'py-syntax', lang: 'python', re: /SyntaxError|IndentationError|TabError/i, fix: 'Syntax error: nothing ran. Fix only the reported line (bracket / quote / colon / indentation) and send the whole script again.' },
  { id: 'py-index', lang: 'python', re: /IndexError: (list|tuple) index out of range|IndexError: single positional indexer is out-of-bounds/i, fix: 'Column / row index out of range: you are using positions (x[21]). Read the header row and address columns BY NAME (df["Provisions"], or a dict {name: index} built from the header).' },
  { id: 'py-worksheet', lang: 'python', re: /Worksheet .+ does not exist|KeyError: 'Worksheet/i, fix: 'Unknown sheet name: print(wb.sheetnames) (or pd.ExcelFile(path).sheet_names) and use the exact name.' },
  { id: 'py-keyerror-col', lang: 'python', re: /KeyError: ['"]?.+['"]?|not in index|None of \[Index/i, fix: 'Unknown column / key: print(list(df.columns)) first. Headers often sit on a lower row (pd.read_excel(..., header=N)) or carry trailing spaces / accents (df.columns = df.columns.str.strip()).' },
  { id: 'py-file', lang: 'python', re: /FileNotFoundError|No such file or directory/i, fix: 'Wrong path: workspace files are mounted at their path (uploads/…, outputs/…). List them with os.listdir("uploads") and use the exact name; write deliverables to outputs/.' },
  { id: 'py-type-str-num', lang: 'python', re: /unsupported operand type\(s\) for [+\-*/]: '(str|float|int)' and '(str|float|int)'|can only concatenate str|could not convert string to float/i, fix: 'Text where a number is expected: convert first (pd.to_numeric(col, errors="coerce")) and skip the TOTAL / text rows; for messages use f-strings instead of « + ».' },
  { id: 'py-module', lang: 'python', re: /ModuleNotFoundError: No module named '([^']+)'/i, fix: 'This package is not in the sandbox. Use what is available (numpy, pandas, openpyxl, xlrd, pypdf) or plain Python; never pip install.' },
  { id: 'py-chart-ref', lang: 'python', re: /Reference.*(min_row|min_col)|openpyxl.*chart/i, fix: 'Chart reference: Reference(ws, min_col, min_row, max_col, max_row) uses 1-based cells of the SAME sheet; titles_from_data=True needs the header row inside the range.' },
  { id: 'py-name', lang: 'python', re: /NameError: name '([^']+)' is not defined/i, fix: 'A name is used before it is defined (each code.run starts from scratch: nothing from the previous run exists). Redefine every helper and variable in this script.' },
  { id: 'js-syntax', lang: 'javascript', re: /SyntaxError|Unexpected token|Unexpected identifier|missing \) after|Unterminated/i, fix: 'Syntax error: nothing ran. Fix the reported construct (quotes, backticks, brackets) and resend the whole script.' },
  { id: 'js-undefined', lang: 'javascript', re: /Cannot read propert(y|ies) of (undefined|null)|is not a function|undefined is not an object/i, fix: 'A value is undefined: log the object you index (console.log(Object.keys(x))) — column names, sheet names and array lengths are usually different from what you assumed.' },
  { id: 'js-not-defined', lang: 'javascript', re: /ReferenceError: (\w+) is not defined/i, fix: 'Unknown name: each code.run is a fresh sandbox (nothing carries over); define it here. Available helpers: readFile, readBytes, readText, writeFile.' },
  { id: 'any-timeout', lang: 'any', re: /timed? ?out|Timeout|took too long/i, fix: 'Too slow: avoid row-by-row loops over large data (vectorise with pandas / one pass), and do not re-read the same file inside a loop.' },
];

/** The fix for an execution error (null when the error is not a known pattern). */
export function hintFor(language: 'python' | 'javascript', error: string): Hint | null {
  for (const r of RULES) if ((r.lang === language || r.lang === 'any') && r.re.test(error)) return { id: r.id, text: r.fix };
  return null;
}

/** A short signature of an error (same cause → same signature), to detect blind retries. */
export function errorSignature(error: string): string {
  const last = error.trim().split('\n').filter((l) => /Error|Exception|error/.test(l)).pop() ?? error.trim().split('\n').pop() ?? '';
  return last.replace(/line \d+/g, 'line N').replace(/['"][^'"]{0,80}['"]/g, '…').replace(/\d+/g, 'N').slice(0, 160);
}

/**
 * JavaScript syntax check WITHOUT running (async body, like the sandbox). Null when it parses, or when the code
 * uses module syntax the check cannot judge (import / export).
 */
export function jsSyntaxError(code: string): string | null {
  if (/^\s*(import|export)\s/m.test(code)) return null;
  try {
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...a: string[]) => unknown;
    new AsyncFunction(code);
    return null;
  } catch (e) {
    return e instanceof SyntaxError ? e.message : null;
  }
}

/** Text appended to a failed run, for the model. */
export function guidance(language: 'python' | 'javascript', error: string, repeats: number): string {
  const h = hintFor(language, error);
  const parts: string[] = [];
  if (h) parts.push(`[JEV fix] ${h.text}`);
  if (repeats >= 2)
    parts.push(`[JEV] Same error ${repeats} times in a row: STOP retrying the same script. First inspect (print the columns / sheet names / types / a few rows), then rewrite only the failing part.`);
  return parts.length ? `\n\n${parts.join('\n')}` : '';
}
