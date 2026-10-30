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
import { getSurveyStatus, STATUS_BADGE, describeTarget } from "../utils/surveyStatus";

const prisma = new PrismaClient();

const QUESTION_LIMITS = { free: 1, pro: 5, advanced: Infinity };
const PLAN_LABELS = { free: "Free", pro: "Pro", advanced: "Advanced" };

const LANGUAGES = {
  default: { label: "Default (English)", flag: "", badge: "info", isoCode: "en" },
  french: { label: "French", flag: "", badge: "magic", isoCode: "fr" },
  spanish: { label: "Spanish", flag: "", badge: "warning", isoCode: "es" },
  italian: { label: "Italian", flag: "", badge: "success", isoCode: "it" },
  german: { label: "German", flag: "", badge: "info", isoCode: "de" },
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

  const MAX_SURVEYS = 10;
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
  const uiLangIso = LANG_KEY_TO_ISO[uiLanguage] ?? "en";
  const t = getT(uiLangIso);

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

  const limitLabel = questionLimit === null ? "∞" : questionLimit;
  const hasReachedLimit = surveys.length >= maxSurveys;

  // Delete state
  const [isDeleteBannerVisible, setDeleteBannerVisible] = useState(false);
  const [surveyToDelete, setSurveyToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // View modal
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleToggleSurvey = async (survey) => {
    try {
      const res = await fetch("/api/toggle-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surveyId: survey.id, isActive: survey.isActive === false }),
      });
      if (!res.ok) throw new Error("toggle failed");
      navigate(withLang("/app/analytics"), { replace: true });
    } catch (e) { console.error(e); alert("Could not change the survey status."); }
  };

  const handleViewSurvey = (s) => { setActiveSurvey(s); setModalOpen(true); };
  const handleCloseModal = () => { setModalOpen(false); setTimeout(() => setActiveSurvey(null), 300); };
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
        <Badge tone={STATUS_BADGE[getSurveyStatus(survey)].tone}>{STATUS_BADGE[getSurveyStatus(survey)].label}</Badge>
        <Text variant="bodySm" tone="subdued">·</Text>
        <Text variant="bodySm" tone="subdued">{({ storefront: "Storefront", both: "Thank-you + storefront" })[survey.placement] ?? "Thank-you page"} · {describeTarget(survey)}</Text>
      </InlineStack>
    </BlockStack>,
    <InlineStack key={`a-${survey.id}`} gap="200">
      <Button onClick={() => handleToggleSurvey(survey)} size="slim">{survey.isActive === false ? "Turn on" : "Turn off"}</Button>
      <Button onClick={() => handleViewSurvey(survey)} size="slim" variant="tertiary">{t("view_survey")}</Button>
      <Button onClick={() => navigate(withLang(`/app/create-survey?edit=${survey.id}`))} size="slim">{t("edit_survey")}</Button>
      <Button onClick={() => handleDeleteSurvey(survey.id)} size="slim" tone="critical">{t("delete_survey")}</Button>
    </InlineStack>,
  ]);

  return (
    <>
      <style>{`
      .feedback-hero-art img {
    width: 244px;
    height: 201px;
    object-fit: contain;
}
    .feedback-stat-icon svg {
    width: 40px;
}
    .feedback-rocket svg {
    width: 60px;
    height: 60px;
}
        .feedback-dashboard{font-family:Inter,system-ui,sans-serif;color:#0c173b;background:linear-gradient(135deg,#eaf6ff,#f5fbff 62%,#e8f5ff);min-height:100vh;padding:32px 28px 55px}
        .feedback-inner{max-width:1200px;margin:auto}.feedback-top{min-height:220px;position:relative;display:flex;justify-content:space-between;gap:20px;overflow:hidden;padding:35px 32px 28px;background:radial-gradient(circle at 87% 0%,#c7e6ff,transparent 38%),linear-gradient(125deg,#e6f4ff,#f2faff);border-radius:24px 24px 0 0}
        .feedback-top:before{content:'';position:absolute;width:380px;height:380px;border:42px solid #b6dcff70;border-radius:45%;transform:rotate(36deg);top:-290px;left:-140px}
        .feedback-top h1{position:relative;font-size:clamp(29px,3vw,43px);font-weight:850;letter-spacing:-1.4px;line-height:1.1;margin:0 0 10px}.feedback-top h1 span{color:#0866f5}.feedback-top p{font-size:15px;color:#42577e;margin:0 0 15px}.feedback-store{display:inline-flex;flex-wrap:wrap;gap:5px;align-items:center;border:1px solid #d1e4fb;background:#ffffffa8;padding:10px 14px;border-radius:12px;color:#40547e;font-size:12px}.feedback-store strong{color:#0c173b}
        .feedback-primary{background:#0866f5;color:white;border:0;border-radius:12px;padding:13px 19px;font-weight:700;cursor:pointer;box-shadow:0 6px 14px #0866f525;font-size:13px}.feedback-primary:hover:not(:disabled){background:#0054d8}.feedback-primary:disabled{opacity:.45;cursor:not-allowed}.feedback-outline{border:1px solid #d1e1f7;border-radius:12px;background:white;color:#0866f5;padding:11px 16px;font-weight:700;cursor:pointer}
        .feedback-top-button{align-self:flex-start;position:relative;z-.feedback-hero-art:3;white-space:nowrap}.feedback-hero-art{position:absolute;right:230px;top:15px;}.feedback-browser{position:absolute;left:35px;top:10px;width:235px;height:155px;border:5px solid #1684ff;border-radius:18px;background:white;box-shadow:0 13px 24px #0056bb30;overflow:hidden}.feedback-browser-head{background:#0866f5;height:30px;color:white;padding:5px 12px;letter-spacing:3px}.feedback-browser-copy{text-align:center;font-size:13px;font-weight:800;padding-top:26px}.feedback-stars{position:absolute;bottom:4px;right:0;background:white;border:3px solid #c7dfff;border-radius:17px;padding:13px 17px;font-size:24px;box-shadow:0 9px 16px #0866f52b}.feedback-pink{position:absolute;top:0;right:-16px;background:#ff1875;color:white;padding:12px;border-radius:12px;font-size:12px;font-weight:800;box-shadow:0 7px 15px #ff187542}
        .feedback-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:-10px 0 22px;position:relative;z-index:2}.feedback-stat{background:white;border:1px solid #e7eef8;border-radius:17px;padding:22px;display:flex;gap:17px;min-height:155px;box-shadow:0 8px 24px #2b6caf0b}.feedback-stat-icon{width:58px;height:58px;display:grid;place-items:center;border-radius:50%;background:#e5f3ff;color:#0866f5;font-size:27px;flex-shrink:0}.feedback-stat:nth-child(2) .feedback-stat-icon{background:#ffe4f2;color:#ff1875}.feedback-stat:nth-child(3) .feedback-stat-icon{background:#e0f9f2;color:#02b98d}.feedback-stat-main{flex:1;min-width:0}.feedback-stat-label{font-size:13px;color:#415783;font-weight:600}.feedback-stat-number{font-size:34px;line-height:1.5;font-weight:800;color:#0c173b}.feedback-stat-number small{font-size:16px;color:#546b9d}.feedback-stat-note{font-size:12px;color:#5a709a;margin-top:8px}.feedback-track{height:10px;background:#d8e7ff;border-radius:20px;overflow:hidden}.feedback-fill{height:100%;background:#0866f5;border-radius:20px}
        .feedback-panel{background:#fff;border:1px solid #e5eef9;border-radius:18px;padding:27px 28px;box-shadow:0 10px 30px #2869a60a}.feedback-panel-head{display:flex;justify-content:space-between;align-items:center;gap:14px;border-bottom:1px solid #e5edf8;padding-bottom:17px}.feedback-panel-head h2{font-size:23px;margin:0 0 5px;font-weight:800}.feedback-panel-head p{font-size:13px;color:#58709b;margin:0}.feedback-empty{text-align:center;padding:48px 10px 25px}.feedback-empty-graphic{width:125px;height:130px;margin:auto auto 16px;position:relative;display:grid;place-items:center;background:radial-gradient(circle,#e5efff 60%,transparent 61%)}.feedback-paper{width:77px;height:99px;background:#fff;border:1px solid #d8e2f2;box-shadow:6px 7px 0 #e8edf7,0 7px 17px #12367a16;padding:15px}.feedback-paper:before{content:'';display:block;background:#ffbc56;width:22px;height:22px;margin-bottom:12px}.feedback-paper i{display:block;height:4px;background:#e2e8f2;margin:7px 0;border-radius:4px}.feedback-empty h3{font-size:17px;margin:0 0 7px}.feedback-empty p{color:#58709b;margin:0 0 17px;font-size:13px}.feedback-features{display:flex;align-items:center;gap:18px;margin-top:22px;border:1px dashed #a9d8ff;background:#f2f9ff;padding:20px 22px;border-radius:15px}.feedback-feature-intro{flex:2;display:flex;gap:16px;align-items:center}.feedback-feature-intro .feedback-rocket{font-size:40px}.feedback-feature-intro strong{display:block;font-size:15px}.feedback-feature-intro p{color:#5c7199;font-size:12px;line-height:1.5;margin:5px 0 0}.feedback-feature{flex:1;display:flex;align-items:center;gap:10px;border-left:1px solid #dbe9f8;padding-left:15px}.feedback-feature b{display:block;font-size:12px}.feedback-feature small{color:#5c7199;font-size:11px}.feedback-feature-icon{width:42px;height:42px;border-radius:50%;background:#e0f1ff;display:grid;place-items:center;font-size:21px;flex-shrink:0}
        .feedback-breakdown{margin-bottom:20px}.feedback-breakdown-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:18px}.feedback-breakdown-item{border:1px solid #e3eafa;border-radius:12px;padding:15px}.feedback-table{margin-top:18px;overflow-x:auto}
        @media(max-width:1100px){.feedback-hero-art{right:170px;transform:scale(.8) rotate(-5deg);transform-origin:top right}.feedback-features{flex-wrap:wrap}.feedback-feature-intro{flex-basis:100%}.feedback-feature{border-left:0;padding-left:0}}
        @media(max-width:750px){.feedback-dashboard{padding:14px}.feedback-top{padding:24px 18px;min-height:255px}.feedback-top-button{font-size:11px;padding:10px}.feedback-hero-art{top:125px;right:15px;transform:scale(.55) rotate(-5deg)}.feedback-stats{grid-template-columns:1fr;margin:15px 0}.feedback-stat{min-height:120px}.feedback-panel{padding:18px}.feedback-breakdown-grid{grid-template-columns:repeat(2,1fr)}.feedback-features{align-items:flex-start}.feedback-feature{flex-basis:45%}}
        @media(max-width:460px){.feedback-top{display:block;min-height:310px}.feedback-top-button{margin-top:14px}.feedback-hero-art{top:185px;right:0;transform:scale(.45)}.feedback-panel-head{align-items:flex-start;flex-wrap:wrap}.feedback-feature{flex-basis:100%}}
      `}</style>
      <div className="feedback-dashboard"><div className="feedback-inner">
        <header className="feedback-top">
          <div style={{ position: 'relative', zIndex: 2 }}>
            <h1>Survey <span>Analytics</span><span style={{ color: '#ff1875', fontSize: 24 }}> ✦</span></h1>
            <p>{t("dashboard_subtitle")}</p>
            <div className="feedback-store">▣ <strong>{shop}</strong> · {PLAN_LABELS[planName]} {t("plan_label")} · {questionLimit === null ? t("unlimited_questions") : `${questionLimit} ${t("questions_per_survey_label")}`}</div>
          </div>
          <div className="feedback-hero-art" aria-hidden="true">
            <img src="/feedback-logo/kogo-2.png" alt="Feedback Logo" />

          </div>
          <button type="button" className="feedback-primary feedback-top-button" onClick={() => navigate(dropdownLangFree ? createPath(uiLanguage) : withLang("/app/create-survey"))} disabled={hasReachedLimit}>✚ &nbsp;{t("create_new_survey")}</button>
        </header>
        {hasReachedLimit && <div style={{ margin: '15px 0' }}><Banner tone="warning">{t("max_survey_limit")} ({maxSurveys}/{maxSurveys}). {t("delete_to_create")}</Banner></div>}
        <section className="feedback-stats">
          <div className="feedback-stat"><div className="feedback-stat-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="40" height="40"><g fill="#1677F8"><rect x="9" y="8" width="30" height="34" rx="5"/><rect x="16" y="3" width="16" height="12" rx="4"/><rect x="19" y="1" width="10" height="5" rx="2.5"/></g><g fill="none" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round"><path d="M15 21h3m5 0h10"/><path d="M15 29h3m5 0h10"/><path d="M15 36h3m5 0h7"/></g></svg></div><div className="feedback-stat-main"><div className="feedback-stat-label">{t("total_surveys")}</div><div className="feedback-stat-number">{surveys.length} <small>/ {maxSurveys}</small></div><div className="feedback-track"><div className="feedback-fill" style={{ width: `${surveys.length / maxSurveys * 100}%` }} /></div><div className="feedback-stat-note">Create surveys to start collecting feedback</div></div></div>
          <div className="feedback-stat"><div className="feedback-stat-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="6" y="3" width="20" height="26" rx="3" fill="#F51AA8"/><rect x="11" y="7" width="10" height="2" rx="1" fill="#fff"/><g fill="#fff"><rect x="10" y="12" width="3" height="3" rx=".6"/><rect x="15" y="12.5" width="8" height="2" rx="1"/><rect x="10" y="18" width="3" height="3" rx=".6"/><rect x="15" y="18.5" width="8" height="2" rx="1"/><rect x="10" y="24" width="3" height="2" rx=".6"/><rect x="15" y="24" width="6" height="2" rx="1"/></g></svg></div><div className="feedback-stat-main"><div className="feedback-stat-label">{t("total_questions")}</div><div className="feedback-stat-number">{totalQuestions}</div><div className="feedback-stat-note">{surveys.length ? `≈ ${Math.round(totalQuestions / surveys.length)} / ${t("questions_per_survey").toLowerCase()}` : '—'}</div></div></div>
          <div className="feedback-stat"><div className="feedback-stat-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><g fill="#12C9A0"><rect x="5" y="27" width="11" height="16" rx="5.5"/><rect x="19" y="17" width="11" height="26" rx="5.5"/><rect x="33" y="5" width="11" height="38" rx="5.5"/></g></svg></div><div className="feedback-stat-main"><div className="feedback-stat-label">{t("questions_per_survey")}</div><div className="feedback-stat-number">{limitLabel}</div><button type="button" className="feedback-primary" style={{ width: '100%' }} onClick={() => navigate(withLang('/app/billing'))}>{planName === 'advanced' ? t('max_plan') : `♛  ${t('upgrade_for_more')}`}</button></div></div>
        </section>
        {totalQuestions > 0 && <section className="feedback-panel feedback-breakdown"><h2>{t("question_types_breakdown")}</h2><div className="feedback-breakdown-grid">{[{ label: t('single_choice'), count: singleCount, color: '#0866f5' }, { label: t('multi_choice'), count: multiCount, color: '#02b98d' }, { label: t('conditional'), count: condCount, color: '#ffbc56' }, { label: t('text_box'), count: textCount, color: '#ff1875' }].map(({ label, count, color }) => <div className="feedback-breakdown-item" key={label}><div>{label}</div><div className="feedback-stat-number" style={{ fontSize: 25 }}>{count} <small>{pct(count)}%</small></div><div className="feedback-track"><div className="feedback-fill" style={{ width: `${pct(count)}%`, background: color }} /></div></div>)}</div></section>}
        <section className="feedback-panel">
          <div className="feedback-panel-head"><div><h2>{t("your_surveys")}</h2><p>{PLAN_LABELS[planName]}: {limitLabel} {t("questions_per_survey_label")}</p></div><button type="button" className="feedback-outline" onClick={() => navigate(withLang('/app/create-survey'))} disabled={hasReachedLimit}>✚ &nbsp;{t('create_new_survey')}</button></div>
          {surveys.length > 0 ? <div className="feedback-table"><DataTable columnContentTypes={["numeric", "text", "text"]} headings={["#", t('survey_details'), t('actions_label')]} rows={surveyRows} hoverable /></div> : <div className="feedback-empty"><div className="feedback-empty-graphic"><div className="feedback-paper"><i /><i /><i /><i /></div></div><h3>{t('no_surveys_yet')}</h3><p>{t('no_surveys_desc')}</p><button type="button" className="feedback-primary" onClick={() => navigate(withLang('/app/create-survey'))} disabled={hasReachedLimit}>✚ &nbsp;{t('create_new_survey')}</button></div>}
          <div className="feedback-features"><div className="feedback-feature-intro"><div className="feedback-rocket"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="blue" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#087BFF"/><stop offset="55%" stop-color="#078BFF"/><stop offset="100%" stop-color="#2448F5"/></linearGradient><linearGradient id="pink" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FF40C8"/><stop offset="100%" stop-color="#F0009A"/></linearGradient></defs><g transform="rotate(42 64 64)"><path d="M43 76 Q20 69 17 91 Q29 90 43 103 L53 87Z" fill="url(#pink)"/><path d="M75 76 Q99 69 102 91 Q90 90 77 103 L65 87Z" fill="url(#pink)"/><path d="M54 87 Q64 104 64 118 Q77 106 74 88Z" fill="#20CFF5"/><path d="M64 8 C47 22 38 43 38 68 L38 83 Q64 99 90 83 L90 68 C90 43 81 22 64 8Z" fill="url(#blue)"/><path d="M64 10 C79 29 83 47 83 69 L83 85 Q72 91 64 92Z" fill="#0754E8" opacity=".65"/><circle cx="64" cy="46" r="11" fill="#DDF8FF"/><circle cx="64" cy="46" r="7.5" fill="#FFFFFF"/><path d="M47 72 L58 84" stroke="#C8F3FF" stroke-width="5" stroke-linecap="round"/></g></svg></div><div><strong>Get started in minutes</strong><p>Create a survey, customize your thank you page and start collecting valuable customer feedback.</p></div></div><div className="feedback-feature"><span className="feedback-feature-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="35" height="35"><path d="M27.2 3.8 10.5 25.1Q9 27 11.7 27h9.1l-2.2 17.1q-.3 2.1 1.2.2l17.7-22.1Q39 20 36.2 20h-9.1l2-15.1q.4-2.6-1.9-1.1Z" fill="#1677F8" stroke="#1677F8" stroke-width=".6" stroke-linejoin="round"/></svg></span><div><b>Easy Setup</b><small>Get started quickly</small></div></div><div className="feedback-feature"><span className="feedback-feature-icon" style={{ background: '#ffe5f1' }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><g fill="#FF0A91"><circle cx="10.5" cy="15" r="5"/><circle cx="37.5" cy="15" r="5"/><path d="M2.5 31.5v-3.2a8 8 0 0 1 12.2-6.8 11 11 0 0 0-3.2 7.7v7.3H5.5a3 3 0 0 1-3-3z"/><path d="M45.5 31.5v-3.2a8 8 0 0 0-12.2-6.8 11 11 0 0 1 3.2 7.7v7.3h6a3 3 0 0 0 3-3z"/><circle cx="24" cy="11" r="6.5"/><path d="M11.5 38v-8.5a12.5 12.5 0 0 1 25 0V38a3 3 0 0 1-3 3h-19a3 3 0 0 1-3-3z"/></g></svg></span><div><b>{maxSurveys} Surveys</b><small>Up to {maxSurveys} surveys per store</small></div></div><div className="feedback-feature"><span className="feedback-feature-icon" style={{ background: '#e1f9f2' }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" width="35" height="40"><defs><linearGradient id="infinityGreen" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#00A987"/><stop offset="52%" stop-color="#19D6A0"/><stop offset="100%" stop-color="#00BC91"/></linearGradient></defs><path d="M32 20 C25 12 19 5 12.5 5 C4.5 5 1.5 12 1.5 20 S5 35 12.5 35 C20 35 26 27 32 20 C38 13 44 5 51.5 5 C59 5 62.5 12 62.5 20 S59 35 51.5 35 C44 35 38 27 32 20Z" fill="none" stroke="url(#infinityGreen)" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div><b>{questionLimit === null ? "Unlimited Questions" : `${questionLimit} Questions / Survey`}</b><small>{questionLimit === null ? "No question limits" : "Current plan limit"}</small></div></div></div>
        </section>
      </div></div>
      <Page>
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
                          {question.isConditional && <Badge tone="warning">{t("conditional")}</Badge>}
                          {question.isMultiChoice && <Badge tone="success">{t("multi_choice")}</Badge>}
                          {question.isTextBox && <Badge tone="info">{t("text_box")}</Badge>}
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
