/**
 * @provider NimbaSMS
 * @capability verify_code
 * @atss 1.0
 * @capability_type synchronous
 */

const NIMBASMS_SERVICE_ID = process.env.NIMBASMS_SERVICE_ID;
const NIMBASMS_SECRET_TOKEN = process.env.NIMBASMS_SECRET_TOKEN;
if (!NIMBASMS_SERVICE_ID) throw new Error("Missing env: NIMBASMS_SERVICE_ID");
if (!NIMBASMS_SECRET_TOKEN) throw new Error("Missing env: NIMBASMS_SECRET_TOKEN");

const credentials = btoa(`${NIMBASMS_SERVICE_ID}:${NIMBASMS_SECRET_TOKEN}`);

interface VerifyCodeInput {
  id: string;
  code: string;
}

interface VerifyCodeResponse {
  id: string;
  status: string;
  to: string;
  message_cost: number;
}

interface NimbaSMSError {
  detail: string;
}

export async function verifyCode(
  input: VerifyCodeInput
): Promise<VerifyCodeResponse> {
  const endpoint = `https://api.nimbasms.com/v1/verifications/${input.id}`;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: input.code }),
  });

  if (!response.ok) {
    const error: NimbaSMSError = await response.json();
    throw new Error(`NimbaSMS error ${response.status}: ${error.detail}`);
  }

  return response.json() as Promise<VerifyCodeResponse>;
}

/*
Usage example:

// Appelé côté serveur avec le code saisi par l'utilisateur
const result = await verifyCode({
  id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", // id retourné par send_verification
  code: userInputCode,
});

if (result.status === "approved") {
  // Autoriser l'accès — marquer le numéro comme vérifié en base de données
  console.log(`Numéro ${result.to} vérifié avec succès`);
} else {
  // Informer l'utilisateur que le code est incorrect ou expiré
  console.log(`Vérification échouée : ${result.status}`);
}

// Chaque tentative échouée décrémente le compteur — après épuisement, créer une nouvelle vérification
// Ne jamais réutiliser un id après un status 'approved'
*/
