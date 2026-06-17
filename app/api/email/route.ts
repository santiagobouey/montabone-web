import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);
const MAIL_DESTINO = process.env.MAIL_DESTINO || '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tipo, pedido } = body;

    if (!MAIL_DESTINO) {
      return NextResponse.json({ error: 'MAIL_DESTINO no configurado' }, { status: 500 });
    }

    let subject = '';
    let html = '';

    if (tipo === 'nuevo_pedido') {
      const { cliente, rut, razon_social, telefono, vendedor, fecha, total, direccion, productos } = pedido;
      subject = `📦 Nuevo pedido — ${cliente}`;
      html = `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; color: #f5f5f5; padding: 24px; border-radius: 12px;">
          <h2 style="color: #e53935; margin-bottom: 4px;">📦 Nuevo Pedido</h2>
          <p style="color: #6b7280; margin-top: 0; font-size: 14px;">${new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

          <div style="background: #141414; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0 0 6px; font-size: 20px; font-weight: bold;">${cliente}</p>
            <p style="margin: 0 0 4px; color: #9ca3af; font-size: 13px;">Razón social: <strong style="color:#f5f5f5">${razon_social || '—'}</strong></p>
            <p style="margin: 0 0 4px; color: #9ca3af; font-size: 13px;">RUT: <strong style="color:#f5f5f5">${rut || '—'}</strong></p>
            <p style="margin: 0 0 4px; color: #9ca3af; font-size: 13px;">Teléfono: <strong style="color:#f5f5f5">${telefono || '—'}</strong></p>
            <p style="margin: 0 0 4px; color: #9ca3af; font-size: 13px;">Dirección de despacho: <strong style="color:#f5f5f5">${direccion || '—'}</strong></p>
            <p style="margin: 0; color: #9ca3af; font-size: 13px;">Vendedor: <strong style="color:#f5f5f5">${vendedor}</strong></p>
          </div>

          <p style="font-size: 12px; font-weight: 700; color: #6b7280; letter-spacing: 1px; margin-bottom: 8px;">PEDIDO</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <thead>
              <tr style="border-bottom: 1px solid #2a2a2a;">
                <th style="text-align: left; padding: 8px 0; color: #6b7280; font-size: 12px; font-weight: 600;">PRODUCTO</th>
                <th style="text-align: center; padding: 8px 0; color: #6b7280; font-size: 12px; font-weight: 600;">CANT.</th>
                <th style="text-align: right; padding: 8px 0; color: #6b7280; font-size: 12px; font-weight: 600;">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${(productos as Array<{ nombre: string; cantidad: number; subtotal: number }>).map((p) => `
                <tr style="border-bottom: 1px solid #1a1a1a;">
                  <td style="padding: 8px 0; font-size: 14px;">${p.nombre}</td>
                  <td style="padding: 8px 0; text-align: center; color: #9ca3af; font-size: 14px;">${p.cantidad}</td>
                  <td style="padding: 8px 0; text-align: right; font-size: 14px;">$${Math.round(p.subtotal).toLocaleString('es-CL')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div style="border-top: 2px solid #e53935; padding-top: 12px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: bold; font-size: 16px; color: #6b7280;">TOTAL</span>
            <span style="font-weight: 900; font-size: 28px; color: #f5f5f5;">$${Math.round(total).toLocaleString('es-CL')}</span>
          </div>
        </div>
      `;
    } else if (tipo === 'pedido_pagado') {
      const { cliente, vendedor, fecha, total } = pedido;
      subject = `✅ Pedido pagado — ${cliente}`;
      html = `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; background: #0a0a0a; color: #f5f5f5; padding: 24px; border-radius: 12px;">
          <h2 style="color: #4caf50; margin-bottom: 4px;">✅ Pago Confirmado</h2>
          <p style="color: #6b7280; margin-top: 0; font-size: 14px;">${new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

          <div style="background: #141414; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0 0 4px; font-size: 20px; font-weight: bold;">${cliente}</p>
            <p style="margin: 0; color: #6b7280; font-size: 13px;">Vendedor: ${vendedor}</p>
          </div>

          <div style="border-top: 2px solid #4caf50; padding-top: 12px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: bold; font-size: 16px; color: #6b7280;">MONTO PAGADO</span>
            <span style="font-weight: 900; font-size: 28px; color: #4caf50;">$${Math.round(total).toLocaleString('es-CL')}</span>
          </div>
        </div>
      `;
    }

    const { error } = await resend.emails.send({
      from: 'Montabone <onboarding@resend.dev>',
      to: [MAIL_DESTINO],
      subject,
      html,
    });

    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
