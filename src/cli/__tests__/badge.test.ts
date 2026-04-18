import { describe, test, expect } from 'vitest'
import { getBadgeColor, generateBadgeUrl, formatBadgeOutput } from '../badge.js'

describe('getBadgeColor', () => {
  test('returns brightgreen for score >= 90', () => {
    expect(getBadgeColor(90)).toBe('brightgreen')
    expect(getBadgeColor(100)).toBe('brightgreen')
    expect(getBadgeColor(95)).toBe('brightgreen')
  })

  test('returns green for score >= 75 and < 90', () => {
    expect(getBadgeColor(75)).toBe('green')
    expect(getBadgeColor(89)).toBe('green')
    expect(getBadgeColor(80)).toBe('green')
  })

  test('returns yellow for score >= 60 and < 75', () => {
    expect(getBadgeColor(60)).toBe('yellow')
    expect(getBadgeColor(74)).toBe('yellow')
    expect(getBadgeColor(67)).toBe('yellow')
  })

  test('returns orange for score >= 40 and < 60', () => {
    expect(getBadgeColor(40)).toBe('orange')
    expect(getBadgeColor(59)).toBe('orange')
    expect(getBadgeColor(50)).toBe('orange')
  })

  test('returns red for score < 40', () => {
    expect(getBadgeColor(39)).toBe('red')
    expect(getBadgeColor(0)).toBe('red')
    expect(getBadgeColor(1)).toBe('red')
  })

  test('boundary: exactly 90 is brightgreen not green', () => {
    expect(getBadgeColor(90)).toBe('brightgreen')
  })

  test('boundary: exactly 75 is green not yellow', () => {
    expect(getBadgeColor(75)).toBe('green')
  })

  test('boundary: exactly 60 is yellow not orange', () => {
    expect(getBadgeColor(60)).toBe('yellow')
  })

  test('boundary: exactly 40 is orange not red', () => {
    expect(getBadgeColor(40)).toBe('orange')
  })
})

describe('generateBadgeUrl', () => {
  test('uses %25 encoding for percent sign', () => {
    const url = generateBadgeUrl(87)
    expect(url).toContain('87%25')
    expect(url).not.toMatch(/87%(?!25)/)
  })

  test('includes shields.io base URL', () => {
    const url = generateBadgeUrl(50)
    expect(url).toMatch(/^https:\/\/img\.shields\.io\/badge\/toolscore-/)
  })

  test('includes correct color for score 87 (brightgreen)', () => {
    const url = generateBadgeUrl(92)
    expect(url).toContain('brightgreen')
  })

  test('includes correct color for score 80 (green)', () => {
    const url = generateBadgeUrl(80)
    expect(url).toContain('green')
    expect(url).not.toContain('brightgreen')
  })

  test('includes correct color for score 65 (yellow)', () => {
    const url = generateBadgeUrl(65)
    expect(url).toContain('yellow')
  })

  test('full URL format for score 87', () => {
    expect(generateBadgeUrl(87)).toBe(
      'https://img.shields.io/badge/toolscore-87%25-green'
    )
  })

  test('full URL format for score 100', () => {
    expect(generateBadgeUrl(100)).toBe(
      'https://img.shields.io/badge/toolscore-100%25-brightgreen'
    )
  })

  test('full URL format for score 0', () => {
    expect(generateBadgeUrl(0)).toBe(
      'https://img.shields.io/badge/toolscore-0%25-red'
    )
  })
})

describe('formatBadgeOutput', () => {
  test('contains markdown badge syntax', () => {
    const output = formatBadgeOutput(87)
    expect(output).toContain('![toolscore: 87%]')
  })

  test('contains Shields.io URL label', () => {
    const output = formatBadgeOutput(87)
    expect(output).toContain('Shields.io URL:')
  })

  test('contains HTML img tag', () => {
    const output = formatBadgeOutput(87)
    expect(output).toContain('<img src=')
    expect(output).toContain('alt="toolscore: 87%"')
  })

  test('contains README copy instruction', () => {
    const output = formatBadgeOutput(87)
    expect(output).toContain('Badge (copy to your README):')
  })

  test('HTML tag uses correct URL', () => {
    const output = formatBadgeOutput(75)
    const url = generateBadgeUrl(75)
    expect(output).toContain(`<img src="${url}"`)
  })

  test('markdown badge uses correct URL', () => {
    const output = formatBadgeOutput(75)
    const url = generateBadgeUrl(75)
    expect(output).toContain(`![toolscore: 75%](${url})`)
  })

  test('score 0 uses red color in output', () => {
    const output = formatBadgeOutput(0)
    expect(output).toContain('red')
  })

  test('score 100 uses brightgreen color in output', () => {
    const output = formatBadgeOutput(100)
    expect(output).toContain('brightgreen')
  })
})
