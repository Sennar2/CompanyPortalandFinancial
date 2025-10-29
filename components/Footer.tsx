'use client';

import { useMemo } from 'react';

export default function Footer() {
  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <footer className="w-full border-t bg-white text-xs text-gray-500 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col items-center text-center gap-1 leading-relaxed">
        <div>
          &copy; {year} La Mia Mamma LTD
        </div>
        <div className="text-[11px] text-gray-400">
          Need help?{' '}
          <a
            href="mailto:daniele@lamiamamma.co.uk"
            className="text-blue-600 hover:underline"
          >
            daniele@lamiamamma.co.uk
          </a>
        </div>
        <div className="text-[10px] text-gray-400">
          Internal use only · Confidential
        </div>
      </div>
    </footer>
  );
}
