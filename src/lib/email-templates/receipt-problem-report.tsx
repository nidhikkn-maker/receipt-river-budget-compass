import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  ownerName?: string
  kindLabel?: string
  note?: string
  deviceLines?: string[]
  receiptName?: string
  receiptType?: string
  at?: string
  settingsUrl?: string
}

const Email = ({ ownerName, kindLabel, note, deviceLines, receiptName, receiptType, at, settingsUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Receipt viewer problem: ${kindLabel || 'something else'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Thapal</Text>
        <Heading style={h1}>Receipt viewer problem reported</Heading>
        <Text style={text}>{ownerName ? `Hi ${ownerName},` : 'Hi,'}</Text>
        <Text style={text}>
          A problem was reported while reviewing a receipt{receiptName ? ` (“${receiptName}”)` : ''}: <strong>{kindLabel || 'Something else'}</strong>.
        </Text>
        {note ? <Text style={quote}>“{note}”</Text> : null}
        {deviceLines?.length ? (
          <div style={box}>
            <Text style={boxTitle}>Device and browser</Text>
            {deviceLines.map((line) => (
              <Text key={line} style={lineStyle}>{line}</Text>
            ))}
          </div>
        ) : null}
        {receiptType ? <Text style={small}>File type: {receiptType}</Text> : null}
        {at ? <Text style={small}>Reported: {at}</Text> : null}
        {settingsUrl ? <Text style={small}>Every report is also saved in your account under Settings → Problem reports.</Text> : null}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Receipt viewer problem: ${d['kindLabel'] || 'something else'}`,
  displayName: 'Receipt viewer problem report',
  previewData: {
    ownerName: 'Krupanidhi',
    kindLabel: "Dragging didn't work",
    note: 'The picture slid away and I could not bring it back.',
    deviceLines: ['iPhone · iOS 18.1', 'Safari', 'Screen: 393 × 852 at 3× (1179 × 2556 pixels)', 'Touch: 5 touch points · pointer events supported · portrait'],
    receiptName: 'hdfc-statement.pdf',
    receiptType: 'application/pdf',
    at: '2 November 2026, 7:25 pm',
    settingsUrl: 'https://ledgerline.biz/settings',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }
const container = { padding: '28px 24px', maxWidth: '520px' }
const brand = { color: '#B08A3E', fontSize: '13px', fontWeight: 600, letterSpacing: '0.04em', margin: '0 0 8px' }
const h1 = { color: '#17242B', fontSize: '22px', fontWeight: 600, margin: '0 0 16px' }
const text = { color: '#33414A', fontSize: '15px', lineHeight: '1.55', margin: '0 0 14px' }
const quote = { color: '#17242B', fontSize: '15px', lineHeight: '1.55', margin: '0 0 16px', borderLeft: '3px solid #B08A3E', paddingLeft: '12px' }
const box = { backgroundColor: '#F4F6F8', borderRadius: '12px', padding: '14px 16px', margin: '0 0 16px' }
const boxTitle = { color: '#17242B', fontSize: '13px', fontWeight: 600, margin: '0 0 8px' }
const lineStyle = { color: '#33414A', fontSize: '13px', lineHeight: '1.6', margin: '0 0 4px' }
const small = { color: '#6B7780', fontSize: '13px', lineHeight: '1.5', margin: '0 0 8px' }
