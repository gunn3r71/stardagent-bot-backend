import axios from "axios";
import logger from "../logger.js";

export const config = {
  api: {
    bodyParser: true
  }
};

// =======================
// JWT Refresh
// =======================
async function refreshJwt() {
  const expiration = process.env.STACKSPOT_JWT_EXPIRATION;

  if (expiration) {
    const expDate = new Date(expiration);
    const nowPlus3Min = new Date(Date.now() + 3 * 60 * 1000);

    if (expDate > nowPlus3Min) {
      logger.debug({ expiresAt: expiration }, "JWT ainda válido");
      return;
    }
  }

  logger.info("Renovando JWT");

  const response = await axios.post(
    process.env.STACKSPOT_OIDC_URL,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.STACKSPOT_CLIENT_ID,
      client_secret: process.env.STACKSPOT_CLIENT_SECRET
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  const tokenData = response.data;

  process.env.STACKSPOT_JWT = tokenData.access_token;
  process.env.STACKSPOT_JWT_EXPIRATION = new Date(
    Date.now() + tokenData.expires_in * 1000
  ).toISOString();

  logger.info("JWT renovado");
}

// =======================
// Telegram Webhook
// =======================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  const message = req.body.message;

  if (!message) {
    logger.warn("Update sem mensagem");
    return res.status(200).send("OK");
  }

  const chatId = message.chat.id;
  const text = message.text || "";

  logger.info({ chatId, text }, "Mensagem recebida");

  try {
    let responseText;

    if (text.startsWith("/start") || text.startsWith("/s")) {
      responseText =
        "Olá! Irei te ajudar na sua jornada de Stardew Valley";
    } else if (text.startsWith("/help") || text.startsWith("/h")) {
      responseText =
        "Para fazer uma pergunta, use o comando /q seguido da sua dúvida.\n\nExemplo: /q Como plantar morangos?";
    } else if (text.startsWith("/q ")) {
      await refreshJwt();

      const question = text.replace("/q ", "");

      logger.info({ chatId, question }, "Enviando pergunta ao StackSpot");

      const aiResponse = await axios.post(
        process.env.STACKSPOT_GENAI_URL,
        {
          streaming: false,
          user_prompt: question,
          stackspot_knowledge: true,
          return_ks_in_response: false
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.STACKSPOT_JWT}`
          }
        }
      );

      responseText = aiResponse.data.message;
    } else {
      responseText =
        "Comando não reconhecido. Use /help para ver as opções.";
    }

    // Envia resposta ao Telegram
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: responseText
      }
    );

    logger.info({ chatId }, "Resposta enviada");
    return res.status(200).send("OK");
  } catch (error) {
    logger.error({ err: error, chatId }, "Erro no webhook");

    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text:
          "Erro ao processar sua pergunta 😢. Tente novamente em alguns minutos."
      }
    );

    return res.status(200).send("OK");
  }
}
