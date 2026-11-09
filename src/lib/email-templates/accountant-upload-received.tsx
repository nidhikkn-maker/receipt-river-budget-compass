import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { ownerName?: string; accountantName?: string; fileName?: string; url?: string }

const Email = ({ ownerName, accountantName, fileName, url }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${accountantName || 'Your accountant'} uploaded statements`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Thapal</Text>
        <Heading style={h1}>New statements uploaded</Heading>
        <Text style={text}>{ownerName ? `Hi ${ownerName},` : 'Hi,'}</Text>
        <Text style={text}>
          {accountantName || 'Your accountant'} has started uploading statements through your upload link{fileName ? `, beginning with “${fileName}”` : ''}. They're waiting in Statement Desk for you to review — nothing is added to your records until you confirm.
        </Text>
        {url ? <Button href={url} style={button}>Open Statement Desk</Button> : null}
        <Text style={small}>If more files arrive in the next 30 minutes, they're covered by this email.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `${d['accountantName'] || 'Your accountant'} uploaded statements`,
  displayName: 'Accountant upload received',
  previewData: { ownerName: 'Krupanidhi', accountantName: 'Mr. Durai', fileName: 'HDFC-Oct-2026.pdf', url: 'https://ledgerline.biz/statements' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }
const container = { padding: '28px 24px', maxWidth: '520px' }
const brand = { color: '#B08A3E', fontSize: '13px', fontWeight: 600, letterSpacing: '0.04em', margin: '0 0 8px' }
const h1 = { color: '#17242B', fontSize: '22px', fontWeight: 600, margin: '0 0 16px' }
const text = { color: '#33414A', fontSize: '15px', lineHeight: '1.55', margin: '0 0 14px' }
const button = { backgroundColor: '#17324D', color: '#ffffff', borderRadius: '10px', padding: '12px 20px', fontSize: '15px', fontWeight: 600, textDecoration: 'none', display: 'inline-block', margin: '8px 0 18px' }
const small = { color: '#6B7780', fontSize: '13px', lineHeight: '1.5', margin: 0 }
