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

  const MAX_SURVEYS   = 10;
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
  const hasReachedLimit = surveys.length >= maxSurveys;

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


  const StepIcon = ({ index }) => {
    const icons = [
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="24" r="8"/><path d="M20 5h8l2 6 5 2 6-2 4 7-5 5v4l5 5-4 7-6-2-5 2-2 6h-8l-2-6-5-2-6 2-4-7 5-5v-4l-5-5 4-7 6 2 5-2z"/></svg>,
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 35l-5 5v-13a17 17 0 1 1 8 12"/><path d="M20 19a6 6 0 0 1 11 3c0 4-6 5-6 9"/><circle cx="25" cy="36" r="1"/></svg>,
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M8 40V28h7v12M21 40V18h7v22M34 40V8h7v32"/></svg>
    ];
    return icons[index];
  };

  return (
    <Page fullWidth>
      <style>{`
        .ft-dashboard{--ft-primary:#0866f5;--ft-ink:#111a3b;--ft-muted:#626c90;position:relative;isolation:isolate;min-height:calc(100vh - 90px);padding:36px max(24px,calc((100% - 1320px)/2)) 70px;font-family:Inter,system-ui,-apple-system,sans-serif;color:var(--ft-ink)}
body {
    background: linear-gradient(110deg, #ffffff 0%, #f4fbff 42%, #e5f5ff 100%) !important;
}
       
        .ft-top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:25px}
        .ft-heading{margin:0;font-size:clamp(30px,3vw,44px);font-weight:800;letter-spacing:-1.7px;line-height:1.1}
        .ft-heading span{color:#ff1875}.ft-subtitle{font-size:15px;color:#505a7b;margin:8px 0 12px}
        .ft-store{display:inline-flex;align-items:center;flex-wrap:wrap;gap:8px;border:1px solid #d5e7fa;background:#ffffff8a;padding:9px 15px;border-radius:14px;font-size:13px;color:#536080}
        .ft-store strong{color:#18213c}.ft-store svg{width:17px;height:17px}
        .ft-primary{background:linear-gradient(115deg,#0064f7,#168dff);color:#fff;border:0;border-radius:12px;padding:13px 20px;font-size:14px;font-weight:700;box-shadow:0 7px 17px #0866f52b;cursor:pointer;transition:transform .2s,box-shadow .2s}
        .ft-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 23px #0866f544}.ft-primary:disabled{opacity:.45;cursor:not-allowed}
        .ft-top-create{white-space:nowrap;margin-top:2px;padding:15px 23px}
        .ft-plus{display:inline-grid;place-items:center;background:white;color:#0866f5;width:21px;height:21px;border-radius:50%;margin-right:8px;font-size:18px;vertical-align:middle}
        .ft-panel{background:#fff;border:1px solid #fff;border-radius:22px;box-shadow:0 15px 48px #0066cc14;overflow:hidden}
        .ft-hero{position:relative;min-height:166px;padding:30px 34px;display:flex;align-items:center;background:linear-gradient(115deg,#fff 35%,#eaf6ff 100%);overflow:hidden}
        .ft-hero-copy{position:relative;z-index:2;max-width:72%}
        .ft-hero-tag{color:#0866f5;font-size:13px;font-weight:800;letter-spacing:.6px;margin-bottom:9px}
        .ft-hero-title{font-size:clamp(22px,2.4vw,32px);line-height:1.18;letter-spacing:-.7px;font-weight:800;margin:0 0 8px}
        .ft-hero-desc{color:#586282;font-size:15px;line-height:1.5;margin:0}
        .ft-hero-icon{width:74px;height:74px;border-radius:22px;background:#e6f3ff;color:#0866f5;display:grid;place-items:center;flex-shrink:0;margin-right:24px}
        .ft-hero-icon svg{width:42px;height:42px}
        .ft-art{position:absolute;right:7%;top:0;width:200px;height:166px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 12px 14px #0066cc26)}
        .ft-art img{display:block;width:120px;height:120px;object-fit:contain;border-radius:24px}
        .ft-bag{position:absolute;top:35px;left:33px;width:115px;height:103px;border-radius:13px 13px 21px 21px;background:linear-gradient(125deg,#ffe65d,#ffab00);border:3px solid #ffcc19;box-shadow:inset -12px -7px 0 #ff9c0a}
        .ft-bag:before{content:"";position:absolute;left:26px;top:-41px;width:52px;height:51px;border:11px solid #087bff;border-bottom:0;border-radius:32px 32px 0 0}
        .ft-bubble{position:absolute;top:60px;left:89px;width:106px;height:76px;border:7px solid #169cff;border-radius:23px;background:#fff;box-shadow:0 7px 0 #0966db;display:grid;place-items:center;font-size:25px;letter-spacing:-4px}
        .ft-bubble:after{content:"";position:absolute;bottom:-17px;left:18px;border-top:17px solid #169cff;border-right:18px solid transparent}
        .ft-progress-area{padding:21px 34px 6px}
        .ft-progress-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:11px;font-size:13px}
        .ft-progress-head strong{font-weight:750}.ft-progress-head span{color:#586d8c}
        .ft-progress-track{height:11px;border-radius:20px;background:#dceeff;overflow:hidden}
        .ft-progress-fill{height:100%;background:linear-gradient(90deg,#0064f7,#168dff);border-radius:20px;transition:width .3s}
        .ft-steps{padding:14px 34px 25px}
        .ft-step-wrap{display:flex;gap:14px;align-items:stretch}
        .ft-step-rail{width:34px;flex-shrink:0;display:flex;flex-direction:column;align-items:center}
        .ft-step-number{height:34px;width:34px;display:grid;place-items:center;border:2px solid #d2e5fa;border-radius:50%;background:#fff;color:#6d789e;font-weight:800;font-size:14px;flex-shrink:0}
        .ft-step-number.active,.ft-step-number.done{background:linear-gradient(135deg,#0064f7,#168dff);border-color:transparent;color:white;box-shadow:0 5px 10px #0066cc2b}
        .ft-rail-line{flex:1;min-height:14px;border-left:2px dashed #cfe4f8;margin:4px 0}
        .ft-step-card{flex:1;display:flex;align-items:center;gap:23px;min-width:0;padding:17px 21px;margin-bottom:12px;background:linear-gradient(100deg,#fff,#f5fbff);border:1px solid #dfeefa;border-radius:16px;box-shadow:0 3px 12px #333c7010}
        .ft-step-symbol{flex:0 0 72px;height:72px;border-radius:19px;display:grid;place-items:center;background:linear-gradient(145deg,#e4f3ff,#d8edff);color:#0866f5}
        .ft-step-wrap:nth-child(2) .ft-step-symbol{background:linear-gradient(145deg,#e6f9ff,#dcefff);color:#168bff}
        .ft-step-wrap:nth-child(3) .ft-step-symbol{background:linear-gradient(145deg,#fff9df,#fff0c6);color:#ffb522}
        .ft-step-symbol svg{width:35px;height:35px}
        .ft-step-content{flex:1;min-width:0}
        .ft-step-title{font-weight:800;font-size:16px;margin:0 0 6px}
        .ft-step-body{color:#5c6689;font-size:13px;line-height:1.5;margin:0 0 10px;max-width:690px}
        .ft-step-actions{display:flex;align-items:center;flex-wrap:wrap;gap:16px}
        .ft-step-actions .ft-primary{padding:10px 18px;font-size:13px}
        .ft-link{background:none;border:0;color:#0866f5;cursor:pointer;font-size:13px;font-weight:650;padding:8px 0}
        .ft-link:hover{text-decoration:underline}
        .ft-done{display:inline-block;color:#0866f5;font-size:12px;margin-left:9px;font-weight:700}
        .ft-mini-art{flex:0 0 170px;height:100px;position:relative;display:grid;place-items:center}
        .ft-mini-sheet{width:145px;padding:13px 12px;border-radius:15px;background:#fff;box-shadow:0 9px 25px #0066cc2b;transform:rotate(-7deg);border:1px solid #dcefff}
        .ft-mini-sheet span{display:block;font-size:12px;font-weight:750;color:#46517b;margin-bottom:8px}
        .ft-switch{float:right;width:28px;height:15px;border-radius:12px;background:#0866f5;position:relative}
        .ft-switch:after{content:"";position:absolute;right:3px;top:3px;width:9px;height:9px;border-radius:50%;background:white}
        .ft-langs{transform:rotate(5deg)}.ft-langs span{padding:2px 5px;background:#eff7ff;border-radius:5px;margin-bottom:5px}
        .ft-chart-art svg{width:150px;height:80px}
        .ft-warning{margin:0 0 16px;padding:12px 16px;background:#fff4dc;border:1px solid #f2d8a0;border-radius:12px;color:#754b00}
        @media(max-width:850px){.ft-dashboard{padding:22px 14px 40px}.ft-top{flex-wrap:wrap}.ft-hero{padding:24px}.ft-hero-copy{max-width:100%}.ft-art{opacity:.15;right:-40px}.ft-step-card{gap:14px}.ft-mini-art{display:none}.ft-steps,.ft-progress-area{padding-left:17px;padding-right:17px}}
        @media(max-width:520px){.ft-heading{font-size:31px}.ft-top-create{width:100%}.ft-store{font-size:11px}.ft-hero{align-items:flex-start}.ft-hero-icon{width:48px;height:48px;border-radius:14px;margin-right:12px}.ft-hero-icon svg{width:29px;height:29px}.ft-hero-title{font-size:22px}.ft-hero-desc{font-size:12px}.ft-step-card{padding:15px 12px;align-items:flex-start}.ft-step-symbol{flex-basis:43px;height:43px;border-radius:12px}.ft-step-symbol svg{width:25px;height:25px}.ft-step-title{font-size:14px}.ft-progress-head{font-size:11px}.ft-step-actions{gap:8px}}

        /* Brand palette: navy, Shopify-blue, pink, soft sky-blue and white */
        .ft-dashboard:before{content:"";position:absolute;inset:0;z-index:-2;background:linear-gradient(110deg,#ffffff 0%,#f4fbff 42%,#e5f5ff 100%)}
        .ft-dashboard:after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(circle at 100% 25%,#d9eeff 0,transparent 35%);opacity:.65}
        .ft-heading,.ft-hero-title,.ft-step-title{color:#0c173b}
        .ft-store strong{color:#0c173b}
        .ft-primary{background:#0866f5}
        .ft-primary:hover:not(:disabled){background:#0054d6}
        .ft-hero{background:linear-gradient(110deg,#ffffff 38%,#eaf6ff 100%)}
        .ft-hero-tag{color:#ff1875}
        .ft-progress-fill,.ft-step-number.active,.ft-step-number.done{background:#0866f5}
      `}</style>
      <main className="ft-dashboard">
        <header className="ft-top">
          <div>
            <h1 className="ft-heading">Survey <span>Dashboard</span></h1>
            <p className="ft-subtitle">{t("dashboard_subtitle")}</p>
            <div className="ft-store">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h18l-2-6H5zM5 10v10h14V10M9 20v-6h6v6"/></svg>
              <strong>{shop}</strong>
              <span>· {PLAN_LABELS[planName] ?? planName} {t("plan_label")}</span>
              <span>· {questionLimit === null ? t("unlimited_questions") : `${questionLimit} ${t("questions_per_survey_label")}`}</span>
            </div>
          </div>
          <button className="ft-primary ft-top-create" type="button"
            onClick={() => navigate(dropdownLangFree ? createPath(uiLanguage) : withLang("/app/create-survey"))}
            disabled={hasReachedLimit}>
            <span className="ft-plus">+</span>{t("create_new_survey")}
          </button>
        </header>
        {hasReachedLimit && (
          <div className="ft-warning">{t("max_survey_limit")} ({maxSurveys}/{maxSurveys}). {t("delete_to_create")}</div>
        )}
        <section className="ft-panel">
          <div className="ft-hero">
            <div className="ft-hero-icon">
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 33l-7 7 1-12C16 12 26 7 40 7c0 14-6 25-22 33z"/><circle cx="29" cy="19" r="5"/><path d="M13 36l-5 5M9 23l-5 3M25 39l-3 5"/></svg>
            </div>
            <div className="ft-hero-copy">
              <div className="ft-hero-tag">GET STARTED</div>
              <h2 className="ft-hero-title">Set up your first survey</h2>
              <p className="ft-hero-desc">{t("guide_subtitle")}</p>
            </div>
            <div className="ft-art" aria-hidden="true"><img src="/feedback-logo/CLr8lOXP15cDEAE=.webp" alt="Feedback Logo" /></div>
          </div>
          <div className="ft-progress-area">
            <div className="ft-progress-head">
              <strong>{doneCount} of {steps.length} steps completed</strong>
              <span>Complete all steps to start collecting feedback</span>
            </div>
            <div className="ft-progress-track" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={steps.length}>
              <div className="ft-progress-fill" style={{width:`${doneCount / steps.length * 100}%`}}/>
            </div>
          </div>
          <div className="ft-steps">
            {steps.map(({n,title,done,manual,body,action},i) => (
              <div className="ft-step-wrap" key={n}>
                <div className="ft-step-rail">
                  <div className={`ft-step-number ${done ? "done" : n === currentStep ? "active" : ""}`}>{done ? "✓" : i+1}</div>
                  {i !== steps.length-1 && <div className="ft-rail-line"/>}
                </div>
                <article className="ft-step-card">
                  <div className="ft-step-symbol"><StepIcon index={i}/></div>
                  <div className="ft-step-content">
                    <h3 className="ft-step-title">{title}{done && <span className="ft-done">{t("guide_done")}</span>}</h3>
                    <p className="ft-step-body">{body}</p>
                    <div className="ft-step-actions">
                      {action && <button type="button" className="ft-primary"
                        disabled={action.disabled}
                        onClick={action.url ? () => window.open(action.url,"_blank","noopener,noreferrer") : action.onAction}>
                        {action.content} <span aria-hidden="true"> ↗</span>
                      </button>}
                      {manual && <button type="button" className="ft-link" onClick={() => toggleManual(n)}>
                        {done ? t("guide_mark_not_done") : t("guide_mark_done")}
                      </button>}
                    </div>
                  </div>
                  {/* <div className="ft-mini-art" aria-hidden="true">
                    {i === 0 ? <div className="ft-mini-sheet"><span>Order status <i className="ft-switch"/></span><span>Feedback survey <i className="ft-switch"/></span></div>
                      : i === 1 ? <div className="ft-mini-sheet ft-langs"><span>🇬🇧 English</span><span>🇫🇷 French</span><span>🇪🇸 Spanish</span><span>🇩🇪 German</span><span>🇮🇹 Italian</span></div>
                      : <div className="ft-mini-sheet ft-chart-art"><svg viewBox="0 0 150 80" fill="none"><path d="M5 62L31 53L52 60L78 31L99 44L124 14L145 24" stroke="#7650f7" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 62L31 53L52 60L78 31L99 44L124 14L145 24V78H5Z" fill="#e8dcff"/>{[[5,62],[31,53],[52,60],[78,31],[99,44],[124,14],[145,24]].map(([x,y])=><circle key={x} cx={x} cy={y} r="4" fill="#fff" stroke="#7650f7" strokeWidth="2"/>)}</svg></div>}
                  </div> */}
                </article>
              </div>
            ))}
          </div>
        </section>
      </main>
    </Page>
  );
}
