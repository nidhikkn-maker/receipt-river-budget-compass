import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { SmartAdd } from './SmartAdd';
const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
describe('Smart Add existing workflow dispatch', () => {
  it.each([['Scan / Photo', 'scan'], ['Voice', 'voice'], ['Quick Entry', 'quick'], ['From Message', 'message']])('%s opens only a workspace draft', (label, mode) => {
    navigate.mockClear();
    const close = vi.fn();
    render(<SmartAdd open onOpenChange={close} scope="business" />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/new', search: { mode, scope: 'business' } });
    expect(close).toHaveBeenCalledWith(false);
  });
  it('files use the existing statement ingestion route without granting posting approval', () => {
    navigate.mockClear();
    render(<SmartAdd open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload File' }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/statements' });
  });
});