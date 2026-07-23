import { createServerFn } from "@tanstack/react-start";
import { generateText, APICallError } from "ai";
import { z } from "zod";
import { createAnthropicProvider } from "../core/ai/ai-gateway.server";
import { TOP_CATEGORIES, PLACES } from "./expense-types";

const InputSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  dataBase64: z.string(),
});

const ClarificationOptionSchema = z.object({
  label: z.string(),
  side: z.enum(["SCI", "Association"]),
  topCategory: z.enum(TOP_CATEGORIES),
  comment: z.string(),
});

const ExpenseSchema = z.object({
  supplier: z.string().default(""),
  invoiceDate: z.string().default(""),
  amountTTC: z.number().default(0),
  vat: z.number().nullable().default(null),
  detectedObject: z.string().default(""),
  topCategory: z.enum(TOP_CATEGORIES),
  purchaseDetail: z.string().default(""),
  place: z.enum(PLACES),
  paidBy: z.enum(["SCI", "Association", "Membre"]).default("Membre"),
  memberName: z.string().nullable().default(null),
  paymentMethod: z.enum(["Virement", "Chèque", "Carte", "Prélèvement", "Espèces"]).default("Carte"),
  finalSide: z.enum(["SCI", "Association"]),
  comment: z.string().default(""),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().default(""),
  clarificationOptions: z.array(ClarificationOptionSchema).default([]),
});

const SYSTEM = `Tu analyses des factures pour un lieu de vie partagé entre une SCI (propriétaire du bâtiment, activité locative Airbnb comprise) et une Association (vie quotidienne du lieu pour les membres).

PRINCIPE FONDAMENTAL: tu ne poses JAMAIS de vérité tranchée par défaut. Presque toute dépense peut basculer d'un côté ou de l'autre selon l'intention réelle. Ton rôle est de proposer un arbitrage NUANCÉ, jamais péremptoire, et de demander confirmation à l'utilisateur.

RÈGLE PRIORITAIRE ABSOLUE (prime sur tout le reste): si la facture est nominativement adressée à la SCI (nom de la SCI dans le bloc client/facturé à/destinataire, ou SIRET de la SCI), alors "finalSide" = "SCI", "paidBy" = "SCI", "needsClarification" = false, "clarificationOptions" = []. Aucune ambiguïté, aucune question. De même si la facture est nominativement adressée à l'Association : "finalSide" = "Association", "paidBy" = "Association", "needsClarification" = false. Cette règle prime sur les cas ambigus décrits plus bas.

Repères d'arbitrage (indicatifs, jamais automatiques):
- SCI = ce qui touche au bâti, à l'immobilier durable, aux gros travaux structurels, aux charges/impôts/assurances de propriétaire, à l'équipement de la location payante (Airbnb, gîte).
- Association = ce qui fait vivre le lieu au quotidien pour les membres : courses, repas, consommables courants, événements internes, administration de l'asso.

CAS AMBIGUS (la règle, pas l'exception):
- Peinture, matériaux, bricolage, outillage, aménagement d'une pièce : peut être SCI (travaux qui valorisent le bâti, préparent une location) OU Association (rafraîchissement léger pour le confort quotidien des membres). Ne présume rien.
- Refaire une pièce pour la louer : plutôt SCI (valorisation du bien locatif).
- Refaire une pièce pour le confort de l'asso : peut rester SCI si c'est un vrai chantier qui améliore le bâti, ou basculer Asso si c'est un simple rafraîchissement à la charge de la vie asso.
- Mobilier, linge, vaisselle, décoration, petit électroménager, produits d'entretien, courses : SCI si destiné à l'Airbnb / la location payante ; Association si c'est pour les membres.
- Origine du besoin : si l'idée vient de l'Asso, penche Asso ; si elle vient de la SCI, penche SCI.

RÈGLE ABSOLUE: dans tous ces cas ambigus (et ils sont la majorité), tu DOIS mettre "needsClarification": true. Tu proposes un finalSide par défaut argumenté mais tentatif, et tu poses UNE question courte (max 10-12 mots) que l'utilisateur comprend du premier coup. Parle concret : "Airbnb / location" contre "asso / vie de l'asso" ; ou "gros travaux" contre "simple rafraîchissement". Exemples : "C'est pour la location ou pour l'asso ?", "Vrais travaux sur le bâti ou rafraîchissement asso ?", "Cette pièce, tu la loues ou c'est pour les membres ?".

Ne mets "needsClarification": false QUE si la facture est totalement sans ambiguïté (ex : taxe foncière SCI, courses alimentaires évidentes pour l'asso, facture nominative à la SCI pour un gros chantier structurel).

RÈGLE CATÉGORIE Airbnb / location: dès que l'achat concerne clairement l'Airbnb, la location payante, le gîte, ou tout équipement/consommable destiné aux locataires payants, "topCategory" DOIT être "Activité locative — Revenus + dépenses". Sinon, choisis la catégorie qui correspond à ton finalSide par défaut.

RÈGLE REPAS CHANTIER: utilise "Repas chantier" uniquement si la facture ou son libellé mentionne explicitement un chantier, des repas de chantier ou des courses faites pour un chantier. Dans ce cas, classe côté "Association". Si ce contexte n'est pas écrit sur la facture, ne le devine pas : l'utilisateur pourra l'indiquer après l'analyse.

CLARIFICATION OPTIONS: quand "needsClarification" est true, tu DOIS remplir "clarificationOptions" avec EXACTEMENT 2 réponses possibles, UNE côté SCI et UNE côté Association. Chaque option contient:
- "label": bouton court et clair (max 4-5 mots) que verra l'utilisateur. Mots concrets : "Pour la location", "Pour l'asso", "Gros travaux SCI", "Rafraîchissement asso". Évite les formulations abstraites.
- "side": "SCI" ou "Association" selon la réponse.
- "topCategory": la catégorie à appliquer si l'utilisateur choisit cette réponse (valeur EXACTE parmi la liste).
- "comment": 1 à 2 phrases NUANCÉES qui décrivent l'usage réel pour cette réponse. Français naturel, "côté SCI / Asso", "classé comme...", "considéré comme...". Jamais de noms techniques.
Si "needsClarification" est false, laisse "clarificationOptions" à [].

RÈGLE COMMENTAIRE: le champ "comment" est rédigé en français naturel, TOUJOURS avec nuance, jamais péremptoire, 1 à 2 phrases maximum. Ne dis JAMAIS "X est par défaut SCI" ou "X est par défaut Asso". Formule plutôt : "peut être classé côté SCI s'il s'agit de travaux sur le bâti, ou côté Asso si c'est un simple rafraîchissement, à confirmer". Explique le raisonnement en 2 branches quand c'est ambigu. N'utilise JAMAIS les noms de champs techniques (finalSide, topCategory, needsClarification, clarificationOptions). N'utilise JAMAIS le caractère tiret cadratin "—" : virgule, point, point-virgule, ou reformule.



Tu DOIS répondre UNIQUEMENT avec un objet JSON valide (aucun texte, aucun markdown, aucune balise \`\`\`) avec EXACTEMENT ces champs:
{
  "supplier": string,
  "invoiceDate": string (YYYY-MM-DD, "" si inconnu),
  "amountTTC": number (euros, 0 si inconnu),
  "vat": number | null,
  "detectedObject": string (bref),
  "topCategory": une valeur EXACTE parmi ${JSON.stringify(TOP_CATEGORIES)},
  "purchaseDetail": string (bref),
  "place": une valeur EXACTE parmi ${JSON.stringify(PLACES)},
  "paidBy": "SCI" | "Association" | "Membre",
  "memberName": string | null,
  "paymentMethod": "Virement" | "Chèque" | "Carte" | "Prélèvement" | "Espèces",
  "finalSide": "SCI" | "Association",
  "comment": string,
  "needsClarification": boolean,
  "clarificationQuestion": string (vide "" si pas besoin),
  "clarificationOptions": [ { "label": string, "side": "SCI"|"Association", "topCategory": string, "comment": string } ] (vide [] si pas de clarification)
}
Si un champ est inconnu: chaîne vide "" ou null pour les nombres optionnels.

DÉTECTION DU PAYEUR (paidBy) — regarde attentivement la facture avant de trancher :
- "SCI" si la facture est adressée / facturée à une SCI, ou si le mode de paiement mentionne un compte au nom de la SCI.
- "Association" (Asso) si mêmes signaux mais au nom de l'association.
- "Membre" par défaut UNIQUEMENT quand rien n'indique un paiement direct par l'entreprise. Un membre a avancé et sera remboursé.
Ne devine pas : en l'absence de signal clair côté SCI ou Asso, reste sur "Membre".

paymentMethod par défaut "Carte". Décision finalSide OBLIGATOIRE.`;

function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Invalid JSON from model");
  }
}

export const analyzeInvoice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY missing");

    const isImage = data.mimeType.startsWith("image/");
    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: "Analyse cette facture et renvoie UNIQUEMENT le JSON demandé." },
    ];
    if (isImage) {
      userContent.push({
        type: "image",
        image: `data:${data.mimeType};base64,${data.dataBase64}`,
      });
    } else {
      userContent.push({
        type: "file",
        data: data.dataBase64,
        mediaType: data.mimeType,
      });
    }

    let text: string;
    try {
      const gateway = createAnthropicProvider(anthropicKey);
      const model = gateway(process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001");
      const res = await generateText({
        model,
        system: SYSTEM,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [{ role: "user", content: userContent as any }],
        maxRetries: 1,
      });
      text = res.text;
    } catch (error) {
      // Logué en direct pour être SÛR de voir le vrai message dans le
      // terminal `bun run dev` — sans ça, impossible de savoir ce qui cloche
      // vraiment (clé invalide, quota, panne...).
      console.error("[analyzeInvoice] échec de l'appel Claude:", error);
      let detail = error instanceof Error ? error.message : String(error);
      if (APICallError.isInstance(error)) {
        console.error("[analyzeInvoice] statusCode:", error.statusCode);
        console.error("[analyzeInvoice] responseBody:", error.responseBody);
        if (error.responseBody) detail = `${error.statusCode ?? ""} ${error.responseBody}`.trim();
      }
      // Préfixe "MANUAL:" reconnu côté client : au lieu d'un mur d'erreur, on
      // bascule la personne sur la saisie manuelle pour ne jamais la bloquer
      // complètement si l'IA est indisponible.
      throw new Error(`MANUAL:${detail}`);
    }

    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch (e) {
      console.error("Model returned non-JSON:", text);
      throw new Error("La facture n'a pas pu être analysée (réponse invalide du modèle).");
    }

    const result = ExpenseSchema.safeParse(parsed);
    if (!result.success) {
      console.error("Schema mismatch", result.error, parsed);
      // Try to coerce missing required enums with sensible defaults
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = parsed as any;
      const fallback = {
        supplier: p?.supplier ?? "",
        invoiceDate: p?.invoiceDate ?? "",
        amountTTC: typeof p?.amountTTC === "number" ? p.amountTTC : 0,
        vat: typeof p?.vat === "number" ? p.vat : null,
        detectedObject: p?.detectedObject ?? "",
        topCategory: TOP_CATEGORIES.includes(p?.topCategory)
          ? p.topCategory
          : "Divers / Exceptionnel",
        purchaseDetail: p?.purchaseDetail ?? "",
        place: PLACES.includes(p?.place) ? p.place : "Autre",
        paidBy: ["SCI", "Association", "Membre"].includes(p?.paidBy) ? p.paidBy : "Membre",
        memberName: p?.memberName ?? null,
        paymentMethod: ["Virement", "Chèque", "Carte", "Prélèvement", "Espèces"].includes(
          p?.paymentMethod,
        )
          ? p.paymentMethod
          : "Carte",
        finalSide: p?.finalSide === "Association" ? "Association" : "SCI",
        comment: p?.comment ?? "",
        needsClarification: p?.needsClarification === true,
        clarificationQuestion:
          typeof p?.clarificationQuestion === "string" ? p.clarificationQuestion : "",
        clarificationOptions: Array.isArray(p?.clarificationOptions) ? p.clarificationOptions : [],
      };
      return { ...ExpenseSchema.parse(fallback), needsPlaceChoice: true };
    }
    return { ...result.data, needsPlaceChoice: true };
  });
