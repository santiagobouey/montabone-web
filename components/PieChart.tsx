'use client';

const PALETA = ['#e53935', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#00bcd4', '#ffc107', '#8bc34a', '#f06292', '#607d8b'];
const fmtMoney = (v: number) => `$${Math.round(v).toLocaleString('es-CL')}`;
const fmtNum = (v: number) => v.toLocaleString('es-CL');

export interface Slice { label: string; value: number; }

export default function PieChart({ titulo, data, formato = 'money' }: { titulo: string; data: Slice[]; formato?: 'money' | 'num' }) {
  const limpio = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  // Agrupar todo lo que pase de 8 en "Otros"
  let slices: Slice[] = limpio;
  if (limpio.length > 9) {
    const top = limpio.slice(0, 8);
    const otros = limpio.slice(8).reduce((s, d) => s + d.value, 0);
    slices = [...top, { label: 'Otros', value: otros }];
  }
  const total = slices.reduce((s, d) => s + d.value, 0);
  const fmt = formato === 'money' ? fmtMoney : fmtNum;

  const size = 160, r = 60, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }}>
      <p className="text-sm font-bold mb-3" style={{ color: '#f5f5f5' }}>{titulo}</p>
      {total === 0 ? (
        <p className="text-sm" style={{ color: '#6b7280' }}>Sin datos</p>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
            <g transform={`rotate(-90 ${cx} ${cy})`}>
              {slices.map((s, i) => {
                const len = (s.value / total) * C;
                const el = (
                  <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                    stroke={PALETA[i % PALETA.length]} strokeWidth={26}
                    strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />
                );
                acc += len;
                return el;
              })}
            </g>
            <circle cx={cx} cy={cy} r={40} fill="#141414" />
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize={11} fill="#6b7280" style={{ fontFamily: 'system-ui' }}>Total</text>
            <text x={cx} y={cy + 13} textAnchor="middle" fontSize={11} fontWeight={700} fill="#f5f5f5" style={{ fontFamily: 'system-ui' }}>
              {formato === 'money' ? `$${Math.round(total / 1000).toLocaleString('es-CL')}k` : fmtNum(total)}
            </text>
          </svg>
          <div className="flex-1 w-full space-y-1">
            {slices.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: PALETA[i % PALETA.length] }} />
                <span className="flex-1 min-w-0 truncate" style={{ color: '#9ca3af' }}>{s.label}</span>
                <span className="flex-shrink-0" style={{ color: '#6b7280' }}>{Math.round(s.value / total * 100)}%</span>
                <span className="flex-shrink-0 font-semibold" style={{ color: '#f5f5f5' }}>{fmt(s.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
