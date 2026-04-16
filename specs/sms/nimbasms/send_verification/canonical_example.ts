/**
 * @provider NimbaSMS
 * @capability send_verification
 * @atss 1.0
 * @capability_type synchronous
 */

const NIMBASMS_SERVICE_ID = process.env.NIMBASMS_SERVICE_ID;
const NIMBASMS_SECRET_TOKEN = process.env.NIMBASMS_SECRET_TOKEN;
if (!NIMBASMS_SERVICE_ID) throw new Error("Missing env: NIMBASMS_SERVICE_ID");
if (!NIMBASMS_SECRET_TOKEN) throw new Error("Missing env: NIMBASMS_SECRET_TOKEN");

const credentials = btoa(`${NIMBASMS_SERVICE_ID}:${NIMBASMS_SECRET_TOKEN}`);

interface SendVerificationInput {
  to: string;
  message?: string;
  sender_name?: string;
  expiry_time?: number;
  attempts?: number;
  code_length?: number;
}

interface SendVerificationResponse {
  id: string;
  to: string;
  status: string;
  expiry_time: number;
  attempts: number;
  code_length: number;
  message_cost: number;
}

interface NimbaSMSError {
  detail: string;
}

export async function sendVerification(
  input: SendVerificationInput
): Promise<SendVerificationResponse> {
  const response = await fetch("https://api.nimbasms.com/v1/verifications", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error: NimbaSMSError = await response.json();
    throw new Error(`NimbaSMS error ${response.status}: ${error.detail}`);
  }

  return response.json() as Promise<SendVerificationResponse>;
}

/*
Usage example:

const verification = await sendVerification({
  to: "+224XXXXXXXXX", // format E.164 avec '+' (différent de send_message qui utilise le format local)
  message: "Votre code de vérification est : <1234>", // <1234> est obligatoire
  expiry_time: 10,   // 10 minutes, entre 5 et 30
  attempts: 3,       // 3 tentatives max, entre 3 et 10
  code_length: 6,    // code à 6 chiffres, entre 4 et 8
});

console.log(`Vérification créée : ${verification.id}`);
console.log(`SMS consommés : ${verification.message_cost}`); // toujours 1 pour les vérifications
// Stocker verification.id côté serveur pour appeler verify_code
// Ne jamais exposer cet id côté client
// expiry_time et attempts sont envoyés à null quand non fournis — l'API utilise ses propres défauts
*/
