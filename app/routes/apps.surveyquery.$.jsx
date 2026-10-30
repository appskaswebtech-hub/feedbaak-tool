import { json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../shopify.server";
import { findMatchingSurvey, publicSurvey } from "../utils/surveyMatch.server";

// Storefront survey widget API, reached through the Shopify app proxy:
//   GET  /apps/surveyquery/survey   -> the survey to show on this page
//   POST /apps/surveyquery/submit   -> save (or update) a visitor's answers
// Shopify signs every proxied request; authenticate.public.appProxy verifies it.

const prisma = new PrismaClient();

const page = (value) =>
  ["home", "product", "collection", "cart", "page", "blog"].includes(value) ? value : "other";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || session?.shop;
  if (!shop) return json({ error: "Missing shop" }, { status: 400 });

  if (params["*"] !== "survey") return json({ error: "Not found" }, { status: 404 });

  const productId = url.searchParams.get("productId") || "";
  const collectionId = url.searchParams.get("collectionId") || "";

  const survey = await findMatchingSurvey({
    shop,
    placements: ["storefront", "both"],
    ctx: {
      page: page(url.searchParams.get("page")),
      productIds: productId ? [productId] : [],
      collectionIds: collectionId ? [collectionId] : null,
      country: url.searchParams.get("country") || "",
      total: parseFloat(url.searchParams.get("total") || "0") || 0,
    },
  });

  if (!survey) return json({ survey: null });
  return json({ survey: publicSurvey(survey) });
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || session?.shop;
  if (!shop) return json({ error: "Missing shop" }, { status: 400 });
  if (params["*"] !== "submit" || request.method !== "POST") return json({ error: "Not found" }, { status: 404 });

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: "Invalid JSON" }, { status: 400 }); }

  const surveyId = Number(body.surveyId);
  const visitorId = String(body.visitorId ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  const answers = Array.isArray(body.answers) ? body.answers.filter(Boolean).slice(0, 50) : [];
  if (!surveyId || !visitorId || answers.length === 0) return json({ error: "surveyId, visitorId and answers are required" }, { status: 400 });

  const survey = await prisma.survey.findFirst({
    where: { id: surveyId, shop, placement: { in: ["storefront", "both"] } },
    select: { id: true, title: true },
  });
  if (!survey) return json({ error: "Survey not found" }, { status: 404 });

  const cleanAnswers = answers.map((a) => ({
    questionTitle: String(a.questionTitle ?? "").slice(0, 500),
    questionNumber: Number(a.questionNumber) || 0,
    answer: String(a.answer ?? "").slice(0, 2000),
  }));

  const key = `sf-${visitorId}-${survey.id}`;
  const email = String(body.email ?? "").trim().slice(0, 200) || "Visitor";
  const pageUrl = String(body.pageUrl ?? "").slice(0, 500) || null;

  const existing = await prisma.apiProxyData.findFirst({ where: { shop, orderId: key } });
  if (existing) {
    await prisma.apiProxyData.update({
      where: { id: existing.id },
      data: { email, surveyTitle: survey.title, answers: JSON.stringify(cleanAnswers), pageUrl },
    });
  } else {
    await prisma.apiProxyData.create({
      data: { shop, shopDomain: shop, email, surveyTitle: survey.title, orderId: key, answers: JSON.stringify(cleanAnswers), source: "storefront", pageUrl },
    });
  }
  return json({ ok: true });
};
