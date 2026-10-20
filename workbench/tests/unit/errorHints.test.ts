import { describe, expect, it } from 'vitest';
import { errorSignature, guidance, hintFor, jsSyntaxError } from '../../server/jev/code/errorHints';

describe('execution errors come back with their exact fix (the real failures of past runs)', () => {
  it.each([
    ['TypeError: not enough arguments for format string', 'py-percent-format'],
    ["AttributeError: 'MergedCell' object attribute 'value' is read-only", 'py-merged-cell'],
    ["TypeError: 'NoneType' object is not subscriptable", 'py-none-return'],
    ["SyntaxError: f-string: unmatched '['", 'py-fstring'],
    ['IndexError: list index out of range', 'py-index'],
    ["KeyError: 'Worksheet Donnees does not exist.'", 'py-worksheet'],
    ["NameError: name 'ttl' is not defined", 'py-name'],
  ])('%s', (err, id) => {
    expect(hintFor('python', err)?.id).toBe(id);
  });
  it('JavaScript: syntax checked before running, top-level await allowed', () => {
    expect(jsSyntaxError('const x = await readFile("a"); console.log(x)')).toBeNull();
    expect(jsSyntaxError('const x = ;')).toMatch(/Unexpected/);
    expect(jsSyntaxError('import x from "y"')).toBeNull();
  });
  it('the same error twice: stop retrying blindly', () => {
    const a = errorSignature('Traceback\n  File "x", line 12\nKeyError: \'Provisions\'');
    const b = errorSignature('Traceback\n  File "x", line 40\nKeyError: \'Provisions\'');
    expect(a).toBe(b);
    expect(guidance('python', "KeyError: 'Provisions'", 2)).toContain('STOP retrying');
    expect(guidance('python', 'weird unknown failure', 1)).toBe('');
  });
});
