/**
 * @provider NimbaSMS
 * @capability get_message
 * @atss 1.0
 * @capability_type synchronous
 */

const NIMBASMS_SERVICE_ID = process.env.NIMBASMS_SERVICE_ID;
const NIMBASMS_SECRET_TOKEN = process.env.NIMBASMS_SECRET_TOKEN;
if (!NIMBASMS_SERVICE_ID) throw new Error("Missing env: NIMBASMS_SERVICE_ID");
if (!NIMBASMS_SECRET_TOKEN) throw new Error("Missing env: NIMBASMS_SECRET_TOKEN");

const credentials = btoa(`${NIMBASMS_SERVICE_ID}:${NIMBASMS_SECRET_TOKEN}`);

interface MessageResponse {
  id: string;
  status: string;
  to: string[];
  message: string;
  sender_name: string;
  sent_at: string;
  message_cost: number;
}

interface NimbaSMSError {
  detail: string;
}

export async function getMessage(messageId: string): Promise<MessageResponse> {
  const endpoint = `https://api.nimbasms.com/v1/messages/${messageId}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });

  if (!response.ok) {
    const error: NimbaSMSError = await response.json();
    throw new Error(`NimbaSMS error ${response.status}: ${error.detail}`);
  }

  return response.json() as Promise<MessageResponse>;
}

/*
Usage example:

const message = await getMessage("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
console.log(`Statut : ${message.status}`);
// Statuts possibles : pending, sent, delivered, failed

// Attendre quelques secondes après send_message avant de vérifier le statut
// 'sent' ne garantit pas la livraison — attendre 'delivered' pour confirmation
*/
