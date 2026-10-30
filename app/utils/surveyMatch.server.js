import { PrismaClient } from "@prisma/client";
import { unauthenticated } from "../shopify.server";
import { getSurveyStatus } from "./surveyStatus";

const prisma = new PrismaClient();

export const numericId = (gid) => String(gid ?? "").match(/\d+/g)?.pop() ?? "";
export const parseJson = (text) => { try { return text ? JSON.parse(text) : null; } catch (_) { return null; } };

/** Collection ids (numeric strings) that contain any of the given products */
async function collectionIdsForProducts(shop, productIds) {
  if (productIds.length === 0) return new Set();
  try {
    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(
      `#graphql
      query ProductCollections($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product { collections(first: 50) { nodes { id } } }
        }
      }`,
      { variables: { ids: productIds.map((id) => `gid://shopify/Product/${id}`) } },
    );
    const body = await response.json();
    const ids = new Set();
    for (const node of body?.data?.nodes ?? []) {
      for (const c of node?.collections?.nodes ?? []) ids.add(numericId(c.id));
    }
    return ids;
  } catch (error) {
    console.error("[survey-match] collection lookup failed:", error.message);
    return new Set();
  }
}

/** Questions in the shape the checkout extension and storefront widget both use */
export function publicSurvey(survey) {
  return {
    id: survey.id,
    title: survey.title,
    design: parseJson(survey.design) ?? {},
    questions: survey.questions.map((q) => ({
      id: q.id,
      text: q.text,
      isMultiChoice: q.isMultiChoice,
      isConditional: q.isConditional,
      isTextBox: q.isTextBox,
      questionType: q.questionType,
      branchRules: parseJson(q.branchRules) ?? [],
      answers: q.answers.map((a) => ({ id: a.id, text: a.text, haveTextBox: a.haveTextBox })),
    })),
  };
}

/**
 * Picks the survey that fits this shop + context.
 *  placements: which surveys are eligible, e.g. ["thankyou","both"] or ["storefront","both"]
 *  ctx: { productIds: string[], collectionIds: string[], country: string, total: number, page?: string }
 *  Pass `page` for storefront requests so each survey's "pages" setting is checked.
 */
export async function findMatchingSurvey({ shop, placements, ctx }) {
  const surveys = await prisma.survey.findMany({
    where: { shop, placement: { in: placements } },
    include: { questions: { orderBy: { id: "asc" }, include: { answers: { orderBy: { id: "asc" } } } } },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const live = surveys.filter((s) => getSurveyStatus(s, now) === "active" && s.questions.length > 0);

  const productIds = (ctx.productIds ?? []).map(numericId).filter(Boolean);
  let collectionIds = ctx.collectionIds ? new Set(ctx.collectionIds.map(numericId)) : null; // fetched lazily
  const country = String(ctx.country ?? "").toUpperCase();
  const total = Number(ctx.total) || 0;

  const matches = [];
  for (const survey of live) {
    // Storefront only: is this page one of the survey's pages?
    if (ctx.page) {
      const pages = parseJson(survey.pageTargets);
      const allowed = Array.isArray(pages) && pages.length > 0 ? pages : ["all"];
      if (!allowed.includes("all") && !allowed.includes(ctx.page)) continue;
    }

    const value = parseJson(survey.targetValue);
    let ok = false;
    switch (survey.targetType) {
      case "product":
        ok = Array.isArray(value) && value.some((p) => productIds.includes(numericId(p.id)));
        break;
      case "collection":
        if (collectionIds === null || (collectionIds.size === 0 && productIds.length > 0)) {
          collectionIds = new Set([...(collectionIds ?? []), ...(await collectionIdsForProducts(shop, productIds))]);
        }
        ok = Array.isArray(value) && value.some((c) => collectionIds.has(numericId(c.id)));
        break;
      case "country":
        ok = Array.isArray(value) && country !== "" && value.map((c) => String(c).toUpperCase()).includes(country);
        break;
      case "min_total":
        ok = total >= (Number(value?.amount) || 0);
        break;
      default:
        ok = true;
    }
    if (ok) matches.push(survey);
  }

  // Specific rules win over "every order"; newest first within each group
  matches.sort((a, b) => (b.targetType !== "all") - (a.targetType !== "all"));
  return matches[0] ?? null;
}
