import React from 'react'
import { render } from '@react-email/render'
import { describe, expect, it } from 'vitest'
import { TEMPLATES } from './registry'

const data = {
  ownerName: 'Krupanidhi',
  kindLabel: "Dragging didn't work",
  note: 'The picture slid away and I could not bring it back.',
  deviceLines: [
    'iPhone · iOS 18.1',
    'Safari',
    'Screen: 393 × 852 at 3× (1179 × 2556 pixels)',
    'Touch: 5 touch points · pointer events supported · portrait',
  ],
  receiptName: 'hdfc-statement.pdf',
  receiptType: 'application/pdf',
  at: '2 November 2026, 7:25 pm',
  settingsUrl: 'https://ledgerline.biz/settings',
}

async function renderEmail(props: typeof data | Record<string, never>) {
  const template = TEMPLATES['receipt-problem-report']
  expect(template).toBeDefined()
  if (!template) throw new Error('Receipt problem report template is not registered')
  const html = await render(React.createElement(template.component, props))
  return { template, document: new DOMParser().parseFromString(html, 'text/html') }
}

describe('receipt problem report email rendering', () => {
  it('names the problem, the note and the device the report came from', async () => {
    const { template, document } = await renderEmail(data)
    const subject = typeof template.subject === 'function' ? template.subject(data) : template.subject
    expect(subject).toBe('Receipt viewer problem: Dragging didn\'t work')
    expect(document.body.textContent).toContain('Ledgerline')
    expect(document.querySelector('h1')?.textContent).toBe('Receipt viewer problem reported')
    expect(document.body.textContent).toContain('Hi Krupanidhi,')
    expect(document.body.textContent).toContain('“hdfc-statement.pdf”')
    expect(document.body.textContent).toContain('Dragging didn\'t work')
    expect(document.body.textContent).toContain('“The picture slid away and I could not bring it back.”')
    expect(document.body.textContent).toContain('iPhone · iOS 18.1')
    expect(document.body.textContent).toContain('Touch: 5 touch points · pointer events supported · portrait')
  })

  it('keeps the file type and the moment it was reported', async () => {
    const { document } = await renderEmail(data)
    expect(document.body.textContent).toContain('File type: application/pdf')
    expect(document.body.textContent).toContain('Reported: 2 November 2026, 7:25 pm')
    expect(document.body.textContent).toContain('Settings → Problem reports')
  })

  it('renders safely with nothing filled in rather than showing empty quotes', async () => {
    const { template, document } = await renderEmail({})
    const subject = typeof template.subject === 'function' ? template.subject({}) : template.subject
    expect(subject).toBe('Receipt viewer problem: something else')
    expect(document.body.textContent).toContain('Hi,')
    expect(document.body.textContent).toContain('Something else')
    expect(document.body.textContent).not.toContain('“”')
    expect(document.body.textContent).not.toContain('File type:')
    expect(document.body.textContent).not.toContain('Reported:')
    expect(document.body.textContent).not.toContain('Device and browser')
  })
})
