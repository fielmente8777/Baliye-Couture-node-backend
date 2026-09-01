import axios from "axios";

const WHATSAPP_API_VERSION = "v25.0";

export async function sendWhatsAppOtp({
  phone,
  otp,
  accessToken,
  phoneNumberId,
  templateName,
  languageCode = "en_US",
}: {
  phone: string;
  otp: string;
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  languageCode?: string;
}): Promise<void> {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: otp,
              },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [
              {
                type: "text",
                text: otp,
              },
            ],
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );
}
