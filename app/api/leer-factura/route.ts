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
      return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
    }

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
  "contraparte_rut": "<RUT de la contraparte, formato XX.XXX.XXX-X, o null>",
  "contraparte_razon_social": "<razón social completa de la contraparte, o null>",
  "contraparte_giro": "<giro de la contraparte, o null>",
  "contraparte_direccion": "<dirección de la contraparte, o null>",
  "fecha": "<fecha de emisión en formato YYYY-MM-DD>",
  "numero": "<número de folio de la factura, o null>"
}

Si algún dato no se puede leer, usa null. Si solo aparece el total, calcula neto = total / 1.19 redondeado e iva = total - neto.`;

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
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: 'Error de la API: ' + err }, { status: 500 });
    }

    const data = await res.json();
    const texto = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

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
