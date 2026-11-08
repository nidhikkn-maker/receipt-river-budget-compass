import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
const navigate = vi.hoisted(() => vi.fn());
const seen = vi.hoisted(() => ({ receipt: [] as unknown[], statement: [] as unknown[] }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate, Link: ({ children }: { children: unknown }) => children }));
vi.mock('@/routes/_authenticated/new', () => ({ NewExpense: (p: { embedded: { search: unknown; files: File[]; onExit: (saved: { id: string; label: string }) => void } }) => { seen.receipt.push(p.embedded); return <><p>receipt review</p><button onClick={() => p.embedded.onExit({ id: 'saved-payment', label: 'Purchase' })}>Confirm test save</button></>; } }));
vi.mock('@/routes/_authenticated/statements', () => ({ StatementDeskPage: (p: { embedded: { files: File[] } }) => { seen.statement.push(p.embedded); return <p>statement review</p>; } }));
vi.mock('./SourcePreview', async (orig) => ({ ...(await orig<typeof import('./SourcePreview')>()), SourcePreview: ({ file }: { file: File }) => <p>preview {file.name}</p> }));
vi.mock('./ReceiptAssetHandoff', () => ({ ReceiptAssetHandoff: () => null }));
vi.mock('./ExpenditureReportBuilder', () => ({ ExpenditureReportBuilder: ({ search }: { search: { entry?: string } }) => <p>Claim source {search.entry}</p> }));
import { SmartAdd, routeFiles } from './SmartAdd';

const f = (name: string, type: string) => new File(['x'], name, { type });
describe('Smart Add stays in place', () => {
  it('opens claim preparation with exactly the saved entry without navigating or saving again', async () => {
    render(<SmartAdd open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick Entry' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm test save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Claim it back' }));
    expect(await screen.findByText('Claim source saved-payment')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });
  it('routes photos to receipt review, spreadsheets to statements and asks for PDFs', () => {
    expect(routeFiles([f('a.jpg', 'image/jpeg')])).toBe('receipt');
    expect(routeFiles([f('s.csv', 'text/csv')])).toBe('statement');
    expect(routeFiles([f('s.pdf', 'application/pdf')])).toBe('ask');
  });
  it('keeps ordinary payment screenshots in single-entry review', () => {
    expect(routeFiles([f('payment.png', 'application/octet-stream')])).toBe('receipt');
  });
  it('reads explicitly selected scanned statements in document review', () => {
    expect(routeFiles([f('statement.jpg', 'image/jpeg')], 'document')).toBe('statement');
  });
  it('reads asset invoice photos in document review rather than posting an expense', () => {
    expect(routeFiles([f('invoice.png', 'image/png')], 'assets')).toBe('statement');
  });
  it('keeps an asset upload context through the in-place handoff', async () => {
    render(<SmartAdd open onOpenChange={() => {}} />);
    act(() => { window.dispatchEvent(new CustomEvent('ledgerline:smart-add', { detail: { intent: 'assets' } })); });
    fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [f('invoice.jpg', 'image/jpeg')] } });
    await waitFor(() => expect(seen.statement.at(-1)).toMatchObject({ context: 'assets' }));
    expect(navigate).not.toHaveBeenCalled();
  });
  it.each(['investments','property','tax','entity','fy','gst','documents'] as const)('preserves the %s module for scanned documents through hide and reopen', async context => {
    const { rerender } = render(<SmartAdd open onOpenChange={() => {}} />);
    act(() => { window.dispatchEvent(new CustomEvent('ledgerline:smart-add', {detail:{intent:context}})); });
    fireEvent.change(screen.getByLabelText('Choose files'), {target:{files:[f('source.jpg','image/jpeg')]}});
    await waitFor(() => expect(seen.statement.at(-1)).toMatchObject({context}));
    rerender(<SmartAdd open={false} onOpenChange={() => {}} />);
    rerender(<SmartAdd open onOpenChange={() => {}} />);
    await waitFor(() => expect(seen.statement.at(-1)).toMatchObject({context}));
    expect(navigate).not.toHaveBeenCalled();
  });
  it('a photo opens preview and receipt review inside the sheet without navigating', async () => {
    render(<SmartAdd open onOpenChange={() => {}} scope="business" />);
    fireEvent.change(screen.getByLabelText('Take a photo'), { target: { files: [f('bill.jpg', 'image/jpeg')] } });
    expect(await screen.findByText('preview bill.jpg')).toBeTruthy();
    expect(await screen.findByText('receipt review')).toBeTruthy();
    expect(seen.receipt.at(-1)).toMatchObject({ search: { mode: 'scan', scope: 'business' } });
    expect(navigate).not.toHaveBeenCalled();
  });
  it('a PDF asks what it is, then opens statement review in place', async () => {
    render(<SmartAdd open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [f('hdfc.pdf', 'application/pdf')] } });
    fireEvent.click(screen.getByRole('button', { name: 'A statement or other document' }));
    await waitFor(() => expect(screen.getByText('statement review')).toBeTruthy());
    expect(navigate).not.toHaveBeenCalled();
  });
  it.each([['Voice Entry', 'voice'], ['Quick Entry', 'quick'], ['From Message', 'message']])('%s opens the typed review in place', async (label, mode) => {
    render(<SmartAdd open onOpenChange={() => {}} />);
    const button = screen.getAllByRole('button', { name: label })[0];
    if (!button) throw new Error('Missing entry action');
    fireEvent.click(button);
    expect(await screen.findByText('receipt review')).toBeTruthy();
    expect(seen.receipt.at(-1)).toMatchObject({ search: { mode } });
    expect(navigate).not.toHaveBeenCalled();
  });
});
