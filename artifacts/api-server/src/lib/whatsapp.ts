import { logger } from "./logger";

export async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  const token = process.env["WHATSAPP_TOKEN"];
  const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"];

  if (!token || !phoneNumberId) {
    logger.warn("WhatsApp not configured — set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID");
    return false;
  }

  const phone = to.replace(/\D/g, "");

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: message },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error({ status: res.status, err, to }, "WhatsApp send failed");
      return false;
    }

    logger.info({ to }, "WhatsApp message sent");
    return true;
  } catch (err) {
    logger.error({ err, to }, "WhatsApp send error");
    return false;
  }
}

export function formatSignalMessage(signal: {
  pair: string;
  direction: string;
  entryPrice: number | string;
  stopLoss: number | string;
  takeProfit: number | string;
}): string {
  const dir = signal.direction === "BUY" ? "📈 BUY" : "📉 SELL";
  return `🎯 *PESAMATRIX SIGNAL*

📊 Pair: *${signal.pair}*
${dir}
💰 Entry: *${signal.entryPrice}*
🛑 Stop Loss: *${signal.stopLoss}*
✅ Take Profit: *${signal.takeProfit}*

_Trade responsibly. PESAMATRIX SIGNAL Platform_`;
}
