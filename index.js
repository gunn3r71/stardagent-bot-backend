import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true
});

async function refreshJwt() {
  const expiration = process.env.STACKSPOT_JWT_EXPIRATION;

  if (expiration) {
    const expDate = new Date(expiration);
    const nowPlus3Min = new Date(Date.now() + 3 * 60 * 1000);

    if (expDate > nowPlus3Min) {
      return;
    }
  }

  const url = process.env.STACKSPOT_OIDC_URL;

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.STACKSPOT_CLIENT_ID,
    client_secret: process.env.STACKSPOT_CLIENT_SECRET
  });

  const response = await axios.post(url, params, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  const tokenData = response.data;

  const expirationDate = new Date(
    Date.now() + tokenData.expires_in * 1000
  );

  process.env.STACKSPOT_JWT = tokenData.access_token;
  process.env.STACKSPOT_JWT_EXPIRATION = expirationDate.toISOString();
}

// =======================
// Handlers
// =======================
bot.onText(/\/(start|s)/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Olá! Irei te ajudar na sua jornada de Stardew Valley"
  );
});

bot.onText(/\/(help|h)/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Para fazer uma pergunta, use o comando /q seguido da sua dúvida.\n\nExemplo: /q Como plantar morangos?"
  );
});


bot.onText(/\/q (.+)/, async (msg, match) => {
  try {
    await refreshJwt();

    const question = match[1];
    console.log(`Recebida pergunta: ${question}`);

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
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.STACKSPOT_JWT}`
        }
      }
    );

    const aiResponse = response.data.message;

    console.log(`Resposta recebida: ${aiResponse}`);

    bot.sendMessage(msg.chat.id, aiResponse);
  } catch (error) {
    console.error(error);
    bot.sendMessage(
      msg.chat.id,
      "Erro ao processar sua pergunta 😢. Tente novamente daqui alguns minutos!"
    );
  }
});
