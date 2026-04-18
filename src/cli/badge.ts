/**
 * Badge generator for toolscore — embeddable shields.io badges
 */

export function getBadgeColor(score: number): string {
  if (score >= 90) return 'brightgreen'
  if (score >= 75) return 'green'
  if (score >= 60) return 'yellow'
  if (score >= 40) return 'orange'
  return 'red'
}

export function generateBadgeUrl(score: number): string {
  const color = getBadgeColor(score)
  // %25 is the percent-encoded form of '%', so the badge shows "87%"
  return `https://img.shields.io/badge/toolscore-${score}%25-${color}`
}

export function formatBadgeOutput(score: number): string {
  const url = generateBadgeUrl(score)
  return [
    'Badge (copy to your README):',
    `![toolscore: ${score}%](${url})`,
    '',
    'Shields.io URL:',
    url,
    '',
    'HTML:',
    `<img src="${url}" alt="toolscore: ${score}%">`,
  ].join('\n')
}
