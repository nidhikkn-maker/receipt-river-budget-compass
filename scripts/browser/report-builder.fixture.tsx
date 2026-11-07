import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/styles.css';
import { ExpenditureReportBuilder } from '/src/components/ExpenditureReportBuilder.tsx';
const claim = new URLSearchParams(window.location.search).get('mode') === 'claim';
const mount = document.getElementById('root');
if (mount) createRoot(mount).render(<main className="mx-auto max-w-4xl p-4"><ExpenditureReportBuilder mode={claim ? 'claim' : 'statement'} search={claim ? { entries: 'e,missing,broken' } : { entry: 'e' }} /></main>);