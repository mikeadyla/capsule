'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const GEOJSON_URL =
  'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

const FIPS_TO_ISO: Record<string, string> = {
  UK: 'GBR', US: 'USA', FR: 'FRA', GM: 'DEU', IT: 'ITA', SP: 'ESP',
  TU: 'TUR', GR: 'GRC', AU: 'AUS', AS: 'AUS', CA: 'CAN', MX: 'MEX',
  BR: 'BRA', AR: 'ARG', CO: 'COL', IN: 'IND', CH: 'CHN', JA: 'JPN',
  KS: 'KOR', PK: 'PAK', AF: 'AFG', IR: 'IRN', IZ: 'IRQ', SY: 'SYR',
  LE: 'LBN', JO: 'JOR', EG: 'EGY', LY: 'LBY', MO: 'MAR', TS: 'TUN',
  AG: 'DZA', NI: 'NGA', SF: 'ZAF', KE: 'KEN', ET: 'ETH', UG: 'UGA',
  SU: 'SDN', OD: 'SSD', SO: 'SOM', CG: 'COD', CF: 'COG', CM: 'CMR',
  IV: 'CIV', SG: 'SEN', ML: 'MLI', UV: 'BFA', NG: 'NER', BC: 'BWA',
  WA: 'NAM', RW: 'RWA', BY: 'BDI', TZ: 'TZA', MI: 'MWI', MZ: 'MOZ',
  ZI: 'ZWE', ZA: 'ZMB', AO: 'AGO', MA: 'MDG', GA: 'GMB', PU: 'GNB',
  GV: 'GIN', SL: 'SLE', LI: 'LBR', TO: 'TGO', BN: 'BEN', GH: 'GHA',
  SW: 'SWE', NO: 'NOR', FI: 'FIN', DA: 'DNK', EI: 'IRL', NL: 'NLD',
  BE: 'BEL', LU: 'LUX', SZ: 'CHE', PO: 'PRT', PL: 'POL', EZ: 'CZE',
  LO: 'SVK', HU: 'HUN', RO: 'ROU', BU: 'BGR', HR: 'HRV', SI: 'SVN',
  EN: 'EST', LG: 'LVA', LH: 'LTU', UP: 'UKR', BO: 'BLR', RS: 'RUS',
  GG: 'GEO', AJ: 'AZE', AM: 'ARM', UZ: 'UZB', KG: 'KGZ', TI: 'TJK',
  TX: 'TKM', KZ: 'KAZ', BG: 'BGD', BM: 'MMR', TH: 'THA', VM: 'VNM',
  CB: 'KHM', LA: 'LAO', MY: 'MYS', ID: 'IDN', RP: 'PHL', CE: 'LKA',
  NP: 'NPL', BT: 'BTN', MG: 'MNG', IS: 'ISR', SA: 'SAU', YM: 'YEM',
  MU: 'OMN', AE: 'ARE', QA: 'QAT', BA: 'BHR', KU: 'KWT',
  VE: 'VEN', PE: 'PER', CL: 'CHL', EC: 'ECU', UY: 'URY', PA: 'PRY',
  BL: 'BOL', GY: 'GUY', NS: 'SUR', PM: 'PAN', CS: 'CRI', NU: 'NIC',
  HO: 'HND', ES: 'SLV', GT: 'GTM', BH: 'BLZ', CU: 'CUB', DR: 'DOM',
  HA: 'HTI', JM: 'JAM', TD: 'TTO', RB: 'SRB', MK: 'MKD', AL: 'ALB',
  MN: 'MNE', BK: 'BIH', CY: 'CYP', MT: 'MLT', IC: 'ISL',
  NZ: 'NZL', FJ: 'FJI', PP: 'PNG',
};

interface Props {
  countries: Array<{ code: string; count: number }>;
}

function getColor(count: number, max: number): string {
  if (count === 0 || max === 0) return 'rgba(212,168,150,0.05)';
  const ratio = Math.min(count / max, 1);
  const r = Math.round(92 + (212 - 92) * (1 - ratio));
  const g = Math.round(48 + (168 - 48) * (1 - ratio));
  const b = Math.round(68 + (150 - 68) * (1 - ratio));
  const opacity = 0.15 + ratio * 0.7;
  return `rgba(${r},${g},${b},${opacity})`;
}

export default function CapsuleMap({ countries }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const [hovered, setHovered] = useState<{ name: string; count: number } | null>(null);

  const countByIso = new Map<string, number>();
  const max = countries.length > 0 ? countries[0].count : 1;

  for (const c of countries) {
    const iso = FIPS_TO_ISO[c.code] ?? c.code;
    countByIso.set(iso, (countByIso.get(iso) ?? 0) + c.count);
  }

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 7,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { subdomains: 'abc', maxZoom: 19 }
    ).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapInstance.current = map;

    fetch(GEOJSON_URL)
      .then((r) => r.json())
      .then((geojson) => {
        L.geoJSON(geojson, {
          style: (feature) => {
            const iso = feature?.properties?.ISO_A3;
            const count = countByIso.get(iso) ?? 0;
            return {
              fillColor: getColor(count, max),
              fillOpacity: 1,
              color: '#D4A896',
              weight: 0.5,
              opacity: 0.3,
            };
          },
          onEachFeature: (feature, layer) => {
            const iso = feature?.properties?.ISO_A3;
            const name = feature?.properties?.ADMIN ?? iso;
            const count = countByIso.get(iso) ?? 0;

            layer.on({
              mouseover: (e) => {
                setHovered({ name, count });
                (e.target as L.Path).setStyle({
                  weight: 1.5,
                  color: '#5C3044',
                  opacity: 0.6,
                });
              },
              mouseout: (e) => {
                setHovered(null);
                (e.target as L.Path).setStyle({
                  weight: 0.5,
                  color: '#D4A896',
                  opacity: 0.3,
                });
              },
            });
          },
        }).addTo(map);
      });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {/* Hover tooltip */}
      {hovered && (
        <div
          className="absolute top-4 left-4 z-[1000] px-4 py-2.5 rounded-xl"
          style={{
            background: '#fff',
            border: '1px solid rgba(212,168,150,0.12)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          }}
        >
          <div className="text-sm font-medium" style={{ color: '#2D2A26' }}>
            {hovered.name}
          </div>
          <div className="text-xs mt-0.5" style={{ color: '#8B8580' }}>
            {hovered.count} {hovered.count === 1 ? 'article' : 'articles'}
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        className="absolute bottom-6 left-4 z-[1000] px-4 py-3 rounded-xl"
        style={{
          background: '#fff',
          border: '1px solid rgba(212,168,150,0.12)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        }}
      >
        <div className="text-xs mb-2" style={{ color: '#8B8580', fontWeight: 600, letterSpacing: '0.1em' }}>
          COVERAGE
        </div>
        <div className="flex items-center gap-1">
          {[0.05, 0.2, 0.4, 0.6, 0.8, 1].map((ratio, i) => (
            <div
              key={i}
              style={{
                width: 24,
                height: 10,
                borderRadius: 2,
                background: getColor(ratio * max, max),
              }}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs mt-1" style={{ color: '#8B8580' }}>
          <span>Low</span>
          <span>High</span>
        </div>
      </div>
    </div>
  );
}
