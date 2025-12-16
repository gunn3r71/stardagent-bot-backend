import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import dotenv from "dotenv";
import logger from "./logger.js";

dotenv.config();

logger.info("Bot iniciando");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true
});

logger.info("Bot conectado ao Telegram");

async function refreshJwt() {
  try {
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

    const expirationDate = new Date(
      Date.now() + tokenData.expires_in * 1000
    );

    process.env.STACKSPOT_JWT = tokenData.access_token;
    process.env.STACKSPOT_JWT_EXPIRATION = expirationDate.toISOString();

    logger.info(
      { expiresAt: expirationDate.toISOString() },
      "JWT renovado"
    );
  } catch (error) {
    logger.error({ err: error }, "Erro ao renovar JWT");
    throw error;
  }
}

// =======================
// Handlers
// =======================
bot.onText(/\/(start|s)/, (msg) => {
  logger.info(
    {
      chatId: msg.chat.id,
      user: msg.from?.username
    },
    "Start recebido"
  );

  bot.sendMessage(
    msg.chat.id,
    "Olá! Irei te ajudar na sua jornada de Stardew Valley"
  );
});

bot.onText(/\/q (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const question = match[1];

  logger.info(
    { chatId, question },
    "Pergunta recebida"
  );

  try {
    await refreshJwt();

    const response = await axios.post(
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

    bot.sendMessage(chatId, response.data.message);

    logger.info(
      { chatId },
      "Resposta enviada ao usuário"
    );
  } catch (error) {
    logger.error(
      {
        chatId,
        err: error
      },
      "Erro ao processar pergunta"
    );

    bot.sendMessage(
      chatId,
      "Erro ao processar sua pergunta 😢"
    );
  }
});
