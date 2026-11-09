import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { name?: string; ownerName?: string; url?: string }

const Email = ({ name, ownerName, url }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Upload this month's statements for ${ownerName || 'your client'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Thapal</Text>
        <Heading style={h1}>Statements upload link</Heading>
        <Text style={text}>{name ? `Dear ${name},` : 'Hello,'}</Text>
        <Text style={text}>
          {ownerName || 'Your client'} has asked you to upload this month's bank and card statements. Use the button below to add up to 50 files (PDF, Excel, CSV or photos). No sign-in is needed.
        </Text>
        {url ? <Button href={url} style={button}>Upload statements</Button> : null}
        <Text style={small}>This private link works for 30 days and only accepts files — it doesn't show any records. Please don't forward it.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Statements upload link from ${d['ownerName'] || 'your client'}`,
  displayName: 'Accountant upload link',
  previewData: { name: 'Mr. Durai', ownerName: 'Krupanidhi', url: 'https://ledgerline.biz/u/example' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }
const container = { padding: '28px 24px', maxWidth: '520px' }
const brand = { color: '#B08A3E', fontSize: '13px', fontWeight: 600, letterSpacing: '0.04em', margin: '0 0 8px' }
const h1 = { color: '#17242B', fontSize: '22px', fontWeight: 600, margin: '0 0 16px' }
const text = { color: '#33414A', fontSize: '15px', lineHeight: '1.55', margin: '0 0 14px' }
const button = { backgroundColor: '#17324D', color: '#ffffff', borderRadius: '10px', padding: '12px 20px', fontSize: '15px', fontWeight: 600, textDecoration: 'none', display: 'inline-block', margin: '8px 0 18px' }
const small = { color: '#6B7780', fontSize: '13px', lineHeight: '1.5', margin: 0 }
