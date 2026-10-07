import { Resend } from "resend";
import { env } from "../config/env";

let resend: Resend | null = null;

function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(env.RESEND_API_KEY);
  return resend;
}

/**
 * Envía un correo. Nunca lanza: el fallo de un correo no debe romper el
 * flujo que lo disparó (una compra, un registro). Devuelve si Resend lo aceptó.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const client = getClient();
  if (!client) {
    console.warn(`[email] RESEND_API_KEY no definida — no se envió "${subject}" a ${to}`);
    return false;
  }

  try {
    const { error } = await client.emails.send({ from: env.RESEND_FROM_EMAIL, to, subject, html });
    if (error) {
      console.error("[email] Resend rechazó el envío:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] send failed:", error);
    return false;
  }
}

/** Plantilla base de marca: negro y dorado, tarjeta blanca centrada. */
export function layout(title: string, body: string): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;font-family:Arial,Helvetica,sans-serif">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:100%">
        <tr><td style="background:#0a0a0a;padding:20px 32px;border-bottom:4px solid #F5B800">
          <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:2px">SIEMPRE </span><span style="color:#F5B800;font-size:20px;font-weight:bold;letter-spacing:2px">PAWER</span>
        </td></tr>
        <tr><td style="padding:32px;color:#111;font-size:15px;line-height:1.6">
          <h1 style="margin:0 0 16px;font-size:22px;color:#0a0a0a">${title}</h1>
          ${body}
        </td></tr>
        <tr><td style="background:#0a0a0a;padding:16px 32px;color:#a1a1aa;font-size:12px">
          <span style="color:#F5B800">Excelencia Deportiva</span> · © ${new Date().getFullYear()} Siempre Pawer · Guayaquil, Ecuador
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

/** Botón dorado para enlaces dentro del correo. */
export function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="background:#F5B800;color:#0a0a0a;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;display:inline-block">${label}</a></p>`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
