import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const API_KEY = process.env.ANTHROPIC_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    if (!API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 });
    }

    const { base64, mediaType } = await req.json();
    if (!base64 || !mediaType) {
      return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
    }

    const esPdf = mediaType === 'application/pdf';
    const contenidoArchivo = esPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

    const prompt = `Analiza esta factura chilena y extrae los datos en JSON.

La empresa del usuario es "Cecinas Montabone" (puede aparecer como Montabone, Cecinas Montabone SpA o similar).

Reglas para determinar el tipo:
- Si Cecinas Montabone aparece como EMISOR de la factura → tipo "emitida" (factura de venta a un cliente)
- Si Cecinas Montabone aparece como RECEPTOR/cliente → tipo "compra" (factura que pagó a un proveedor)
- Si no aparece Montabone en el documento, asume "compra"

Responde SOLO con un JSON válido, sin texto adicional ni markdown:
{
  "tipo": "emitida" | "compra",
  "neto": <monto neto en pesos, número entero sin puntos>,
  "iva": <IVA en pesos, número entero>,
  "total": <total en pesos, número entero>,
  "contraparte": "<nombre de la otra empresa (el cliente si es emitida, el proveedor si es compra)>",
  "fecha": "<fecha de emisión en formato YYYY-MM-DD>",
  "numero": "<número de folio de la factura, o null>"
}

Si algún dato no se puede leer, usa null. Si solo aparece el total, calcula neto = total / 1.19 redondeado e iva = total - neto.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [contenidoArchivo, { type: 'text', text: prompt }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: 'Error de la API: ' + err }, { status: 500 });
    }

    const data = await res.json();
    const texto = (data.content?.[0]?.text || '').trim();

    // Extraer el JSON de la respuesta
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: 'No se pudo leer la factura' }, { status: 422 });
    }

    const resultado = JSON.parse(match[0]);
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
