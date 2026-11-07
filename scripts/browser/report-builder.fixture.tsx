import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/styles.css';
import { ExpenditureReportBuilder } from '/src/components/ExpenditureReportBuilder.tsx';
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-4xl p-4"><ExpenditureReportBuilder mode="statement" search={{ entry: 'e' }} /></main>);