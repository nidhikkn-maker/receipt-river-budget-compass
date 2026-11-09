import React from 'react'
import { render } from '@react-email/render'
import { describe, expect, it } from 'vitest'
import { TEMPLATES } from './registry'

describe('accountant upload-received email rendering', () => {
  const data = {
    ownerName: 'Krupanidhi',
    accountantName: 'Mr. Durai',
    fileName: 'HDFC-Oct-2026.pdf',
    url: 'https://ledgerline.biz/statements',
  }

  async function renderEmail(props: typeof data | Record<string, never>) {
    const template = TEMPLATES['accountant-upload-received']
    expect(template).toBeDefined()
    if (!template) throw new Error('Accountant upload-received template is not registered')
    const html = await render(React.createElement(template.component, props))
    return { template, document: new DOMParser().parseFromString(html, 'text/html') }
  }

  it('renders the registered email with its subject, brand, and who uploaded what', async () => {
    const { template, document } = await renderEmail(data)
    const subject = typeof template.subject === 'function' ? template.subject(data) : template.subject
    expect(subject).toBe('Mr. Durai uploaded statements')
    expect(document.body.textContent).toContain('Thapal')
    expect(document.querySelector('h1')?.textContent).toBe('New statements uploaded')
    expect(document.body.textContent).toContain('Hi Krupanidhi,')
    expect(document.body.textContent).toContain(
      'Mr. Durai has started uploading statements through your upload link',
    )
    expect(document.body.textContent).toContain('beginning with “HDFC-Oct-2026.pdf”')
  })

  it('includes the Statement Desk button and the promise that nothing is posted yet', async () => {
    const { document } = await renderEmail(data)
    const button = Array.from(document.querySelectorAll('a')).find(
      (link) => link.textContent?.trim() === 'Open Statement Desk',
    )
    expect(button).toBeDefined()
    expect(button?.getAttribute('href')).toBe(data.url)
    expect(document.body.textContent).toContain(
      "They're waiting in Statement Desk for you to review — nothing is added to your records until you confirm.",
    )
    expect(document.body.textContent).toContain(
      "If more files arrive in the next 30 minutes, they're covered by this email.",
    )
  })

  it('renders safely without optional data rather than offering a broken Statement Desk button', async () => {
    const { template, document } = await renderEmail({})
    const subject = typeof template.subject === 'function' ? template.subject({}) : template.subject
    expect(subject).toBe('Your accountant uploaded statements')
    expect(document.body.textContent).toContain('Hi,')
    expect(document.body.textContent).toContain('Your accountant has started uploading statements')
    expect(document.body.textContent).not.toContain('beginning with')
    expect(document.querySelector('a')).toBeNull()
  })
})
