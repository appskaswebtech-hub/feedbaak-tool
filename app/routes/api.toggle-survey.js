import { PrismaClient } from "@prisma/client";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const prisma = new PrismaClient();

// POST { surveyId, isActive } — turn a survey on or off
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { surveyId, isActive } = await request.json();

  if (!surveyId || typeof isActive !== "boolean") {
    return json({ error: "surveyId and isActive are required." }, { status: 400 });
  }

  const result = await prisma.survey.updateMany({
    where: { id: Number(surveyId), shop: session.shop },
    data: { isActive },
  });
  if (result.count === 0) return json({ error: "Survey not found." }, { status: 404 });
  return json({ ok: true, isActive });
};
