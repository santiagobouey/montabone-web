import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const API_KEY = process.env.GEMINI_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    if (!API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY no configurada' }, { status: 500 });
    }

    const { base64, mediaType } = await req.json();
    if (!base64 || !mediaType) {
      return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 });
    }

    const prompt = `Esta es la foto de una boleta o factura. La empresa del usuario es "Cecinas Montabone" (el VENDEDOR).
Extrae los datos del CLIENTE/COMPRADOR (la otra parte, NO Montabone) para agregarlo a una lista de clientes.

Tipos válidos (elige el que mejor corresponda; si no sabes usa "otro"):
"carniceria", "distribuidor", "restaurante", "supermercado", "particular", "botilleria", "otro"

Responde SOLO con un JSON válido, sin texto adicional ni markdown:
{
  "nombre": "<nombre de fantasía o del local del cliente; si no hay, usa la razón social>",
  "razon_social": "<razón social completa del cliente, o null>",
  "rut": "<RUT del cliente en formato XX.XXX.XXX-X, o null>",
  "giro": "<giro comercial del cliente, o null>",
  "direccion": "<dirección (calle y número) del cliente, sin la comuna, o null>",
  "comuna": "<comuna del cliente, o null>",
  "telefono": "<teléfono del cliente, solo dígitos y +, o null>",
  "email": "<correo del cliente, o null>",
  "nombre_contacto": "<persona de contacto si aparece, o null>",
  "tipo": "<uno de los tipos válidos>"
}

Reglas: NO uses los datos de Cecinas Montabone (es el vendedor). Si un dato no aparece, usa null (no inventes). "nombre" es obligatorio.`;

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mediaType, data: base64 } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: 'Error de la API: ' + err }, { status: 500 });
    }

    const data = await res.json();
    const texto = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: 'No se pudieron leer los datos' }, { status: 422 });
    }

    const c = JSON.parse(match[0]);
    const TIPOS = ['carniceria', 'distribuidor', 'restaurante', 'supermercado', 'particular', 'botilleria', 'otro'];
    return NextResponse.json({
      nombre: (c.nombre || c.razon_social || '').toString().trim(),
      razon_social: c.razon_social || null,
      rut: c.rut || null,
      giro: c.giro || null,
      direccion: c.direccion || null,
      comuna: c.comuna || null,
      telefono: c.telefono || null,
      email: c.email || null,
      nombre_contacto: c.nombre_contacto || null,
      tipo: TIPOS.includes(c.tipo) ? c.tipo : 'otro',
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error desconocido' }, { status: 500 });
  }
}
