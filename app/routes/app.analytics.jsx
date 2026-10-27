// app/routes/app._index.jsx

import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { PrismaClient } from "@prisma/client";
import { useState, useCallback } from "react";
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

  return json({
    surveys, shop, planName,
    questionLimit: rawLimit === Infinity ? null : rawLimit,
    maxSurveys: MAX_SURVEYS, usedLanguages, totalQuestions,
    typeCounts: { singleCount, multiCount, condCount, textCount },
  });
};

// ─── COMPONENT ────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const {
    surveys, shop, planName, questionLimit,
    maxSurveys, usedLanguages, totalQuestions, typeCounts,
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

  return (
    <>
      <div style={{ background: "linear-gradient(135deg, #4f46e5 0%, #6d5ef0 100%)", color: "#ffffff", padding: "40px 0 112px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 20px" }}>
          <InlineStack align="space-between" blockAlign="start" gap="400">
            <BlockStack gap="200">
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: "#ffffff" }}>{t("dashboard_title")}</h1>
              <span style={{ fontSize: 15, color: "#e0e0fb" }}>{t("dashboard_subtitle")}</span>
              <span style={{ fontSize: 14, color: "#ffffff", marginTop: 12 }}>
                {shop} · {PLAN_LABELS[planName]} {t("plan_label")} · {questionLimit === null ? t("unlimited_questions") : `${questionLimit} ${t("questions_per_survey_label")}`}
              </span>
            </BlockStack>
            <InlineStack gap="300" blockAlign="center">
              <Button size="large" onClick={() => navigate(dropdownLangFree ? createPath(uiLanguage) : withLang("/app/create-survey"))} disabled={hasReachedLimit}>
                {t("create_new_survey")}
              </Button>
            </InlineStack>
          </InlineStack>
        </div>
      </div>

    <Page>
      <BlockStack gap="500">
        <div style={{ marginTop: -88, position: "relative" }}>
          <BlockStack gap="400">
            {hasReachedLimit && (
              <Banner tone="warning">
                <Text variant="bodyMd">{t("max_survey_limit")} ({maxSurveys}/{maxSurveys}). {t("delete_to_create")}</Text>
              </Banner>
            )}
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
              <Card padding="500">
                <BlockStack gap="200">
                  <Text variant="bodySm" tone="subdued">{t("total_surveys")}</Text>
                  <InlineStack gap="200" blockAlign="baseline">
                    <Text variant="heading2xl" fontWeight="bold">{surveys.length}</Text>
                    <Text variant="bodySm" tone="subdued">/ {maxSurveys}</Text>
                  </InlineStack>
                  <div style={{ height: 6, borderRadius: 3, background: "#e0e0fb", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${(surveys.length / maxSurveys) * 100}%`, background: surveys.length >= maxSurveys ? "#d82c0d" : "#4f46e5", transition: "width 0.4s ease" }} />
                  </div>
                </BlockStack>
              </Card>
              <Card padding="500">
                <BlockStack gap="200">
                  <Text variant="bodySm" tone="subdued">{t("total_questions")}</Text>
                  <Text variant="heading2xl" fontWeight="bold">{totalQuestions}</Text>
                  <Text variant="bodySm" tone="subdued">
                    {surveys.length > 0 ? `≈ ${Math.round(totalQuestions / surveys.length)} / ${t("questions_per_survey").toLowerCase()}` : "—"}
                  </Text>
                </BlockStack>
              </Card>
              <Card padding="500">
                <BlockStack gap="200">
                  <Text variant="bodySm" tone="subdued">{t("questions_per_survey")}</Text>
                  <Text variant="heading2xl" fontWeight="bold">{limitLabel}</Text>
                  <Button size="slim" fullWidth variant={planName === "advanced" ? "tertiary" : "primary"} onClick={() => navigate(withLang("/app/billing"))}>
                    {planName === "advanced" ? t("max_plan") : t("upgrade_for_more")}
                  </Button>
                </BlockStack>
              </Card>
            </InlineGrid>
          </BlockStack>
        </div>


        {/* ── Question Types ── */}
        {totalQuestions > 0 && (
          <Card padding="500">
            <BlockStack gap="400">
              <Text variant="headingMd" fontWeight="bold">{t("question_types_breakdown")}</Text>
              <Divider />
              <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
                {[
                  { label: t("single_choice"), count: singleCount, color: "#4f46e5" },
                  { label: t("multi_choice"),  count: multiCount,  color: "#36a569" },
                  { label: t("conditional"),   count: condCount,   color: "#e8a735" },
                  { label: t("text_box"),      count: textCount,   color: "#5baaec" },
                ].map(({ label, count, color }) => (
                  <div key={label} style={{ border: "1px solid #e3e3f1", borderRadius: 12, padding: 16, background: "#ffffff" }}>
                    <BlockStack gap="200">
                      <Text variant="bodySm" fontWeight="semibold">{label}</Text>
                      <InlineStack gap="200" blockAlign="baseline">
                        <Text variant="headingXl" fontWeight="bold">{count}</Text>
                        <Text variant="bodySm" tone="subdued">{pct(count)}%</Text>
                      </InlineStack>
                      <div style={{ height: 4, borderRadius: 2, background: "#e0e0fb", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2, width: `${pct(count)}%`, background: color, transition: "width 0.4s ease" }} />
                      </div>
                    </BlockStack>
                  </div>
                ))}
              </InlineGrid>
            </BlockStack>
          </Card>
        )}

        {/* ── Language Distribution ── */}
        {surveys.length > 0 && (
          <Card padding="500">
            <BlockStack gap="400">
              <Text variant="headingMd" fontWeight="bold">{t("survey_distribution")}</Text>
              <Divider />
              <InlineGrid columns={{ xs: 2, sm: 3, md: 5 }} gap="300">
                {Object.entries(LANGUAGES).map(([key, { label }]) => {
                  const survey = surveys.find((s) => getLang(s) === key);
                  return (
                    <div key={key} style={{ border: "1px solid #e3e3f1", borderRadius: 12, padding: "14px 12px", textAlign: "center", background: survey ? "#f4f3ff" : "#ffffff" }}>
                      <BlockStack gap="200" inlineAlign="center">
                        <Text variant="bodySm" fontWeight="semibold">{label}</Text>
                        {survey ? (
                          <>
                            <Text variant="bodySm" fontWeight="medium">{survey.title}</Text>
                            <Text variant="bodySm" tone="subdued">{survey.questions?.length || 0} {t("questions_label")}</Text>
                          </>
                        ) : (
                          <Text variant="bodySm" tone="subdued">—</Text>
                        )}
                      </BlockStack>
                    </div>
                  );
                })}
              </InlineGrid>
            </BlockStack>
          </Card>
        )}

        {/* ── Survey List + Languages ── */}
        <InlineGrid columns={{ xs: 1, md: ["twoThirds", "oneThird"] }} gap="400" alignItems="start">
        <Card padding="500">
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text variant="headingLg" fontWeight="bold">{t("your_surveys")}</Text>
                <Text variant="bodySm" tone="subdued">
                  {t("one_survey_per_lang")} · {PLAN_LABELS[planName]}: {limitLabel} {t("questions_per_survey_label")}
                </Text>
              </BlockStack>
              <Button onClick={() => navigate(withLang("/app/create-survey"))} disabled={hasReachedLimit}>
                {t("create_new_survey")}
              </Button>
            </InlineStack>
            <Divider />
            {surveys.length > 0 ? (
              <DataTable
                columnContentTypes={["numeric", "text", "text"]}
                headings={[
                  <Text variant="bodySm" fontWeight="semibold" key="h1">#</Text>,
                  <Text variant="bodySm" fontWeight="semibold" key="h2">{t("survey_details")}</Text>,
                  <Text variant="bodySm" fontWeight="semibold" key="h3">{t("actions_label")}</Text>,
                ]}
                rows={surveyRows}
                hoverable
              />
            ) : (
              <Box padding="1200">
                <EmptyState
                  heading={t("no_surveys_yet")}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{ content: t("create_new_survey"), onAction: () => navigate(withLang("/app/create-survey")) }}
                >
                  <p>{t("no_surveys_desc")}</p>
                </EmptyState>
              </Box>
            )}
          </BlockStack>
        </Card>

          <Card padding="500">
            <BlockStack gap="300">
              <Text variant="headingSm" fontWeight="bold">{t("language_versions")}</Text>
              <BlockStack gap="200">
                {Object.entries(LANGUAGES).map(([key, { label }]) => {
                  const active = usedLanguages.includes(key);
                  return (
                    <InlineStack key={key} align="space-between" blockAlign="center">
                      <Text variant="bodySm" tone={active ? undefined : "subdued"}>{label}</Text>
                      {active
                        ? <Text variant="bodySm" tone="success">Added</Text>
                        : <Button size="micro" disabled={hasReachedLimit} onClick={() => navigate(createPath(key))}>Create</Button>}
                    </InlineStack>
                  );
                })}
              </BlockStack>
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>

      {/* ── Delete Modal ── */}
      {isDeleteBannerVisible && (
        <Modal
          open={true}
          onClose={isDeleting ? undefined : cancelDeleteSurvey}
          title={t("confirm_deletion")}
          primaryAction={{ content: isDeleting ? t("deleting") : t("delete_permanently"), onAction: confirmDeleteSurvey, destructive: true, loading: isDeleting, disabled: isDeleting }}
          secondaryActions={[{ content: t("cancel"), onAction: cancelDeleteSurvey, disabled: isDeleting }]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              {isDeleting && (
                <Banner tone="info">
                  <InlineStack gap="200" blockAlign="center">
                    <Spinner size="small" />
                    <Text variant="bodyMd" fontWeight="semibold">{t("deleting")}</Text>
                  </InlineStack>
                </Banner>
              )}
              <Banner tone="critical">
                <BlockStack gap="300">
                  <Text variant="bodyMd" fontWeight="bold">{t("cannot_undo")}</Text>
                  <Text variant="bodyMd">{t("delete_warning")}</Text>
                  <List type="bullet">
                    <List.Item>{t("delete_item_survey")}</List.Item>
                    <List.Item>{t("delete_item_responses")}</List.Item>
                    <List.Item>{t("delete_item_analytics")}</List.Item>
                  </List>
                </BlockStack>
              </Banner>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {/* ── View Modal ── */}
      {activeSurvey && (
        <Modal open={modalOpen} onClose={handleCloseModal} title={activeSurvey.title} large>
          <Modal.Section>
            <BlockStack gap="500">
              <InlineStack gap="300" wrap>
                <Badge tone="success">{activeSurvey.questions?.length || 0} {t("questions_label")}</Badge>
                <LangBadge survey={activeSurvey} />
              </InlineStack>
              <Divider />
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                {activeSurvey.questions.map((question, qIdx) => (
                  <Card key={question.id} padding="400">
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" fontWeight="bold" tone="subdued">Q{qIdx + 1}</Text>
                        <Text variant="bodyMd" fontWeight="bold">{question.text}</Text>
                      </InlineStack>
                      <InlineStack gap="200" wrap>
                        {question.isConditional  && <Badge tone="warning">{t("conditional")}</Badge>}
                        {question.isMultiChoice  && <Badge tone="success">{t("multi_choice")}</Badge>}
                        {question.isTextBox      && <Badge tone="info">{t("text_box")}</Badge>}
                        {!question.isConditional && !question.isMultiChoice && !question.isTextBox && (
                          <Badge tone="attention">{t("single_choice")}</Badge>
                        )}
                      </InlineStack>
                      {!question.isTextBox && (
                        <BlockStack gap="100">
                          {question.answers.map((a) => (
                            <InlineStack key={a.id} gap="200" blockAlign="center">
                              <Text variant="bodyMd">{a.text}</Text>
                            </InlineStack>
                          ))}
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Card>
                ))}
              </InlineGrid>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
    </>
  );
}
