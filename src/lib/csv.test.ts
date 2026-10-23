import { describe, expect, it } from 'vitest'
import { colIndex, parseCsv, toCsv, validateCsvFile } from './csv'

describe('toCsv', () => {
  it('joins header and rows with commas and CRLF', () => {
    expect(toCsv(['Name', 'Age'], [['Ana', 30]])).toBe('Name,Age\r\nAna,30')
  })

  it('quotes fields containing commas, quotes or newlines', () => {
    expect(toCsv(['A'], [['a,b']])).toBe('A\r\n"a,b"')
    expect(toCsv(['A'], [['say "hi"']])).toBe('A\r\n"say ""hi"""')
    expect(toCsv(['A'], [['line1\nline2']])).toBe('A\r\n"line1\nline2"')
  })
})

describe('parseCsv', () => {
  it('parses a simple grid', () => {
    expect(parseCsv('Name,Age\r\nAna,30\r\nBo,25')).toEqual([
      ['Name', 'Age'],
      ['Ana', '30'],
      ['Bo', '25'],
    ])
  })

  it('handles quoted fields with embedded commas and escaped quotes', () => {
    expect(parseCsv('A,B\r\n"a,b","say ""hi"""')).toEqual([
      ['A', 'B'],
      ['a,b', 'say "hi"'],
    ])
  })

  it('handles a newline inside a quoted field', () => {
    expect(parseCsv('A\r\n"line1\nline2"\r\nplain')).toEqual([['A'], ['line1\nline2'], ['plain']])
  })

  it('drops blank lines and tolerates a missing trailing newline', () => {
    expect(parseCsv('A,B\n1,2\n\n3,4')).toEqual([
      ['A', 'B'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\n\n')).toEqual([])
  })
})

describe('colIndex', () => {
  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(colIndex(['Name', ' RSVP ', 'Dietary'], 'rsvp')).toBe(1)
    expect(colIndex(['Name'], 'Missing')).toBe(-1)
  })
})

describe('validateCsvFile', () => {
  const file = (name: string, size: number, type = 'text/csv') => {
    const f = new File([new Uint8Array(size)], name, { type })
    return f
  }

  it('accepts a small .csv file', () => {
    expect(validateCsvFile(file('guests.csv', 100))).toBeNull()
  })

  it('rejects non-csv extensions and types', () => {
    expect(validateCsvFile(file('guests.txt', 100, 'text/plain'))).toMatch(/\.csv/)
  })

  it('rejects an empty file', () => {
    expect(validateCsvFile(file('guests.csv', 0))).toMatch(/empty/)
  })

  it('rejects a file over the size limit', () => {
    expect(validateCsvFile(file('guests.csv', 3 * 1024 * 1024))).toMatch(/too large/)
  })
})
