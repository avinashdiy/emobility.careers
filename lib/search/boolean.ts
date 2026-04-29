import type { Prisma } from "@prisma/client";

/**
 * Naukri-style boolean search parser. Translates queries like
 *
 *   (battery OR powertrain) AND "3 years" AND Bengaluru NOT intern
 *
 * into a Prisma `CandidateProfileWhereInput` that's matched across the
 * candidate's denormalised text surfaces (firstName + lastName + headline
 * + summary + location + skills.name).
 *
 * Grammar (informal):
 *   query     := orExpr
 *   orExpr    := andExpr ("OR" andExpr)*
 *   andExpr   := unary ("AND" unary | <implicit-AND> unary)*
 *   unary     := "NOT" unary | atom
 *   atom      := WORD | "PHRASE" | "(" orExpr ")"
 *
 * - Operators are CASE-INSENSITIVE (`and` works), but treated as such
 *   only when they're whole tokens — `andrew` stays a word.
 * - Two adjacent atoms imply AND (`battery cell` = `battery AND cell`)
 *   so users who don't know boolean syntax still get sensible results.
 * - Unbalanced parentheses or trailing operators degrade gracefully:
 *   parser emits a `null` clause for the offending sub-expression
 *   rather than throwing, so a recruiter mid-typing doesn't see an error.
 *
 * Designed to be read once, parsed once, and consumed by one caller —
 * `app/employer/candidates/page.tsx`. Keep it dependency-free; we avoid
 * pulling in a real grammar lib because the dialect is small and
 * stable.
 */

// ─── Tokenizer ─────────────────────────────────────────────

type Token =
  | { type: "WORD"; value: string }
  | { type: "PHRASE"; value: string }
  | { type: "AND" }
  | { type: "OR" }
  | { type: "NOT" }
  | { type: "LPAREN" }
  | { type: "RPAREN" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    if (c === " " || c === "\t" || c === "\n") {
      i += 1;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "LPAREN" });
      i += 1;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "RPAREN" });
      i += 1;
      continue;
    }
    // Quoted phrase — supports both straight " and curly " quotes which
    // copy-pasted JDs often have. Closing quote falls back to end of input.
    if (c === "\"" || c === "“" || c === "”") {
      let end = i + 1;
      while (end < n && input[end] !== "\"" && input[end] !== "“" && input[end] !== "”") end += 1;
      tokens.push({ type: "PHRASE", value: input.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    // Word — accept letters, digits, hyphens, dots, +, # (skill names
    // contain things like C++, .NET, node.js).
    let end = i;
    while (end < n && !/[\s()"“”]/.test(input[end])) end += 1;
    const raw = input.slice(i, end);
    const upper = raw.toUpperCase();
    if (upper === "AND") tokens.push({ type: "AND" });
    else if (upper === "OR") tokens.push({ type: "OR" });
    else if (upper === "NOT" || raw === "-") tokens.push({ type: "NOT" });
    else if (raw.length > 0) tokens.push({ type: "WORD", value: raw });
    i = end;
  }
  return tokens;
}

// ─── Parser → AST ──────────────────────────────────────────

type Ast =
  | { kind: "term"; value: string }
  | { kind: "and"; left: Ast; right: Ast }
  | { kind: "or"; left: Ast; right: Ast }
  | { kind: "not"; child: Ast };

class Parser {
  pos = 0;
  constructor(private tokens: Token[]) {}
  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  consume(): Token | undefined {
    return this.tokens[this.pos++];
  }
  parseOr(): Ast | null {
    let left = this.parseAnd();
    while (this.peek()?.type === "OR") {
      this.consume();
      const right = this.parseAnd();
      if (!right) return left;          // dangling OR — keep what we have
      if (!left) { left = right; continue; }
      left = { kind: "or", left, right };
    }
    return left;
  }
  parseAnd(): Ast | null {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (!t) break;
      if (t.type === "OR" || t.type === "RPAREN") break;
      // Explicit AND or implicit AND between two atoms — both consume any
      // explicit AND keyword and continue.
      if (t.type === "AND") this.consume();
      const right = this.parseUnary();
      if (!right) break;
      if (!left) { left = right; continue; }
      left = { kind: "and", left, right };
    }
    return left;
  }
  parseUnary(): Ast | null {
    if (this.peek()?.type === "NOT") {
      this.consume();
      const child = this.parseUnary();
      if (!child) return null;
      return { kind: "not", child };
    }
    return this.parseAtom();
  }
  parseAtom(): Ast | null {
    const t = this.peek();
    if (!t) return null;
    if (t.type === "WORD" || t.type === "PHRASE") {
      this.consume();
      return { kind: "term", value: t.value };
    }
    if (t.type === "LPAREN") {
      this.consume();
      const inner = this.parseOr();
      if (this.peek()?.type === "RPAREN") this.consume();
      return inner;
    }
    // Stray operator — skip and recover so dangling tokens don't poison the parse.
    this.consume();
    return this.parseAtom();
  }
}

// ─── AST → Prisma WHERE ────────────────────────────────────

/**
 * Builds the per-term WHERE that a single text token must match. We OR
 * across the candidate's text surfaces so "battery" matches a headline
 * with "battery", a summary mentioning batteries, a skill named
 * "Battery Pack Design", or a candidate located in "Battery, Mumbai".
 *
 * This shape is duplicated when callers wrap into AND/OR/NOT — the
 * recursion cost is fine for queries with <30 terms.
 */
function termWhere(term: string): Prisma.CandidateProfileWhereInput {
  const v = term.trim();
  if (!v) return {};
  return {
    OR: [
      { firstName: { contains: v, mode: "insensitive" } },
      { lastName: { contains: v, mode: "insensitive" } },
      { headline: { contains: v, mode: "insensitive" } },
      { summary: { contains: v, mode: "insensitive" } },
      { location: { contains: v, mode: "insensitive" } },
      { skills: { some: { skill: { name: { contains: v, mode: "insensitive" } } } } },
      { evDomains: { some: { evDomain: { name: { contains: v, mode: "insensitive" } } } } },
      // Pull the candidate's most recent experience into the search net
      // so role titles (`Battery Engineer`) and company names match too.
      { experiences: {
          some: {
            OR: [
              { title: { contains: v, mode: "insensitive" } },
              { company: { contains: v, mode: "insensitive" } },
              { description: { contains: v, mode: "insensitive" } },
            ],
          },
        },
      },
    ],
  };
}

function astToWhere(ast: Ast): Prisma.CandidateProfileWhereInput {
  if (ast.kind === "term") return termWhere(ast.value);
  if (ast.kind === "and") return { AND: [astToWhere(ast.left), astToWhere(ast.right)] };
  if (ast.kind === "or") return { OR: [astToWhere(ast.left), astToWhere(ast.right)] };
  // NOT — Prisma supports `NOT` at the WhereInput level. We negate the
  // child's full subtree so `NOT (battery OR cell)` becomes `NOT (...)`
  // rather than `(NOT battery) OR (NOT cell)`.
  return { NOT: astToWhere(ast.child) };
}

/**
 * Public entry point. Returns the WHERE plus a normalised pretty-print
 * of the parse — used by the UI to echo back what we understood
 * ("battery AND \"3 years\" AND bengaluru") so power users can confirm.
 */
export function parseBooleanQuery(input: string): {
  where: Prisma.CandidateProfileWhereInput;
  normalized: string;
} {
  const trimmed = input.trim();
  if (!trimmed) return { where: {}, normalized: "" };
  const tokens = tokenize(trimmed);
  const parser = new Parser(tokens);
  const ast = parser.parseOr();
  if (!ast) return { where: {}, normalized: "" };
  return { where: astToWhere(ast), normalized: pretty(ast) };
}

function pretty(ast: Ast, parent: "root" | "and" | "or" | "not" = "root"): string {
  if (ast.kind === "term") {
    return /\s/.test(ast.value) ? `"${ast.value}"` : ast.value;
  }
  if (ast.kind === "not") return `NOT ${pretty(ast.child, "not")}`;
  const op = ast.kind === "and" ? "AND" : "OR";
  const out = `${pretty(ast.left, ast.kind)} ${op} ${pretty(ast.right, ast.kind)}`;
  // Only paren'ize when we'd otherwise lose precedence — an OR inside
  // an AND context, or any binary inside a NOT.
  if (
    (parent === "and" && ast.kind === "or") ||
    parent === "not"
  ) return `(${out})`;
  return out;
}
