'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const CapsuleMap = dynamic(() => import('./_components/CapsuleMap'), { ssr: false });

interface CountryData {
  code: string;
  count: number;
}

interface Article {
  title: string;
  url: string;
  source: string;
  country: string;
  date: string;
}

interface GdeltResponse {
  total: number;
  countries: CountryData[];
  topArticles: Article[];
}

export default function CapsulePage() {
  const [data, setData] = useState<GdeltResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/gdelt')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-rose)]/10">
        <div className="flex items-center gap-3">
          <h1
            className="text-[var(--color-charcoal)]"
            style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', fontWeight: 400 }}
          >
            Capsule
          </h1>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(92,48,68,0.08)',
              color: 'var(--color-plum)',
              fontWeight: 500,
              letterSpacing: '0.04em',
            }}
          >
            LIVE
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs" style={{ color: '#8B8580' }}>
          {data && (
            <>
              <span>{data.total} articles</span>
              <span>·</span>
              <span>{data.countries.length} countries</span>
              <span>·</span>
              <span>Last 7 days</span>
            </>
          )}
        </div>
      </header>

      {/* Map + Sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Map */}
        <div className="flex-1 relative max-h-[60vh]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'var(--color-cream)' }}>
              <span className="text-sm" style={{ color: '#8B8580' }}>Loading GDELT data...</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'var(--color-cream)' }}>
              <span className="text-sm" style={{ color: '#C4746E' }}>Failed to load data</span>
            </div>
          )}
          <CapsuleMap countries={data?.countries ?? []} />
        </div>

        {/* Article sidebar */}
        <aside
          className="w-80 border-l overflow-y-auto flex-shrink-0 hidden md:block"
          style={{ borderColor: 'rgba(212,168,150,0.1)', background: '#FDFAF7' }}
        >
          <div className="p-4">
            <h2
              className="text-xs mb-3"
              style={{
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#8B8580',
                fontWeight: 600,
              }}
            >
              Recent Headlines
            </h2>
            {data?.topArticles.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block mb-3 p-3 rounded-xl transition-colors"
                style={{ background: '#fff', border: '1px solid rgba(212,168,150,0.08)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(92,48,68,0.15)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(212,168,150,0.08)'; }}
              >
                <div className="text-sm leading-snug mb-1.5" style={{ color: 'var(--color-charcoal)' }}>
                  {a.title}
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: '#8B8580' }}>
                  <span>{a.source}</span>
                  {a.country && (
                    <>
                      <span>·</span>
                      <span>{a.country}</span>
                    </>
                  )}
                </div>
              </a>
            ))}
            {loading && (
              <div className="text-xs py-8 text-center" style={{ color: '#8B8580' }}>
                Loading...
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
