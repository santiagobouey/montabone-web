import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const API_KEY = process.env.GEMINI_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    if (!API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY no configurada' }, { status: 500 });
    }

    const { texto } = await req.json();
    if (!texto || typeof texto !== 'string' || !texto.trim()) {
      return NextResponse.json({ error: 'Falta el texto' }, { status: 400 });
    }

    const prompt = `Del siguiente texto extrae TODOS los clientes/empresas que encuentres y devuélvelos en JSON.
El texto puede venir pegado desde un mensaje, un correo, una planilla o una lista desordenada. Puede haber uno o varios clientes.

Tipos válidos (elige el que mejor corresponda, si no sabes usa "otro"):
"carniceria", "distribuidor", "restaurante", "supermercado", "particular", "botilleria", "otro"

Responde SOLO con un JSON válido, sin texto adicional ni markdown, con esta forma exacta:
{
  "clientes": [
    {
      "nombre": "<nombre del local o cliente>",
      "nombre_contacto": "<persona de contacto, o null>",
      "telefono": "<teléfono, solo dígitos y +, o null>",
      "direccion": "<dirección con comuna si aparece, o null>",
      "rut": "<RUT formato XX.XXX.XXX-X, o null>",
      "razon_social": "<razón social, o null>",
      "giro": "<giro comercial, o null>",
      "email": "<correo, o null>",
      "tipo": "<uno de los tipos válidos>"
    }
  ]
}

Reglas:
- Si un dato no aparece, usa null (no inventes).
- "nombre" es obligatorio; si no hay un nombre claro usa la razón social.
- No dupliques clientes.
- Devuelve el arreglo "clientes" aunque sea uno solo.

TEXTO:
"""
${texto.slice(0, 8000)}
"""`;

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: 'Error de la API: ' + err }, { status: 500 });
    }

    const data = await res.json();
    const respuesta = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    const match = respuesta.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: 'No se pudieron leer los clientes' }, { status: 422 });
    }

    const parsed = JSON.parse(match[0]);
    const TIPOS = ['carniceria', 'distribuidor', 'restaurante', 'supermercado', 'particular', 'botilleria', 'otro'];
    const clientes = (Array.isArray(parsed.clientes) ? parsed.clientes : [])
      .filter((c: any) => c && (c.nombre || c.razon_social))
      .map((c: any) => ({
        nombre: (c.nombre || c.razon_social || '').toString().trim(),
        nombre_contacto: c.nombre_contacto || null,
        telefono: c.telefono || null,
        direccion: c.direccion || null,
        rut: c.rut || null,
        razon_social: c.razon_social || null,
        giro: c.giro || null,
        email: c.email || null,
        tipo: TIPOS.includes(c.tipo) ? c.tipo : 'otro',
      }));

    return NextResponse.json({ clientes });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error desconocido' }, { status: 500 });
  }
}
