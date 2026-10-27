// app/routes/app._index.jsx

import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { PrismaClient } from "@prisma/client";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Card,
  Button,
  BlockStack,
  Text,
  Box,
  InlineStack,
  InlineGrid,
  DataTable,
  Modal,
  List,
  Banner,
  Badge,
  Tooltip,
  Divider,
  
  EmptyState,
  Spinner,
  Select,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getShopPlanFromDB } from "../utils/planUtils";
import { getT, LANG_KEY_TO_ISO } from "../utils/translations";

const prisma = new PrismaClient();

const QUESTION_LIMITS = { free: 1, pro: 5, advanced: Infinity };
const PLAN_LABELS     = { free: "Free", pro: "Pro", advanced: "Advanced" };

const LANGUAGES = {
  default: { label: "Default (English)", flag: "", badge: "info",    isoCode: "en" },
  french:  { label: "French",            flag: "", badge: "magic",   isoCode: "fr" },
  spanish: { label: "Spanish",           flag: "", badge: "warning", isoCode: "es" },
  italian: { label: "Italian",           flag: "", badge: "success", isoCode: "it" },
  german:  { label: "German",            flag: "", badge: "info",    isoCode: "de" },
};

const LANGUAGE_DROPDOWN_OPTIONS = Object.entries(LANGUAGES).map(([value, { flag, label }]) => ({
  label: `${label}`,
  value,
}));

const getLang = (survey) =>
  survey.language ?? (survey.isFrenchVersion ? "french" : "default");

// ─── LOADER ───────────────────────────────────────────────────
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const shopPlan = await getShopPlanFromDB(shop);
  const planName = shopPlan.name ?? "free";
  const rawLimit = QUESTION_LIMITS[planName] ?? 1;

  const surveys = await prisma.survey.findMany({
    where: { shop },
    include: { questions: { include: { answers: true } } },
  });

  const MAX_SURVEYS   = Object.keys(LANGUAGES).length;
  const usedLanguages = surveys.map((s) => getLang(s));
  const totalQuestions = surveys.reduce((sum, s) => sum + (s.questions?.length || 0), 0);

  let singleCount = 0, multiCount = 0, condCount = 0, textCount = 0;
  surveys.forEach((s) =>
    s.questions?.forEach((q) => {
      if (q.isConditional) condCount++;
      else if (q.isMultiChoice) multiCount++;
      else if (q.isTextBox) textCount++;
      else singleCount++;
    })
  );

  const [setupRow, responseCount] = await Promise.all([
    prisma.shopSetup.findUnique({ where: { shop } }),
    prisma.apiProxyData.count({ where: { shop } }),
  ]);

  return json({
    blockSeen: !!setupRow?.blockSeenAt,
    hasResponses: responseCount > 0,
    surveys, shop, planName,
    questionLimit: rawLimit === Infinity ? null : rawLimit,
    maxSurveys: MAX_SURVEYS, usedLanguages, totalQuestions,
    typeCounts: { singleCount, multiCount, condCount, textCount },
  });
};

// ─── COMPONENT ────────────────────────────────────────────────
export default function DashboardIndex() {
  const {
    surveys, shop, planName, questionLimit,
    maxSurveys, usedLanguages, totalQuestions, typeCounts, blockSeen, hasResponses,
  } = useLoaderData();

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Read language from URL, default to "default" (English) ──
  const uiLanguage = "default";
  const uiLangIso  = LANG_KEY_TO_ISO[uiLanguage] ?? "en";
  const t          = getT(uiLangIso);

  // Helper: build path that always carries the current lang param
  const withLang = useCallback(
    (path) => {
      const sep = path.includes("?") ? "&" : "?";
      return uiLanguage === "default" ? path : `${path}${sep}lang=${uiLanguage}`;
    },
    [uiLanguage],
  );

  const handleLanguageChange = useCallback(
    (value) => {
      setSearchParams((prev) => {
        if (value === "default") { prev.delete("lang"); }
        else { prev.set("lang", value); }
        return prev;
      });
    },
    [setSearchParams],
  );

  // Open the create form pre-set to a given survey language
  const createPath = (langKey) => withLang(`/app/create-survey?surveyLang=${langKey}`);
  const checkoutEditorUrl = `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/settings/checkout/editor?page=thank-you`;
  const dropdownLangFree = !usedLanguages.includes(uiLanguage);

  const limitLabel      = questionLimit === null ? "∞" : questionLimit;
  const hasReachedLimit = usedLanguages.includes("default");

  // Delete state
  const [isDeleteBannerVisible, setDeleteBannerVisible] = useState(false);
  const [surveyToDelete, setSurveyToDelete]             = useState(null);
  const [isDeleting, setIsDeleting]                     = useState(false);

  // View modal
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [modalOpen, setModalOpen]       = useState(false);

  const handleViewSurvey   = (s) => { setActiveSurvey(s); setModalOpen(true); };
  const handleCloseModal   = () => { setModalOpen(false); setTimeout(() => setActiveSurvey(null), 300); };
  const handleDeleteSurvey = (id) => { setSurveyToDelete(id); setDeleteBannerVisible(true); };
  const cancelDeleteSurvey = () => { setDeleteBannerVisible(false); setSurveyToDelete(null); };

  const confirmDeleteSurvey = async () => {
    if (!surveyToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch("/api/delete-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surveyId: surveyToDelete }),
      });
      if (res.ok) {
        setDeleteBannerVisible(false); setSurveyToDelete(null); setIsDeleting(false);
        navigate(withLang("/app/"), { replace: true });
      } else { setIsDeleting(false); alert("Failed to delete survey."); }
    } catch (e) { console.error(e); setIsDeleting(false); alert("Failed to delete survey."); }
  };

  const LangBadge = ({ survey }) => {
    const lang = getLang(survey);
    const info = LANGUAGES[lang] ?? LANGUAGES.default;
    return <Badge tone={info.badge}>{info.label}</Badge>;
  };

  const { singleCount, multiCount, condCount, textCount } = typeCounts;
  const pct = (n) => totalQuestions > 0 ? Math.round((n / totalQuestions) * 100) : 0;

  // ── Table rows ─────────────────────────────────────────────
  const surveyRows = surveys.map((survey, index) => [
    <Text variant="bodyMd" fontWeight="semibold" key={`n-${survey.id}`}>{index + 1}</Text>,
    <BlockStack gap="100" key={`d-${survey.id}`}>
      <Text variant="bodyMd" fontWeight="bold">{survey.title}</Text>
      <InlineStack gap="200">
        <Text variant="bodySm" tone="subdued">{survey.questions?.length || 0} {t("questions_label")}</Text>
        <Text variant="bodySm" tone="subdued">·</Text>
        <LangBadge survey={survey} />
      </InlineStack>
    </BlockStack>,
    <InlineStack key={`a-${survey.id}`} gap="200">
      <Button onClick={() => handleViewSurvey(survey)} size="slim" variant="tertiary">{t("view_survey")}</Button>
      <Button onClick={() => navigate(withLang(`/app/create-survey?edit=${survey.id}`))} size="slim">{t("edit_survey")}</Button>
      <Button onClick={() => handleDeleteSurvey(survey.id)} size="slim" tone="critical">{t("delete_survey")}</Button>
    </InlineStack>,
  ]);

  // Steps 1 and 4 can't be detected automatically, so the merchant ticks them off (kept in this browser only)
  const [manualDone, setManualDone] = useState({});
  useEffect(() => {
    try { setManualDone(JSON.parse(window.localStorage.getItem("ft-setup-steps") || "{}")); } catch (_) { /* ignore */ }
  }, []);
  const toggleManual = (n) => {
    setManualDone((prev) => {
      const next = { ...prev, [n]: !prev[n] };
      try { window.localStorage.setItem("ft-setup-steps", JSON.stringify(next)); } catch (_) { /* ignore */ }
      return next;
    });
  };

  const steps = [
    { n: 1, title: t("guide_step1_title"), done: blockSeen || !!manualDone[1], manual: !blockSeen,
      body: t("guide_step1_body"),
      action: { content: t("guide_step1_btn"), url: checkoutEditorUrl } },
    { n: 2, title: t("guide_step2_title"), done: surveys.length > 0,
      body: t("guide_step2_body"),
      action: { content: t("guide_step2_btn"), onAction: () => navigate(dropdownLangFree ? createPath(uiLanguage) : withLang("/app/create-survey")), disabled: hasReachedLimit } },
    { n: 4, title: t("guide_step4_title"), done: hasResponses || !!manualDone[4], manual: !hasResponses,
      body: t("guide_step4_body"),
      action: { content: t("guide_step4_btn"), onAction: () => navigate(withLang("/app/manage")) } },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const currentStep = steps.find((x) => !x.done)?.n;

  return (
    <Page>
      <BlockStack gap="500">
        <InlineStack align="space-between" blockAlign="start" gap="400">
          <BlockStack gap="100">
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, color: "#1b1b3a" }}>{t("dashboard_title")}</h1>
            <Text variant="bodyMd" tone="subdued">{t("dashboard_subtitle")}</Text>
            <Text variant="bodyMd">
              <strong>{shop}</strong> · {PLAN_LABELS[planName]} {t("plan_label")} · {questionLimit === null ? t("unlimited_questions") : `${questionLimit} ${t("questions_per_survey_label")}`}
            </Text>
          </BlockStack>
          <InlineStack gap="300" blockAlign="center">
            <Button variant="primary" size="large" onClick={() => navigate(dropdownLangFree ? createPath(uiLanguage) : withLang("/app/create-survey"))} disabled={hasReachedLimit}>
              {t("create_new_survey")}
            </Button>
          </InlineStack>
        </InlineStack>

        {hasReachedLimit && (
          <Banner tone="warning">
            <Text variant="bodyMd">{t("max_survey_limit")} ({maxSurveys}/{maxSurveys}). {t("delete_to_create")}</Text>
          </Banner>
        )}

        <Card padding="500">
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text variant="headingLg" as="h2" fontWeight="bold">{t("guide_title")}</Text>
              <Text variant="bodyMd" tone="subdued">{t("guide_subtitle")}</Text>
            </BlockStack>

            <div style={{ height: 8, borderRadius: 4, background: "#e0e0fb", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(doneCount / steps.length) * 100}%`, background: "#4f46e5", borderRadius: 4, transition: "width 0.4s ease" }} />
            </div>

            <div>
              {steps.map(({ n, title, done, manual, body, action }, i) => {
                const filled = done || n === currentStep;
                const isLast = i === steps.length - 1;
                return (
                  <div key={n} style={{ display: "flex", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 32 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700,
                        background: filled ? "#4f46e5" : "#ffffff", color: filled ? "#ffffff" : "#8a8aa8", border: filled ? "2px solid #4f46e5" : "2px solid #d6d6e7" }}>{i + 1}</div>
                      {!isLast && <div style={{ flex: 1, width: 2, background: "#d6d6e7", margin: "4px 0" }} />}
                    </div>
                    <div style={{ paddingBottom: isLast ? 0 : 24, flex: 1, maxWidth: 720 }}>
                      <BlockStack gap="150">
                        <InlineStack gap="200" blockAlign="center">
                          <Text variant="headingSm" fontWeight="bold">{title}</Text>
                          {done && <Badge tone="success">{t("guide_done")}</Badge>}
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued">{body}</Text>
                        <InlineStack gap="200" blockAlign="center">
                          {action && (
                            <Button size="slim" onClick={action.url ? () => window.open(action.url, "_blank", "noopener") : action.onAction} disabled={action.disabled}>{action.content}</Button>
                          )}
                          {manual && (
                            <Button size="slim" variant="plain" onClick={() => toggleManual(n)}>{done ? t("guide_mark_not_done") : t("guide_mark_done")}</Button>
                          )}
                        </InlineStack>
                      </BlockStack>
                    </div>
                  </div>
                );
              })}
            </div>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
