import { PrismaClient } from "@prisma/client";
import { findMatchingSurvey, publicSurvey } from "../utils/surveyMatch.server";

const prisma = new PrismaClient();

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

export const OPTIONS = async () => new Response(null, { status: 204, headers: corsHeaders });

/**
 * GET /app/active-survey?shop=...&country=IN&total=120.5&productIds=1,2
 * Thank-you page: returns the survey that should be shown for this order (or 404).
 */
export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    if (!shop) return jsonResponse({ error: "Missing required 'shop' parameter" }, 400);

    // The checkout block is live for this shop (drives the dashboard setup steps)
    prisma.shopSetup
      .upsert({ where: { shop }, update: {}, create: { shop, blockSeenAt: new Date() } })
      .catch((e) => console.error("[active-survey] setup tracking failed:", e.message));

    const survey = await findMatchingSurvey({
      shop,
      placements: ["thankyou", "both"],
      ctx: {
        country: url.searchParams.get("country") || "",
        total: parseFloat(url.searchParams.get("total") || "0") || 0,
        productIds: (url.searchParams.get("productIds") || "").split(",").filter(Boolean),
      },
    });
    if (!survey) return jsonResponse({ error: "No survey matches this order", shop }, 404);

    return jsonResponse({ survey: publicSurvey(survey) });
  } catch (error) {
    console.error("[active-survey] error:", error);
    return jsonResponse({ error: "Internal server error", details: error.message }, 500);
  }
};
