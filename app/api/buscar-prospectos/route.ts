import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

interface OSMElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
}

// Mapeo de tipos de la app → filtros de OpenStreetMap
// Solo negocios de barrio: carnicerías, botillerías y minimarkets/almacenes
const FILTROS: Record<string, string[]> = {
  carniceria: ['node["shop"="butcher"]', 'way["shop"="butcher"]'],
  botilleria: ['node["shop"="alcohol"]', 'way["shop"="alcohol"]'],
  otro: ['node["shop"~"convenience|deli|greengrocer"]', 'way["shop"~"convenience|deli|greengrocer"]'],
};

// Cadenas grandes que no sirven como prospectos
const CADENAS_EXCLUIDAS = [
  'oxxo', 'ok market', 'okmarket', 'spid', 'unimarc', 'lider', 'líder', 'jumbo',
  'santa isabel', 'tottus', 'acuenta', 'a cuenta', 'ekono', 'alvi', 'mayorista 10',
  'central mayorista', 'castaño', 'pronto', 'copec', 'shell', 'petrobras', 'aramco',
  'upa!', 'select', 'cruz verde', 'salcobrand', 'ahumada',
];

function esCadena(nombre: string): boolean {
  const n = nombre.toLowerCase();
  return CADENAS_EXCLUIDAS.some((c) => n === c || n.startsWith(c + ' ') || n.includes(` ${c}`) || n.includes(c));
}

function tipoDesdeOSM(tags: Record<string, string>): string {
  const shop = tags.shop || '';
  if (shop === 'butcher') return 'carniceria';
  if (shop === 'alcohol') return 'botilleria';
  return 'otro';
}

export async function POST(req: NextRequest) {
  try {
    const { zona, tipo } = await req.json();
    if (!zona) {
      return NextResponse.json({ error: 'Falta la comuna' }, { status: 400 });
    }

    const filtros = tipo && tipo !== 'todos' && FILTROS[tipo]
      ? FILTROS[tipo]
      : Object.values(FILTROS).flat();

    const query = `
[out:json][timeout:40];
area["name"="${String(zona).replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ '\-]/g, '')}"]["boundary"="administrative"]->.a;
(
  ${filtros.map((f) => `${f}(area.a);`).join('\n  ')}
);
out center tags 80;
`;

    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'MontaboneGestion/1.0' },
      body: new URLSearchParams({ data: query }).toString(),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Error consultando el mapa: ' + res.status }, { status: 500 });
    }

    const data = await res.json();
    const elementos = (data.elements || []) as OSMElement[];

    const vistos = new Set<string>();
    const resultados = elementos
      .filter((e) => e.tags?.name && !esCadena(e.tags.name))
      .map((e) => {
        const t = e.tags!;
        const calle = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
        return {
          nombre: t.name,
          direccion: calle ? `${calle}, ${zona}` : String(zona),
          telefono: t.phone || t['contact:phone'] || null,
          tipo: tipoDesdeOSM(t),
          nota: [t.cuisine ? `Cocina: ${t.cuisine}` : null, t['contact:instagram'] || t.website || null]
            .filter(Boolean).join(' · ') || null,
        };
      })
      .filter((r) => {
        const k = r.nombre.toLowerCase();
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });

    return NextResponse.json({ resultados });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
