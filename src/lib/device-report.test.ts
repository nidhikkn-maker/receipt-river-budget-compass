import { describe, expect, it } from 'vitest'
import {
  NOTE_MAX,
  PROBLEM_KINDS,
  buildReceiptProblem,
  describeDevice,
  deviceSummaryLines,
  isProblemKind,
  problemLabel,
  type DeviceFacts,
} from './device-report'

const base: DeviceFacts = {
  ua: '',
  screenWidth: 0,
  screenHeight: 0,
  viewportWidth: 0,
  viewportHeight: 0,
  pixelRatio: 1,
  maxTouchPoints: 0,
  pointerEvents: false,
}

const facts = (over: Partial<DeviceFacts>): DeviceFacts => ({ ...base, ...over })

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const HIDDEN_IPAD_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const INSTAGRAM_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Instagram 300.0.0.0 (iPhone15,3; iOS 17_5; en_IN) Scale/3.00'
const CRIOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1'

describe('describeDevice', () => {
  it('reads an iPhone Safari report as iPhone, its iOS version and Safari', () => {
    const reading = describeDevice(
      facts({
        ua: IPHONE_UA,
        maxTouchPoints: 5,
        pointerEvents: true,
        screenWidth: 393,
        screenHeight: 852,
        viewportWidth: 393,
        viewportHeight: 742,
        pixelRatio: 3,
        orientation: 'portrait-primary',
      }),
    )
    expect(reading.device).toBe('iPhone')
    expect(reading.os).toBe('iOS 18.1')
    expect(reading.browser).toBe('Safari')
    expect(reading.screen).toBe('393 × 852 at 3× (1179 × 2556 pixels) · page shows 393 × 742')
    expect(reading.touch).toBe('5 touch points · pointer events supported · portrait')
  })

  it('calls a pretend-Mac with touch points an iPad rather than a Mac', () => {
    expect(describeDevice(facts({ ua: HIDDEN_IPAD_UA, maxTouchPoints: 5 })).device).toBe('iPad')
    expect(describeDevice(facts({ ua: HIDDEN_IPAD_UA, maxTouchPoints: 0 })).device).toBe('Mac')
  })

  it('names an Android phone, its Android version and the Chrome build', () => {
    const reading = describeDevice(facts({ ua: ANDROID_UA, maxTouchPoints: 5, mobile: true }))
    expect(reading.device).toBe('Android phone')
    expect(reading.os).toBe('Android 13')
    expect(reading.browser).toBe('Chrome')
  })

  it('sees an in-app browser instead of blaming Safari', () => {
    expect(describeDevice(facts({ ua: INSTAGRAM_UA, maxTouchPoints: 5 })).browser).toBe(
      'Instagram in-app browser',
    )
    expect(describeDevice(facts({ ua: CRIOS_UA, maxTouchPoints: 5 })).browser).toBe('Chrome on iPhone')
  })

  it('says so when nothing can be read instead of inventing a device', () => {
    const reading = describeDevice(base)
    expect(reading.os).toBe('System not readable')
    expect(reading.screen).toBe('Screen size not readable')
    expect(reading.browser).toBe('Unknown browser')
    expect(reading.touch).toBe('0 touch points · no pointer events')
  })

  it('marks a report opened from a Home-screen shortcut', () => {
    expect(
      describeDevice(facts({ ua: IPHONE_UA, maxTouchPoints: 5, standalone: true })).touch,
    ).toContain('opened as an installed app')
  })
})

describe('deviceSummaryLines', () => {
  it('keeps a fixed order so a reader always scans the same shape', () => {
    const lines = deviceSummaryLines(
      facts({ ua: IPHONE_UA, maxTouchPoints: 5, pointerEvents: true, screenWidth: 393, screenHeight: 852, pixelRatio: 3 }),
    )
    expect(lines).toHaveLength(4)
    expect(lines[0]).toBe('iPhone · iOS 18.1')
    expect(lines[1]).toBe('Safari')
    expect(lines[2]).toMatch(/^Screen: 393 × 852/)
    expect(lines[3]).toMatch(/^Touch: 5 touch points/)
  })
})

describe('buildReceiptProblem', () => {
  const input = {
    kind: 'pan',
    note: '  Image slid away and I could not bring it back.  ',
    receiptName: 'hdfc-statement.pdf',
    receiptType: 'application/pdf',
    zoom: 2.5,
    facts: facts({ ua: IPHONE_UA, maxTouchPoints: 5, pointerEvents: true }),
  }

  it('stores the trimmed note and the chosen problem', () => {
    const row = buildReceiptProblem(input)
    expect(row.kind).toBe('pan')
    expect(row.note).toBe('Image slid away and I could not bring it back.')
    expect(row.receiptName).toBe('hdfc-statement.pdf')
    expect(row.receiptType).toBe('application/pdf')
  })

  it('refuses to store a report with no problem chosen', () => {
    expect(() => buildReceiptProblem({ ...input, kind: 'not-a-problem' })).toThrow(
      'Choose what went wrong first',
    )
    expect(() => buildReceiptProblem({ ...input, kind: '' })).toThrow('Choose what went wrong first')
  })

  it('records the zoom the picture was at when the report was made', () => {
    const row = buildReceiptProblem(input)
    expect(row.facts.log?.[0]).toBe('zoom at report: 250%')
  })

  it('caps a long note rather than storing a wall of text', () => {
    const row = buildReceiptProblem({ ...input, note: 'x'.repeat(NOTE_MAX + 400) })
    expect(row.note).toHaveLength(NOTE_MAX)
  })

  it('keeps only the last twelve viewer moves and trims each one', () => {
    const row = buildReceiptProblem({
      ...input,
      facts: facts({
        ua: IPHONE_UA,
        log: Array.from({ length: 30 }, (_, i) => `move ${i} ${'y'.repeat(120)}`),
      }),
    })
    expect(row.facts.log).toHaveLength(13)
    expect(row.facts.log?.[1]).toBe('move 18 ' + 'y'.repeat(72))
    expect(row.facts.log?.[12]).toBe('move 29 ' + 'y'.repeat(72))
  })

  it('keeps a report whole when the browser gave nothing back', () => {
    const row = buildReceiptProblem({ ...input, facts: undefined })
    expect(row.facts.pixelRatio).toBe(1)
    expect(row.facts.ua).toBe('')
    expect(row.facts.log).toEqual(['zoom at report: 250%'])
    expect(describeDevice(row.facts).screen).toBe('Screen size not readable')
  })
})

describe('problem kinds', () => {
  it('accepts only the choices the app offers', () => {
    expect(isProblemKind('zoom')).toBe(true)
    expect(isProblemKind('double-tap')).toBe(true)
    expect(isProblemKind('zoomed')).toBe(false)
    expect(PROBLEM_KINDS.every((kind) => kind.label.length > 0)).toBe(true)
  })

  it('falls back to "Something else" for an unknown choice', () => {
    expect(problemLabel('pan')).toBe("Dragging didn't work")
    expect(problemLabel('mystery')).toBe('Something else')
  })
})
