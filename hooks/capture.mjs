#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { captureVerdict } from './gripe.mjs'

let h
try { h = JSON.parse(readFileSync(0, 'utf8') || '{}') } catch { process.exit(0) }
let verdict = null
try { verdict = captureVerdict(h) } catch (e) {
  // A gripe must not vanish: let the prompt through, and the skill records it by hand.
  process.stderr.write(`gripe: ${e.message}\n`)
}
if (verdict) writeFileSync(1, JSON.stringify(verdict))
process.exit(0)
