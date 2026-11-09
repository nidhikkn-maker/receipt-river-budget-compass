import React from 'react'
import { render } from '@react-email/render'
import { describe, expect, it } from 'vitest'
import { TEMPLATES } from './registry'

describe('accountant upload-link email rendering', () => {
  const data = {
    name: 'Mr. Durai',
    ownerName: 'Krupanidhi',
    url: 'https://ledgerline.biz/u/ci-sample-token',
  }

  async function renderEmail(props: typeof data | Record<string, never>) {
    const template = TEMPLATES['accountant-upload-link']
    expect(template).toBeDefined()
    if (!template) throw new Error('Accountant upload-link template is not registered')
    const html = await render(React.createElement(template.component, props))
    return { template, document: new DOMParser().parseFromString(html, 'text/html') }
  }

  it('renders the registered email with its subject, brand, and personalised request', async () => {
    const { template, document } = await renderEmail(data)
    const subject = typeof template.subject === 'function' ? template.subject(data) : template.subject
    expect(subject).toBe('Statements upload link from Krupanidhi')
    expect(document.body.textContent).toContain('Thapal')
    expect(document.querySelector('h1')?.textContent).toBe('Statements upload link')
    expect(document.body.textContent).toContain('Dear Mr. Durai,')
    expect(document.body.textContent).toContain("Krupanidhi has asked you to upload this month's bank and card statements.")
  })

  it('includes the upload button pointing at the supplied private link and its limits', async () => {
    const { document } = await renderEmail(data)
    const button = Array.from(document.querySelectorAll('a')).find(
      (link) => link.textContent?.trim() === 'Upload statements',
    )
    expect(button).toBeDefined()
    expect(button?.getAttribute('href')).toBe(data.url)
    expect(document.body.textContent).toContain('up to 50 files (PDF, Excel, CSV or photos)')
    expect(document.body.textContent).toContain('No sign-in is needed.')
    expect(document.body.textContent).toContain('This private link works for 30 days')
    expect(document.body.textContent).toContain("only accepts files — it doesn't show any records.")
    expect(document.body.textContent).toContain("Please don't forward it.")
  })

  it('renders safely without optional data rather than offering a broken upload button', async () => {
    const { template, document } = await renderEmail({})
    const subject = typeof template.subject === 'function' ? template.subject({}) : template.subject
    expect(subject).toBe('Statements upload link from your client')
    expect(document.body.textContent).toContain('Hello,')
    expect(document.body.textContent).toContain('Your client has asked you')
    expect(document.querySelector('a')).toBeNull()
  })
})