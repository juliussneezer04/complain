const SECRET = '<secret>'

const PATTERNS = [
  [/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, SECRET],
  [/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/g, `$1$2${SECRET}`],
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}/g, SECRET],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/g, SECRET],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, SECRET],
  [/\bAKIA[0-9A-Z]{16}\b/g, SECRET],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[a-z])[A-Za-z0-9_-]{32,}/g, SECRET],
]

export const redact = (text) => PATTERNS.reduce((out, [re, to]) => out.replace(re, to), String(text ?? ''))
