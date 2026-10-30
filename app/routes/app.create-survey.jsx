// app/routes/app.create-survey.jsx

import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData, useNavigate, useNavigation, useSearchParams } from "@remix-run/react";
import { PrismaClient } from "@prisma/client";
import { useState, useCallback } from "react";
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Button,
  BlockStack,
  Text,
  Box,
  InlineStack,
  InlineGrid,
  Modal,
  Banner,
  Badge,
  Tooltip,
  Divider,
  
  Spinner,
  Select,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getShopPlanFromDB } from "../utils/planUtils";
import { getT, LANG_KEY_TO_ISO } from "../utils/translations";
import { useAppBridge } from "@shopify/app-bridge-react";
import { SURVEY_TEMPLATES } from "../utils/surveyTemplates";
import { TARGET_TYPES } from "../utils/surveyStatus";

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

const CONDITIONAL_LABELS = {
  default: { yes: "Yes", no: "No"   },
  french:  { yes: "Oui", no: "Non"  },
  spanish: { yes: "Sí",  no: "No"   },
  italian: { yes: "Sì",  no: "No"   },
  german:  { yes: "Ja",  no: "Nein" },
};

const QUESTION_TYPES = {
  single:      { label: "Single Choice", emoji: "", badge: "attention" },
  multiChoice: { label: "Multi Choice",  emoji: "",  badge: "success"   },
  conditional: { label: "Conditional",   emoji: "", badge: "warning"   },
  textBox:     { label: "Text Box",      emoji: "", badge: "info"      },
};

const MAX_SURVEYS = 10;

const PLACEMENT_OPTIONS = [
  { label: "Thank-you page (after checkout)", value: "thankyou" },
  { label: "Storefront pages (home, product, collection, cart...)", value: "storefront" },
  { label: "Both", value: "both" },
];

const PAGE_OPTIONS = [
  { value: "all", label: "All pages" },
  { value: "home", label: "Home page" },
  { value: "product", label: "Product pages" },
  { value: "collection", label: "Collection pages" },
  { value: "cart", label: "Cart page" },
  { value: "page", label: "Other pages" },
  { value: "blog", label: "Blog and articles" },
];

const STOREFRONT_TARGET_TYPES = [
  { value: "all",        label: "Every visitor" },
  { value: "product",    label: "Visitors on specific product pages" },
  { value: "collection", label: "Visitors on specific collection pages" },
  { value: "country",    label: "Visitors from specific countries" },
  { value: "min_total",  label: "Visitors with a cart above a minimum amount" },
];

const DEFAULT_DESIGN = {
  accent: "#4f46e5", background: "#ffffff", text: "#1b1b3a", radius: 12, font: "inherit",
  layout: "card", position: "bottom-right", trigger: "delay", triggerValue: 5, frequency: "week",
};

const parseJsonSafe = (text, fallback) => {
  try { const v = text ? JSON.parse(text) : fallback; return v ?? fallback; } catch (_) { return fallback; }
};

// Keep only known design settings, with safe values
const sanitizeDesign = (raw) => {
  const d = raw && typeof raw === "object" ? raw : {};
  const color = (v, fallback) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback);
  const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
  const num = (v, min, max, fallback) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
  return {
    accent: color(d.accent, DEFAULT_DESIGN.accent),
    background: color(d.background, DEFAULT_DESIGN.background),
    text: color(d.text, DEFAULT_DESIGN.text),
    radius: num(d.radius, 0, 32, DEFAULT_DESIGN.radius),
    font: pick(d.font, ["inherit", "serif", "system", "mono"], "inherit"),
    layout: pick(d.layout, ["card", "flat"], "card"),
    position: pick(d.position, ["bottom-right", "bottom-left", "center"], "bottom-right"),
    trigger: pick(d.trigger, ["immediate", "delay", "scroll", "exit"], "delay"),
    triggerValue: num(d.triggerValue, 0, 600, 5),
    frequency: pick(d.frequency, ["always", "session", "week"], "week"),
  };
};

const parseRules = (text) => {
  try { const v = text ? JSON.parse(text) : []; return Array.isArray(v) ? v : []; } catch (_) { return []; }
};

const kindOf = (q) =>
  q.questionType === "rating" ? "rating"
  : q.questionType === "nps" ? "nps"
  : q.isConditional ? "conditional"
  : q.isTextBox ? "text"
  : q.isMultiChoice ? "multi"
  : "single";

const KIND_OPTIONS = [
  { label: "Single choice", value: "single" },
  { label: "Multiple choice", value: "multi" },
  { label: "Yes / No (conditional)", value: "conditional" },
  { label: "Text box", value: "text" },
  { label: "Star rating (1-5)", value: "rating" },
  { label: "NPS score (0-10)", value: "nps" },
];

const toDateInput = (v) => {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const getLang = (survey) =>
  survey.language ?? (survey.isFrenchVersion ? "french" : "default");

// ─── LOADER ───────────────────────────────────────────────────
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url    = new URL(request.url);
  const editId = url.searchParams.get("edit");

  const shopPlan = await getShopPlanFromDB(shop);
  const planName = shopPlan.name ?? "free";
  const rawLimit = QUESTION_LIMITS[planName] ?? 1;

  const surveys = await prisma.survey.findMany({
    where: { shop },
    include: { questions: { include: { answers: true } } },
  });

  const hasReachedLimit = surveys.length >= MAX_SURVEYS;
  const usedLanguages   = surveys.map((s) => getLang(s));

  let editSurvey = null;
  if (editId) editSurvey = surveys.find((s) => s.id === parseInt(editId)) || null;

  if (hasReachedLimit && !editSurvey) return redirect("/app/");

  return json({
    surveys, hasReachedLimit, usedLanguages, shop, planName,
    questionLimit: rawLimit === Infinity ? null : rawLimit,
    maxSurveys: MAX_SURVEYS, editSurvey,
  });
};

// ─── ACTION ───────────────────────────────────────────────────
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData    = await request.formData();
  const surveyTitle = formData.get("quizTitle");
  const questions   = JSON.parse(formData.get("questions"));
  const surveyIdVal = formData.get("surveyId");
  const surveyId    = surveyIdVal && surveyIdVal !== "" ? parseInt(surveyIdVal) : null;
  const language    = formData.get("language") || "default";
  const returnLang  = formData.get("returnLang") || "default";

  const isActive    = formData.get("isActive") !== "false";
  const startsAtRaw = formData.get("startsAt") || "";
  const endsAtRaw   = formData.get("endsAt") || "";
  const startsAt    = startsAtRaw ? new Date(`${startsAtRaw}T00:00:00`) : null;
  const endsAt      = endsAtRaw ? new Date(`${endsAtRaw}T23:59:59`) : null;
  const rawTarget   = formData.get("targetType");
  const targetType  = ["all", "product", "collection", "country", "min_total"].includes(rawTarget) ? rawTarget : "all";
  const targetValue = targetType === "all" ? null : (formData.get("targetValue") || null);
  const placement   = ["thankyou", "storefront", "both"].includes(formData.get("placement")) ? formData.get("placement") : "thankyou";
  const pagesRaw    = parseJsonSafe(formData.get("pageTargets"), ["all"]);
  const validPages  = ["all", "home", "product", "collection", "cart", "page", "blog"];
  const pageList    = (Array.isArray(pagesRaw) ? pagesRaw : []).filter((p) => validPages.includes(p));
  const pageTargets = JSON.stringify(pageList.length > 0 ? pageList : ["all"]);
  const design      = JSON.stringify(sanitizeDesign(parseJsonSafe(formData.get("design"), {})));
  const surveyExtras = { isActive, startsAt, endsAt, targetType, targetValue, placement, pageTargets, design };

  const isFrenchVersion = language === "french";
  const condLabels = CONDITIONAL_LABELS[language] ?? CONDITIONAL_LABELS.default;

  const shopPlan      = await getShopPlanFromDB(shop);
  const planName      = shopPlan.name ?? "free";
  const questionLimit = QUESTION_LIMITS[planName] ?? 1;

  if (questionLimit !== Infinity && questions.length > questionLimit)
    return json({ error: `Your ${PLAN_LABELS[planName]} plan allows only ${questionLimit} question(s). You have ${questions.length}. Please upgrade.`, limitReached: true }, { status: 403 });

  if (!surveyTitle || surveyTitle.trim() === "")
    return json({ error: "Survey title is required." }, { status: 400 });

  if (!questions || questions.length === 0)
    return json({ error: "Survey must have at least one question." }, { status: 400 });

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.text || q.text.trim() === "")
      return json({ error: `Question ${i + 1} must have text.` }, { status: 400 });
    if (q.questionType !== "rating" && q.questionType !== "nps" && (q.isMultiChoice || (!q.isTextBox && !q.isConditional))) {
      if (!q.options || q.options.length === 0)
        return json({ error: `Question ${i + 1} must have at least one option.` }, { status: 400 });
      for (let j = 0; j < q.options.length; j++) {
        if (!q.options[j].text || q.options[j].text.trim() === "")
          return json({ error: `Question ${i + 1}, Option ${j + 1} must have text.` }, { status: 400 });
      }
    }
  }

  if (startsAt && endsAt && endsAt < startsAt)
    return json({ error: "The end date must be after the start date." }, { status: 400 });

  try {
    if (!surveyId) {
      const surveyCount = await prisma.survey.count({ where: { shop } });
      if (surveyCount >= MAX_SURVEYS)
        return json({ error: `Maximum survey limit reached (max ${MAX_SURVEYS}).` }, { status: 400 });
    }

    const questionData = questions.map((q, qi) => {
      const isRating = q.questionType === "rating";
      const isNps    = q.questionType === "nps";
      const special  = isRating || isNps;

      // Skip rules: only forward jumps ("end" or a later question) are kept
      const rules = (Array.isArray(q.branchRules) ? q.branchRules : [])
        .filter((r) => ["eq", "lte", "gte"].includes(r.op) && String(r.value ?? "") !== ""
          && (r.goTo === "end" || (Number.isInteger(Number(r.goTo)) && Number(r.goTo) > qi + 1 && Number(r.goTo) <= questions.length)))
        .map((r) => ({ op: r.op, value: String(r.value), goTo: r.goTo === "end" ? "end" : Number(r.goTo) }));

      const answers = isRating ? [1, 2, 3, 4, 5].map((n) => ({ text: String(n), haveTextBox: false }))
        : isNps ? Array.from({ length: 11 }, (_, n) => ({ text: String(n), haveTextBox: false }))
        : q.isConditional ? [{ text: condLabels.yes, haveTextBox: false }, { text: condLabels.no, haveTextBox: false }]
        : q.isTextBox ? []
        : q.options.map((o) => ({ text: o.text, haveTextBox: o.haveTextBox || false }));

      return {
        text:            q.text,
        isMultiChoice:   special ? false : q.isConditional ? false : q.isTextBox ? false : q.isMultiChoice || false,
        isConditional:   special ? false : q.isConditional ? (q.isMultiChoice ? false : q.isTextBox ? false : true) : false,
        isTextBox:       special ? false : q.isConditional ? false : q.isMultiChoice ? false : q.isTextBox || false,
        isSingle:        !special && !q.isConditional && !q.isTextBox && !q.isMultiChoice,
        questionType:    special ? q.questionType : null,
        branchRules:     rules.length > 0 && !q.isMultiChoice && !q.isTextBox ? JSON.stringify(rules) : null,
        conditionAnswer: null,
        answers: { create: answers },
      };
    });

    if (surveyId) {
      const existing = await prisma.survey.findFirst({ where: { id: surveyId, shop } });
      if (!existing) return json({ error: "Survey not found or access denied." }, { status: 403 });
      await prisma.answer.deleteMany({ where: { question: { surveyId } } });
      await prisma.question.deleteMany({ where: { surveyId } });
      await prisma.survey.update({ where: { id: surveyId }, data: { title: surveyTitle, shop, language, isFrenchVersion, ...surveyExtras, questions: { create: questionData } } });
    } else {
      await prisma.survey.create({ data: { title: surveyTitle, shop, language, isFrenchVersion, ...surveyExtras, questions: { create: questionData } } });
    }

    // Redirect back preserving the UI language
    const redirectUrl = returnLang && returnLang !== "default" ? `/app/?lang=${returnLang}` : "/app/";
    return redirect(redirectUrl);
  } catch (error) {
    console.error("Error saving survey:", error);
    if (error.code === "P2002") return json({ error: "You already have a survey with this title. Please choose a different title." }, { status: 400 });
    return json({ error: "Failed to save survey." }, { status: 500 });
  }
};

// ─── COMPONENT ────────────────────────────────────────────────
export default function CreateSurvey() {
  const {
    surveys, hasReachedLimit, usedLanguages,
    shop, planName, questionLimit, maxSurveys, editSurvey,
  } = useLoaderData();
  const actionData = useActionData();
  const navigate   = useNavigate();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();

  const isEditing = !!editSurvey;

  // ── Read UI language from URL param ────────────────────────
  const uiLanguage = "default";
  const uiLangIso  = LANG_KEY_TO_ISO[uiLanguage] ?? "en";
  const t          = getT(uiLangIso);

  const withLang = useCallback(
    (path) => {
      const sep = path.includes("?") ? "&" : "?";
      return uiLanguage === "default" ? path : `${path}${sep}lang=${uiLanguage}`;
    },
    [uiLanguage],
  );

  const handleUiLanguageChange = useCallback(
    (value) => {
      setSearchParams((prev) => {
        if (value === "default") prev.delete("lang");
        else prev.set("lang", value);
        return prev;
      });
    },
    [setSearchParams],
  );

  // ── Survey language (for the survey content itself) ────────
  const requestedSurveyLang = searchParams.get("surveyLang");
  const initialSurveyLang = isEditing ? getLang(editSurvey) : (() => {
    return "default";
  })();

  const [surveyLanguage, setSurveyLanguage] = useState(initialSurveyLang);
  const condLabels = CONDITIONAL_LABELS[surveyLanguage] ?? CONDITIONAL_LABELS.default;

  const [surveyTitle, setSurveyTitle] = useState(isEditing ? editSurvey.title : "");
  const [questions, setQuestions]     = useState(() => {
    if (!isEditing) return [];
    return editSurvey.questions.map((q) => ({
      text: q.text,
      isConditional: q.isConditional || false,
      isMultiChoice: q.isMultiChoice || false,
      isTextBox:     q.isTextBox     || false,
      isSingle:      !q.isConditional && !q.isMultiChoice && !q.isTextBox && !q.questionType,
      questionType:  q.questionType || null,
      branchRules:   parseRules(q.branchRules),
      options: (q.isTextBox || q.questionType) ? [{ text: "" }] : q.answers.map((a) => ({ text: a.text, haveTextBox: a.haveTextBox || false })),
    }));
  });

  const shopifyBridge = useAppBridge();
  const initialTargetValue = (() => { try { return editSurvey?.targetValue ? JSON.parse(editSurvey.targetValue) : null; } catch (_) { return null; } })();
  const [isActive, setIsActive]           = useState(editSurvey ? editSurvey.isActive !== false : true);
  const [startsAt, setStartsAt]           = useState(toDateInput(editSurvey?.startsAt));
  const [endsAt, setEndsAt]               = useState(toDateInput(editSurvey?.endsAt));
  const [placement, setPlacement]       = useState(editSurvey?.placement || "thankyou");
  const [pageTargets, setPageTargets]     = useState(parseJsonSafe(editSurvey?.pageTargets, ["all"]));
  const [design, setDesign]               = useState(sanitizeDesign(parseJsonSafe(editSurvey?.design, DEFAULT_DESIGN)));
  const updateDesign = (patch) => setDesign((prev) => ({ ...prev, ...patch }));
  const showsOnStorefront = placement === "storefront" || placement === "both";
  const togglePage = (value) => setPageTargets((prev) => {
    if (value === "all") return ["all"];
    const without = prev.filter((p) => p !== "all" && p !== value);
    const next = prev.includes(value) ? without : [...without, value];
    return next.length > 0 ? next : ["all"];
  });
  const [targetType, setTargetType]       = useState(editSurvey?.targetType || "all");
  const [targetItems, setTargetItems]     = useState(Array.isArray(initialTargetValue) && ["product", "collection"].includes(editSurvey?.targetType) ? initialTargetValue : []);
  const [countriesText, setCountriesText] = useState(editSurvey?.targetType === "country" && Array.isArray(initialTargetValue) ? initialTargetValue.join(", ") : "");
  const [minTotal, setMinTotal]           = useState(editSurvey?.targetType === "min_total" && initialTargetValue ? String(initialTargetValue.amount ?? "") : "");

  const targetValueJson =
    targetType === "product" || targetType === "collection" ? JSON.stringify(targetItems)
    : targetType === "country" ? JSON.stringify(countriesText.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean))
    : targetType === "min_total" ? JSON.stringify({ amount: Number(minTotal) || 0 })
    : "";

  const [validationError, setValidationError]         = useState("");
  const [showValidationModal, setShowValidationModal] = useState(false);

  // AI states
  const [aiSuggestModalOpen, setAiSuggestModalOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions]           = useState([]);
  const [aiLoading, setAiLoading]                   = useState(false);
  const [aiError, setAiError]                       = useState("");
  const [selectedSuggestions, setSelectedSuggestions] = useState([]);
  const [aiStoreName, setAiStoreName]               = useState("");
  const [aiPlanName, setAiPlanName]                 = useState("free");
  const [aiLanguageLabel, setAiLanguageLabel]       = useState("English");
  const [aiLanguageFlag, setAiLanguageFlag]         = useState("");

  const isSubmitting     = navigation.state === "submitting" || navigation.state === "loading";
  const limitLabel       = questionLimit === null ? "∞" : questionLimit;
  const hasReachedQLimit = questionLimit !== null && questions.length >= questionLimit;

  const clearValidation = () => { setValidationError(""); setShowValidationModal(false); };

  const handleInputChange = (index, field, value) => {
    const updated = [...questions];
    updated[index][field] = value;
    const q = updated[index];
    updated[index].isSingle = !q.isConditional && !q.isTextBox && !q.isMultiChoice;
    setQuestions(updated); clearValidation();
  };

  const handleAddQuestion    = () => { if (hasReachedQLimit) return; setQuestions([...questions, { text: "", options: [{ text: "" }], isSingle: true, questionType: null, branchRules: [] }]); };
  // Removing a question also fixes skip rules that point at (or past) it
  const handleRemoveQuestion = (i) => {
    const removedNumber = i + 1;
    setQuestions(
      questions
        .filter((_, idx) => idx !== i)
        .map((q) => ({
          ...q,
          branchRules: (q.branchRules || [])
            .filter((r) => r.goTo === "end" || Number(r.goTo) !== removedNumber)
            .map((r) => (r.goTo !== "end" && Number(r.goTo) > removedNumber ? { ...r, goTo: Number(r.goTo) - 1 } : r)),
        })),
    );
  };

  const setQuestionKind = (index, kind) => {
    const u = [...questions];
    const q = { ...u[index] };
    q.isSingle      = kind === "single";
    q.isMultiChoice = kind === "multi";
    q.isConditional = kind === "conditional";
    q.isTextBox     = kind === "text";
    q.questionType  = kind === "rating" || kind === "nps" ? kind : null;
    if (kind === "conditional") q.options = [{ text: condLabels.yes, haveTextBox: false }, { text: condLabels.no, haveTextBox: false }];
    else if (!q.options || q.options.length === 0) q.options = [{ text: "" }];
    q.branchRules = []; // rules depend on the answers, so start fresh
    u[index] = q; setQuestions(u); clearValidation();
  };

  // ── Skip rules ──
  const ruleValueOptions = (q) => {
    const kind = kindOf(q);
    if (kind === "rating") return [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: String(n) }));
    if (kind === "nps") return Array.from({ length: 11 }, (_, n) => ({ label: String(n), value: String(n) }));
    if (kind === "conditional") return [{ label: condLabels.yes, value: condLabels.yes }, { label: condLabels.no, value: condLabels.no }];
    return (q.options || []).filter((o) => o.text && o.text.trim()).map((o) => ({ label: o.text, value: o.text }));
  };
  const updateRules = (qi, fn) => {
    const u = [...questions]; u[qi] = { ...u[qi], branchRules: fn([...(u[qi].branchRules || [])]) }; setQuestions(u); clearValidation();
  };
  const handleAddRule = (qi) => {
    const q = questions[qi]; const kind = kindOf(q); const vals = ruleValueOptions(q);
    const defaultValue = kind === "rating" ? "3" : kind === "nps" ? "6" : kind === "conditional" ? condLabels.no : (vals[0]?.value ?? "");
    updateRules(qi, (rules) => [...rules, { op: kind === "rating" || kind === "nps" ? "lte" : "eq", value: defaultValue, goTo: qi + 2 <= questions.length ? qi + 2 : "end" }]);
  };
  const handleUpdateRule = (qi, ri, patch) => updateRules(qi, (rules) => { rules[ri] = { ...rules[ri], ...patch }; return rules; });
  const handleRemoveRule = (qi, ri) => updateRules(qi, (rules) => rules.filter((_, i) => i !== ri));

  // ── Templates ──
  const applyTemplate = (tpl) => {
    let qs = tpl.questions();
    if (questionLimit !== null) qs = qs.slice(0, questionLimit);
    qs = qs.map((q) => ({ ...q, branchRules: (q.branchRules || []).filter((r) => r.goTo === "end" || Number(r.goTo) <= qs.length) }));
    setQuestions(qs);
    if (!surveyTitle.trim()) setSurveyTitle(tpl.title);
    clearValidation();
  };

  // ── Product / collection picker ──
  const pickResources = async () => {
    try {
      const type = targetType === "collection" ? "collection" : "product";
      const selected = await shopifyBridge.resourcePicker({ type, multiple: true, selectionIds: targetItems.map((i) => ({ id: i.id })) });
      if (selected) setTargetItems(selected.map((r) => ({ id: r.id, title: r.title })));
    } catch (e) { console.error("Resource picker failed:", e); }
  };
  const handleAddOption      = (qi) => { const u = [...questions]; u[qi].options.push({ text: "" }); setQuestions(u); };
  const handleRemoveOption   = (qi, oi) => { const u = [...questions]; u[qi].options = u[qi].options.filter((_, i) => i !== oi); setQuestions(u); };

  // AI Suggest
  const handleAISuggest = async () => {
    setAiLoading(true); setAiError(""); setAiSuggestions([]); setSelectedSuggestions([]);
    setAiStoreName(""); setAiSuggestModalOpen(true);
    setAiLanguageLabel(LANGUAGES[surveyLanguage]?.label ?? "English");
    setAiLanguageFlag(LANGUAGES[surveyLanguage]?.flag ?? "");
    try {
      const res = await fetch("/api/suggest-questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: LANGUAGES[surveyLanguage]?.isoCode ?? "en" }) });
      const data = await res.json();
      if (data.error) { setAiError(data.error); }
      else { setAiSuggestions(data.questions); setAiStoreName(data.storeName || ""); setAiPlanName(data.planName || "free"); setAiLanguageLabel(data.languageLabel || LANGUAGES[surveyLanguage]?.label || "English"); setAiLanguageFlag(data.languageFlag || LANGUAGES[surveyLanguage]?.flag || ""); }
    } catch { setAiError("Failed to connect to AI."); }
    finally { setAiLoading(false); }
  };

  const handleToggleSuggestion = (idx) => setSelectedSuggestions((p) => p.includes(idx) ? p.filter((i) => i !== idx) : [...p, idx]);
  const handleSelectAll = () => setSelectedSuggestions(selectedSuggestions.length === aiSuggestions.length ? [] : aiSuggestions.map((_, i) => i));

  const handleAddSuggestedQuestions = () => {
    const cleaned = questions.filter((q) => q.text.trim() !== "" || q.options.some((o) => o.text.trim() !== ""));
    const toAdd = selectedSuggestions.map((idx) => {
      const s = aiSuggestions[idx]; const type = s.type || "single";
      return { text: s.text, isConditional: type === "conditional", isMultiChoice: type === "multiChoice", isTextBox: type === "textBox", isSingle: type === "single",
        options: type === "conditional" ? [{ text: condLabels.yes, haveTextBox: false }, { text: condLabels.no, haveTextBox: false }] : type === "textBox" ? [] : (s.options || []).map((o) => ({ text: typeof o === "string" ? o : o.text, haveTextBox: false })),
      };
    });
    const remaining = questionLimit === null ? toAdd.length : Math.max(0, questionLimit - cleaned.length);
    setQuestions([...cleaned, ...(questionLimit === null ? toAdd : toAdd.slice(0, remaining))]);
    setAiSuggestModalOpen(false); setSelectedSuggestions([]);
  };

  const getTypeInfo = (type) => QUESTION_TYPES[type] || QUESTION_TYPES.single;

  const validateForm = () => {
    const err = (msg) => { setValidationError(msg); setShowValidationModal(true); return false; };
    if (!surveyTitle || !surveyTitle.trim()) return err(t("survey_title_required"));
    if (questions.length === 0) return err(t("must_have_question"));
    if (questionLimit !== null && questions.length > questionLimit) return err(t("plan_allows_only", { plan: PLAN_LABELS[planName], limit: questionLimit }));
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text || !q.text.trim()) return err(t("question_must_have_text", { n: i + 1 }));
      if (q.isTextBox || q.isConditional || q.questionType) continue;
      if (!q.options || q.options.length === 0) return err(t("question_must_have_option", { n: i + 1 }));
      const bad = q.options.findIndex((o) => !o.text || !o.text.trim());
      if (bad !== -1) return err(t("option_must_have_text", { q: i + 1, o: bad + 1 }));
    }
    if ((targetType === "product" || targetType === "collection") && targetItems.length === 0)
      return err(`Pick at least one ${targetType} for this survey, or choose "Every order".`);
    if (targetType === "country" && countriesText.split(",").map((c) => c.trim()).filter(Boolean).length === 0)
      return err("Enter at least one country code, for example US, IN, GB.");
    if (targetType === "min_total" && !(Number(minTotal) > 0))
      return err("Enter a minimum order amount greater than 0.");
    if (startsAt && endsAt && endsAt < startsAt)
      return err("The end date must be after the start date.");
    return true;
  };

  const handleFormSubmit = (e) => { if (!validateForm()) { e.preventDefault(); return false; } clearValidation(); return true; };

  return (
    <Page fullWidth>
      <style>{`
header.sv-header img {
    width: 230px;
    height: auto;
}
/* Reference image layout — scoped, non-destructive styling */
.sv-page {color:#091a4c; padding:8px 16px 35px; max-width:1120px; margin:0 auto; position:relative;}
.sv-page::before {content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(circle at 5% 10%,#dbeaff,transparent 38%),radial-gradient(circle at 95% 88%,#eee6ff,transparent 34%),#eef8ff;}
.sv-page .Polaris-Text--root {color:inherit;}
.sv-header {display:flex;justify-content:space-between;align-items:center;min-height:140px;gap:16px;position:relative;}
.sv-header-left {display:flex;align-items:flex-start;gap:22px;}
.sv-back {border:1px solid #d3e5ff;border-radius:12px;background:#ffffffb9;color:#1467ff;width:48px;height:48px;cursor:pointer;font-size:29px;box-shadow:0 6px 16px #3475bd12;}
.sv-heading {font-size:36px;font-weight:800;letter-spacing:-1.4px;line-height:1.14;color:#091a4c;}
.sv-heading span,.sv-panel-title span {color:#0766ff;}
.sv-subtitle {color:#56709c;font-size:15px;margin-top:8px;}
.sv-hero-illustration {width:240px;height:140px;object-fit:contain;}
.sv-plan {background:#ffffffed;border:1px solid #dce9ff;border-radius:15px;padding:16px 22px;box-shadow:0 9px 23px #2d69b013;margin-bottom:22px;}
.sv-plan .Polaris-Badge {background:#e1efff;color:#0865ef;padding:5px 11px;}
.sv-panel {background:#fff;border:1px solid #e0eaff;border-radius:18px;padding:22px;box-shadow:0 13px 35px #2763b015;}
.sv-panel-title {font-size:25px;font-weight:800;letter-spacing:-.8px;}
.sv-panel .Polaris-Divider {display:none;}


.sv-step::after {content:"";position:absolute;left:-32px;top:51px;bottom:-22px;width:1px;background:#d9e8ff;}
.sv-step:last-of-type::after {display:none;}
.sv-step > .Polaris-Card,.sv-step > .Polaris-LegacyCard,.sv-step > .Polaris-BlockStack {background:#fff;border:1px solid #e3ebfc;border-radius:14px;padding:18px;box-shadow:0 4px 18px #2a5eac09;}
.sv-step .Polaris-Text--headingMd,.sv-step .Polaris-Text--headingSm {font-weight:750;color:#0c1b4b;}
.sv-template-grid .sv-template {border:1px solid #dcecff;border-radius:14px;padding:16px;background:linear-gradient(120deg,#eef8ff,#f8fcff);min-height:136px;display:flex;align-items:center;gap:16px;}
.sv-template-grid .sv-template:nth-child(4n+2){background:linear-gradient(120deg,#fff0fa,#fff9fd);border-color:#ffdef2;}
.sv-template-grid .sv-template:nth-child(4n+3){background:linear-gradient(120deg,#f2f0ff,#faf9ff);border-color:#e7e0ff;}
.sv-template-grid .sv-template:nth-child(4n+4){background:linear-gradient(120deg,#e9faf7,#f5fffd);border-color:#d6f3ec;}
.sv-template-icon {flex:none;width:66px;height:66px;border-radius:20px;background:#d8efff;display:grid;place-items:center;font-size:32px;}
.sv-template:nth-child(4n+2) .sv-template-icon{background:#ffe0f2;}.sv-template:nth-child(4n+3) .sv-template-icon{background:#e6dfff;}.sv-template:nth-child(4n+4) .sv-template-icon{background:#cbf5e9;}
.sv-page .Polaris-Button {border-radius:10px;}
.sv-page .Polaris-Button--variantPrimary {background:linear-gradient(110deg,#116bff,#7847ff)!important;border-color:transparent!important;color:white!important;box-shadow:0 6px 13px #275fff1c;}
.sv-save .Polaris-Button {min-height:49px;font-size:16px;font-weight:700;}
.sv-page .Polaris-TextField__Input,.sv-page .Polaris-Select__Input {border-radius:9px;}
.sv-page .Polaris-Text--subdued {color:#57709f;}
@media(max-width:700px){.sv-page{padding:4px 8px 25px}.sv-header{min-height:108px}.sv-heading{font-size:26px}.sv-header-left{gap:10px}.sv-back{width:38px;height:38px;font-size:23px}.sv-hero-illustration{width:95px;height:95px}.sv-panel{padding:12px}.sv-plan{padding:13px}.sv-step{margin-left:36px}.sv-step::before{left:-37px;width:30px;height:30px;font-size:15px}.sv-step::after{left:-22px;top:45px}.sv-step > .Polaris-Card,.sv-step > .Polaris-LegacyCard,.sv-step > .Polaris-BlockStack{padding:12px}.sv-template-grid .sv-template{min-height:115px;padding:11px;gap:10px}.sv-template-icon{width:47px;height:47px;font-size:24px}}

        @keyframes slideIn { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
        .animate-slide-in { animation: slideIn 0.3s ease-out; }
        .ai-card { cursor:pointer; border-radius:8px; padding:14px 16px; transition:all 0.2s ease; border:1px solid #e1e3e5; background:#fff; }
        .ai-card:hover { border-color:#b5b5b5; }
        .ai-card.selected { border-color:#008060; background:#f0fdf4; }
        .lang-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
        .lang-btn { padding:10px 12px; border-radius:8px; border:1px solid #e1e3e5; background:#fff; cursor:pointer; text-align:center; transition:all 0.18s ease; font-size:14px; }
        .lang-btn:hover { border-color:#b5b5b5; background:#f9f9f9; }
        .lang-btn.lang-selected { border-color:#008060; background:#f0fdf4; font-weight:600; }
        .lang-btn.lang-disabled { opacity:0.4; cursor:not-allowed; }
      `}</style>

      <div className="sv-page">
      <header className="sv-header">
        <div className="sv-header-left">
          <button type="button" className="sv-back" aria-label="Back to dashboard" onClick={() => navigate(withLang("/app/"))}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m14 5-7 7 7 7M7 12h14"></path></svg></button>
          <div><div className="sv-heading">{isEditing ? "Edit" : "Create New"} <span>Survey</span> ✨</div><div className="sv-subtitle">{isEditing ? t("edit_survey_subtitle") : t("create_survey_subtitle")}</div></div>
        </div>
<img src="/feedback-logo/logo-3.png" alt="Feedback Logo" />
        {/* <svg className="sv-hero-illustration" viewBox="0 0 240 140" aria-hidden="true"><rect x="45" y="20" width="130" height="108" rx="20" fill="#8acbff" transform="rotate(-9 45 20)"/><rect x="75" y="10" width="112" height="109" rx="16" fill="#f9fdff" stroke="#9bd4ff" strokeWidth="7" transform="rotate(8 75 10)"/><circle cx="103" cy="43" r="12" fill="#1675ff"/><path d="m97 43 5 5 8-10" stroke="white" strokeWidth="3" fill="none"/><circle cx="99" cy="79" r="12" fill="#1675ff"/><path d="m93 79 5 5 8-10" stroke="white" strokeWidth="3" fill="none"/><path d="M126 41h39 M126 54h25 M123 80h39 M123 92h26" stroke="#6db4ff" strokeWidth="6" strokeLinecap="round"/><path d="m177 96 26-44 13 9-26 44-20 8z" fill="#fa48af" stroke="#d7339a" strokeWidth="2"/><path d="m170 113 20-8-14-9z" fill="#ffcf75"/><path d="M38 28 25 16 M29 55H12 M208 20l9-12" stroke="#2377ff" strokeWidth="6" strokeLinecap="round"/></svg> */}
      </header>
      <BlockStack gap="500">

        {/* ── Top Bar with UI language dropdown ── */}
        <div style={{display:"none"}}><InlineStack align="space-between" blockAlign="center" wrap={false}>
          <Text variant="bodyMd" tone="subdued">
            {isEditing ? t("edit_survey_subtitle") : t("create_survey_subtitle")}
          </Text>
          <InlineStack gap="300" blockAlign="center">
          </InlineStack>
        </InlineStack>

        </div>
        {/* ── Plan Bar ── */}
        <div className="sv-plan">
          <InlineStack align="space-between" blockAlign="center" wrap>
            <InlineStack gap="400" blockAlign="center">
              <Text variant="bodyMd">{t("store_label")}: <strong>{shop}</strong></Text>
              <Badge tone={planName === "advanced" ? "success" : planName === "pro" ? "info" : "subdued"}>
                {PLAN_LABELS[planName]} {t("plan_label")}
              </Badge>
              <Text variant="bodySm" tone="subdued">
                {questionLimit === null ? t("unlimited_questions") : `${questionLimit} ${t("questions_per_survey_label")}`}
              </Text>
            </InlineStack>
            <Button size="slim" onClick={() => navigate(withLang("/app/billing"))}>{t("manage_plan")}</Button>
          </InlineStack>
        </div>

        {isSubmitting && (
          <Banner tone="info">
            <InlineStack gap="200" blockAlign="center">
              <Spinner size="small" />
              <Text variant="bodyMd" fontWeight="semibold">{isEditing ? t("updating_survey") : t("creating_survey")} {t("please_wait")}</Text>
            </InlineStack>
          </Banner>
        )}

        {actionData?.error && (
          <Banner tone={actionData.limitReached ? "warning" : "critical"} action={actionData.limitReached ? { content: t("upgrade_for_more"), onAction: () => navigate(withLang("/app/billing")) } : undefined}>
            <InlineStack gap="200" blockAlign="center">
              
              <Text variant="bodyMd" fontWeight="semibold">{actionData.error}</Text>
            </InlineStack>
          </Banner>
        )}

        {validationError && (
          <Banner tone="critical" onDismiss={clearValidation}>
            <InlineStack gap="200" blockAlign="center">
              
              <Text variant="bodyMd" fontWeight="semibold">{validationError}</Text>
            </InlineStack>
          </Banner>
        )}

        {/* ═══════════════════════════════════════════════════
            Survey Form
        ═══════════════════════════════════════════════════ */}
        <Form method="post" onSubmit={handleFormSubmit}>
          <div className="sv-panel">
            <BlockStack gap="500">
              <InlineStack align="space-between" blockAlign="center">
                <div className="sv-panel-title">{isEditing ? "Edit" : "Create New"} <span>Survey</span></div>
                <Button onClick={handleAISuggest} disabled={isSubmitting}>{t("ai_suggest_btn")}</Button>
              </InlineStack>
              <Divider />

              <FormLayout>
                {/* ── Templates ── */}
                {!isEditing && (
                  <div className="sv-step" data-step="1"><Card padding="400">
                    <BlockStack gap="300">
                      <BlockStack gap="100">
                        <Text variant="headingSm" fontWeight="bold">Start from a template</Text>
                        <Text variant="bodySm" tone="subdued">Fills in the title and questions. You can change everything afterwards.{questionLimit !== null ? ` Your ${PLAN_LABELS[planName]} plan keeps the first ${questionLimit} question(s).` : ""}</Text>
                      </BlockStack>
                      <div className="sv-template-grid"><InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                        {SURVEY_TEMPLATES.map((tpl) => (
                        
<div key={tpl.key} className="sv-template">
  <div className="sv-template-icon">
    {SURVEY_TEMPLATES.indexOf(tpl) % 4 === 0 ? (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
        <defs>
          <linearGradient id="chatBlue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#168FFF"/>
            <stop offset="100%" stopColor="#0865F5"/>
          </linearGradient>
        </defs>
        <path d="M24 3.5C12.4 3.5 3 11.3 3 21c0 5.3 2.8 10 7.3 13.1L8 43l10.1-4.3c1.9.5 3.9.8 5.9.8 11.6 0 21-7.8 21-17.5S35.6 3.5 24 3.5Z" fill="url(#chatBlue)"/>
        <g fill="#FFFFFF">
          <circle cx="14.5" cy="21" r="2.5"/>
          <circle cx="24" cy="21" r="2.5"/>
          <circle cx="33.5" cy="21" r="2.5"/>
        </g>
      </svg>
    ) : SURVEY_TEMPLATES.indexOf(tpl) % 4 === 1 ? (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
        <defs>
          <linearGradient id="starPink" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF78C7"/>
            <stop offset="55%" stopColor="#FF35A6"/>
            <stop offset="100%" stopColor="#F20B85"/>
          </linearGradient>
        </defs>
        <path d="M21 4.8Q24 1.2 27 4.8L31.5 14.1 41.7 15.6Q46.5 16.3 43 20L35.5 27.2 37.3 37.4Q38.1 42.1 33.8 39.8L24 34.6 14.2 39.8Q9.9 42.1 10.7 37.4L12.5 27.2 5 20Q1.5 16.3 6.3 15.6L16.5 14.1Z" fill="url(#starPink)"/>
        <path d="M21 7 17.3 15.8 7.3 17.1 14.7 24.2 12.9 34.1 22.2 29.2" fill="none" stroke="#FFB6E2" strokeWidth="1.2" strokeLinecap="round" opacity=".75"/>
      </svg>
    ) : SURVEY_TEMPLATES.indexOf(tpl) % 4 === 2 ? (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 40" width="48" height="40" aria-hidden="true">
        <defs>
          <linearGradient id="truckPurple" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A56BFF"/>
            <stop offset="100%" stopColor="#6938F5"/>
          </linearGradient>
        </defs>
        <path d="M4 5Q4 3 7 3H29Q31 3 31 6V10H37Q39 10 40 13L44 21V29H39A5 5 0 0 0 29 29H19A5 5 0 0 0 9 29H4Z" fill="url(#truckPurple)"/>
        <path d="M31 13H36Q37 13 38 15L41 21H31Z" fill="#E7D9FF"/>
        <path d="M5 8H28V25H5Z" fill="#8953F8" opacity=".35"/>
        <circle cx="14" cy="29" r="4.5" fill="#FFFFFF"/>
        <circle cx="14" cy="29" r="3" fill="#7040F5"/>
        <circle cx="34" cy="29" r="4.5" fill="#FFFFFF"/>
        <circle cx="34" cy="29" r="3" fill="#7040F5"/>
      </svg>
    ) : (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
        <defs>
          <linearGradient id="bagGreen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#20D5A0"/>
            <stop offset="100%" stopColor="#00B98A"/>
          </linearGradient>
        </defs>
        <path d="M15 16V12a9 9 0 0 1 18 0v4" fill="none" stroke="#00BD91" strokeWidth="3.5" strokeLinecap="round"/>
        <path d="M10 15Q10 13 13 13H35Q38 13 38.5 16L42 38Q42.5 42 38 42H10Q6 42 6.5 38Z" fill="url(#bagGreen)"/>
        <circle cx="17" cy="18" r="2" fill="#D9FFF3"/>
        <circle cx="31" cy="18" r="2" fill="#D9FFF3"/>
      </svg>
    )}
  </div>

  <BlockStack gap="200">
    <Text variant="bodyMd" fontWeight="bold">
      {tpl.name}
    </Text>
    <Text variant="bodySm" tone="subdued">
      {tpl.description}
    </Text>
    <div>
      <Button
        size="slim"
        onClick={() => applyTemplate(tpl)}
        disabled={isSubmitting}
      >
        Use this template
      </Button>
    </div>
  </BlockStack>
</div>

                        ))}
                      </InlineGrid></div>
                    </BlockStack>
                  </Card></div>
                )}

                {/* ── Survey Details ── */}
                <div className="sv-step" data-step="2"><BlockStack gap="400">
                  <InlineStack gap="200" blockAlign="center">
                    
                    <Text variant="headingMd" fontWeight="bold">{t("survey_details")}</Text>
                  </InlineStack>

                  <TextField
                    label={t("survey_title_label")}
                    value={surveyTitle}
                    onChange={(v) => { setSurveyTitle(v); clearValidation(); }}
                    name="quizTitle" id="quizTitle"
                    placeholder={t("survey_title_placeholder")}
                    requiredIndicator autoComplete="off"
                    helpText={t("survey_title_help")}
                    disabled={isSubmitting}
                  />

                  {/* ── Survey Language Selector (only when editing an older non-English survey) ── */}
                  {isEditing && surveyLanguage !== "default" && (
                  <Card padding="400">
                    <BlockStack gap="300">
                      <Text variant="headingSm" fontWeight="semibold">{t("survey_language")}</Text>
                      <Text variant="bodySm" tone="subdued">
                        {t("language_help")} {t("conditional_help")} <strong>{condLabels.yes} / {condLabels.no}</strong> {t("for_selected_lang")}
                      </Text>
                      <div className="lang-grid">
                        {Object.entries(LANGUAGES).map(([key, { flag, label }]) => {
                          const alreadyUsed = usedLanguages.includes(key) && !(isEditing && getLang(editSurvey) === key);
                          const isSelected = surveyLanguage === key;
                          const yesNo = CONDITIONAL_LABELS[key] ?? CONDITIONAL_LABELS.default;
                          return (
                            <button key={key} type="button"
                              className={["lang-btn", isSelected ? "lang-selected" : "", alreadyUsed ? "lang-disabled" : ""].join(" ")}
                              onClick={() => { if (!alreadyUsed) setSurveyLanguage(key); }}
                              disabled={alreadyUsed || isSubmitting}
                              title={alreadyUsed ? `Already have ${label} survey` : `${label} — ${yesNo.yes}/${yesNo.no}`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodySm" tone="subdued">{t("selected_label")}</Text>
                        <Badge tone={LANGUAGES[surveyLanguage]?.badge ?? "info"}>{LANGUAGES[surveyLanguage]?.flag} {LANGUAGES[surveyLanguage]?.label}</Badge>
                        <Badge tone="warning">{t("conditional")}: {condLabels.yes} / {condLabels.no}</Badge>
                      </InlineStack>
                    </BlockStack>
                  </Card>
                  )}

                </BlockStack>

                </div>
                {/* ── Questions ── */}
                <div className="sv-step" data-step="3"><BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        
                        <Text variant="headingMd" fontWeight="bold">{t("questions_heading")}</Text>
                        <Badge tone={hasReachedQLimit ? "critical" : "info"}>{questions.length} / {limitLabel}</Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">
                        {questionLimit === null ? t("unlimited_on_advanced") : t("plan_allows", { plan: PLAN_LABELS[planName], limit: questionLimit })}
                      </Text>
                    </BlockStack>
                    <Tooltip content={hasReachedQLimit ? t("upgrade_to_add_more") : t("add_new_question")}>
                      <Button onClick={handleAddQuestion} variant="primary" disabled={isSubmitting || hasReachedQLimit}>
                        {t("add_question")}
                      </Button>
                    </Tooltip>
                  </InlineStack>

                  {hasReachedQLimit && questionLimit !== null && (
                    <Banner tone="warning" action={{ content: t("upgrade_for_more"), onAction: () => navigate(withLang("/app/billing")) }}>
                      <Text variant="bodyMd">{t("question_limit_reached", { limit: questionLimit, plan: PLAN_LABELS[planName] })}</Text>
                    </Banner>
                  )}
                  <Divider />
                </BlockStack>

                </div>
                {/* ── Question Cards ── */}
                <BlockStack gap="400">
                  {questions.map((question, index) => (
                    <div key={index} className="animate-slide-in">
                      <Card padding="400">
                        <BlockStack gap="400">
                          <InlineStack align="space-between" blockAlign="start">
                            <InlineStack gap="300" blockAlign="center">
                              <Badge tone="success" size="large">Q{index + 1}</Badge>
                              <Text variant="headingSm" fontWeight="semibold">{t("question_label")} {index + 1}</Text>
                              {question.isSingle      && <Badge tone="attention">{t("single_label")}</Badge>}
                              {question.isConditional && <Badge tone="warning">{t("conditional_label")}</Badge>}
                              {question.isMultiChoice && <Badge tone="success">{t("multi_label")}</Badge>}
                              {question.isTextBox     && <Badge tone="info">{t("textbox_label")}</Badge>}
                              {question.questionType === "rating" && <Badge tone="attention">Rating 1-5</Badge>}
                              {question.questionType === "nps"    && <Badge tone="attention">NPS 0-10</Badge>}
                            </InlineStack>
                            <Tooltip content={t("remove_question")}>
                              <Button onClick={() => handleRemoveQuestion(index)} variant="plain" tone="critical" disabled={isSubmitting} />
                            </Tooltip>
                          </InlineStack>

                          {/* Type selector */}
                          <Select
                            label={t("question_type")}
                            options={KIND_OPTIONS}
                            value={kindOf(question)}
                            onChange={(v) => setQuestionKind(index, v)}
                            disabled={isSubmitting}
                          />

                          <TextField label={t("question_text")} placeholder={t("question_placeholder")} value={question.text} onChange={(v) => { handleInputChange(index, "text", v); clearValidation(); }} autoComplete="off" multiline={2} requiredIndicator disabled={isSubmitting} />

                          {!question.isTextBox && !question.questionType && (
                            <BlockStack gap="300">
                              <InlineStack align="space-between" blockAlign="center">
                                <Text variant="bodySm" fontWeight="medium">{t("answer_options")}</Text>
                                {!question.isConditional && (
                                  <Button onClick={() => handleAddOption(index)} tone="success" size="slim" disabled={isSubmitting}>{t("add_option")}</Button>
                                )}
                              </InlineStack>
                              {question.isConditional ? (
                                <BlockStack gap="200">
                                  <div style={{ border: "1px solid #e1e3e5", borderRadius: 6, padding: "8px 12px", background: "#fafbfb" }}>
                                    <InlineStack gap="200" blockAlign="center">
                                      <span style={{ color: "#008060", fontWeight: 600 }}>Yes</span>
                                      <TextField disabled value={condLabels.yes} helpText={t("yes_in_lang", { lang: LANGUAGES[surveyLanguage]?.label })} />
                                    </InlineStack>
                                  </div>
                                  <div style={{ border: "1px solid #e1e3e5", borderRadius: 6, padding: "8px 12px", background: "#fafbfb" }}>
                                    <InlineStack gap="200" blockAlign="center">
                                      <span style={{ color: "#d82c0d", fontWeight: 600 }}>No</span>
                                      <TextField disabled value={condLabels.no} helpText={t("no_in_lang", { lang: LANGUAGES[surveyLanguage]?.label })} />
                                    </InlineStack>
                                  </div>
                                </BlockStack>
                              ) : (
                                <BlockStack gap="200">
                                  {question.options.map((option, oIdx) => (
                                    <div key={oIdx} style={{ border: "1px solid #e1e3e5", borderRadius: 6, padding: "8px 12px", background: "#fafbfb" }}>
                                      <InlineStack gap="200" blockAlign="center">
                                        <Text variant="bodySm" fontWeight="semibold" tone="subdued">{oIdx + 1}</Text>
                                        <Box width="100%">
                                          <TextField placeholder={`${t("option_placeholder")} ${oIdx + 1}`} value={option.text}
                                            onChange={(v) => { const u = [...questions]; u[index].options[oIdx].text = v; setQuestions(u); clearValidation(); }}
                                            autoComplete="off" requiredIndicator disabled={isSubmitting} />
                                        </Box>
                                        <Tooltip content={t("remove_option")}>
                                          <Button onClick={() => handleRemoveOption(index, oIdx)} tone="critical" size="slim" disabled={isSubmitting} />
                                        </Tooltip>
                                      </InlineStack>
                                    </div>
                                  ))}
                                </BlockStack>
                              )}
                            </BlockStack>
                          )}

                          {question.questionType && (
                            <Banner tone="info">
                              <Text variant="bodySm">
                                {question.questionType === "rating"
                                  ? "Customers pick 1 to 5 stars. The answer is saved as a number from 1 to 5."
                                  : "Customers pick a score from 0 (not likely) to 10 (very likely). The answer is saved as a number from 0 to 10."}
                              </Text>
                            </Banner>
                          )}

                          {question.isTextBox && (
                            <Banner tone="info"><Text variant="bodySm">{t("textbox_hint")}</Text></Banner>
                          )}

                          {/* Skip logic */}
                          {["single", "conditional", "rating", "nps"].includes(kindOf(question)) && (
                            <div style={{ border: "1px dashed #c9cce8", borderRadius: 10, padding: 12, background: "#f8f8ff" }}>
                              <BlockStack gap="200">
                                <InlineStack align="space-between" blockAlign="center">
                                  <BlockStack gap="050">
                                    <Text variant="bodySm" fontWeight="semibold">Skip logic (optional)</Text>
                                    <Text variant="bodySm" tone="subdued">
                                      {kindOf(question) === "conditional" && (question.branchRules || []).length === 0
                                        ? `Default: choosing "${condLabels.no}" ends the survey. Add a rule to change that.`
                                        : "Send customers to a later question, or end the survey, based on their answer."}
                                    </Text>
                                  </BlockStack>
                                  <Button size="slim" onClick={() => handleAddRule(index)} disabled={isSubmitting}>Add rule</Button>
                                </InlineStack>
                                {(question.branchRules || []).map((rule, ri) => (
                                  <InlineStack key={ri} gap="200" blockAlign="end" wrap={false}>
                                    {(kindOf(question) === "rating" || kindOf(question) === "nps") ? (
                                      <div style={{ minWidth: 150 }}>
                                        <Select label="If the answer is" options={[{ label: "at most", value: "lte" }, { label: "at least", value: "gte" }, { label: "exactly", value: "eq" }]} value={rule.op} onChange={(v) => handleUpdateRule(index, ri, { op: v })} />
                                      </div>
                                    ) : (
                                      <Text variant="bodySm">If the answer is</Text>
                                    )}
                                    <div style={{ minWidth: 130 }}>
                                      <Select label="Value" labelHidden options={ruleValueOptions(question)} value={String(rule.value)} onChange={(v) => handleUpdateRule(index, ri, { value: v })} />
                                    </div>
                                    <div style={{ minWidth: 200 }}>
                                      <Select
                                        label="Then"
                                        options={[
                                          ...Array.from({ length: Math.max(0, questions.length - (index + 1)) }, (_, k) => ({ label: `Go to question ${index + 2 + k}`, value: String(index + 2 + k) })),
                                          { label: "End the survey", value: "end" },
                                        ]}
                                        value={String(rule.goTo)}
                                        onChange={(v) => handleUpdateRule(index, ri, { goTo: v === "end" ? "end" : Number(v) })}
                                      />
                                    </div>
                                    <Button size="slim" tone="critical" onClick={() => handleRemoveRule(index, ri)}>Remove</Button>
                                  </InlineStack>
                                ))}
                              </BlockStack>
                            </div>
                          )}
                        </BlockStack>
                      </Card>
                    </div>
                  ))}
                </BlockStack>

                {/* ── Where to show ── */}
                <div className="sv-step" data-step="4"><Card padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" fontWeight="bold">Where to show</Text>
                    <Select label="Show this survey on" options={PLACEMENT_OPTIONS} value={placement} onChange={setPlacement} disabled={isSubmitting} />

                    {showsOnStorefront && (
                      <BlockStack gap="200">
                        <Text variant="bodySm" fontWeight="semibold">Pages</Text>
                        <InlineStack gap="400" wrap>
                          {PAGE_OPTIONS.map((p) => (
                            <label key={p.value} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", fontSize: 14 }}>
                              <input type="checkbox" checked={pageTargets.includes(p.value)} onChange={() => togglePage(p.value)} disabled={isSubmitting} />
                              {p.label}
                            </label>
                          ))}
                        </InlineStack>
                        <Banner tone="info">
                          <Text variant="bodySm">
                            To make it appear, add the app to your theme: Online Store &gt; Themes &gt; Customize. Turn on the <strong>Feedback survey pop-up</strong> in App embeds, or add the <strong>Feedback survey</strong> block to a page for an inline survey.
                          </Text>
                        </Banner>
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>

                </div>
                {showsOnStorefront && (
                  <Card padding="400">
                    <BlockStack gap="400">
                      <Text variant="headingMd" fontWeight="bold">Design and behavior (storefront)</Text>
                      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400" alignItems="start">
                        <BlockStack gap="300">
                          <InlineGrid columns={3} gap="300">
                            {[["accent", "Accent color"], ["background", "Background"], ["text", "Text color"]].map(([key, label]) => (
                              <BlockStack key={key} gap="100">
                                <Text variant="bodySm">{label}</Text>
                                <input type="color" value={design[key]} onChange={(e) => updateDesign({ [key]: e.target.value })} disabled={isSubmitting} style={{ width: "100%", height: 36, border: "1px solid #c9cce8", borderRadius: 8, padding: 2, background: "#fff", cursor: "pointer" }} />
                              </BlockStack>
                            ))}
                          </InlineGrid>
                          <TextField label={`Corner roundness: ${design.radius}px`} type="range" min={0} max={32} value={String(design.radius)} onChange={(v) => updateDesign({ radius: Number(v) })} autoComplete="off" disabled={isSubmitting} />
                          <InlineGrid columns={2} gap="300">
                            <Select label="Layout" options={[{ label: "Card (border and shadow)", value: "card" }, { label: "Flat (no box)", value: "flat" }]} value={design.layout} onChange={(v) => updateDesign({ layout: v })} disabled={isSubmitting} />
                            <Select label="Font" options={[{ label: "Same as your theme", value: "inherit" }, { label: "Sans-serif", value: "system" }, { label: "Serif", value: "serif" }, { label: "Monospace", value: "mono" }]} value={design.font} onChange={(v) => updateDesign({ font: v })} disabled={isSubmitting} />
                          </InlineGrid>
                          <Select label="Pop-up position" options={[{ label: "Bottom right", value: "bottom-right" }, { label: "Bottom left", value: "bottom-left" }, { label: "Center (with overlay)", value: "center" }]} value={design.position} onChange={(v) => updateDesign({ position: v })} disabled={isSubmitting} helpText="Only for the pop-up. Inline surveys fill the space of the block." />
                          <InlineGrid columns={2} gap="300">
                            <Select label="Show pop-up" options={[{ label: "Right away", value: "immediate" }, { label: "After a delay", value: "delay" }, { label: "After scrolling", value: "scroll" }, { label: "When leaving the page", value: "exit" }]} value={design.trigger} onChange={(v) => updateDesign({ trigger: v })} disabled={isSubmitting} />
                            {(design.trigger === "delay" || design.trigger === "scroll") && (
                              <TextField label={design.trigger === "delay" ? "Seconds" : "Scroll percent"} type="number" min={0} max={design.trigger === "delay" ? 600 : 100} value={String(design.triggerValue)} onChange={(v) => updateDesign({ triggerValue: Number(v) })} autoComplete="off" disabled={isSubmitting} />
                            )}
                          </InlineGrid>
                          <Select label="If a visitor closes it" options={[{ label: "Show again after a week", value: "week" }, { label: "Show again next visit (new session)", value: "session" }, { label: "Show on every page view", value: "always" }]} value={design.frequency} onChange={(v) => updateDesign({ frequency: v })} disabled={isSubmitting} helpText="Visitors who finish the survey never see it again." />
                        </BlockStack>

                        {/* Live preview */}
                        <BlockStack gap="200">
                          <Text variant="bodySm" fontWeight="semibold">Preview</Text>
                          <div style={{ background: "#eef0f4", borderRadius: 12, padding: 20, minHeight: 260, display: "flex", alignItems: design.position === "center" ? "center" : "flex-end", justifyContent: design.position === "bottom-left" ? "flex-start" : design.position === "center" ? "center" : "flex-end" }}>
                            <div style={{
                              width: "100%", maxWidth: 320, padding: design.layout === "flat" ? 8 : 18, background: design.background, color: design.text, borderRadius: design.radius,
                              border: design.layout === "flat" ? "none" : "1px solid rgba(0,0,0,0.12)", boxShadow: design.layout === "flat" ? "none" : "0 8px 28px rgba(0,0,0,0.12)",
                              fontFamily: { inherit: "inherit", system: "-apple-system, Segoe UI, Roboto, sans-serif", serif: "Georgia, serif", mono: "ui-monospace, Menlo, monospace" }[design.font],
                            }}>
                              <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>Question 1 of 3</div>
                              <div style={{ height: 4, borderRadius: 2, background: "rgba(0,0,0,0.08)", marginBottom: 12, overflow: "hidden" }}><div style={{ width: "33%", height: "100%", background: design.accent }} /></div>
                              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{questions[0]?.text || "How did you hear about us?"}</div>
                              {["Google search", "Friend or family", "Instagram"].map((label, i) => (
                                <div key={label} style={{ padding: "9px 12px", marginBottom: 8, fontSize: 14, borderRadius: Math.max(design.radius - 4, 0), border: `1px solid ${i === 1 ? design.accent : "rgba(0,0,0,0.2)"}`, background: i === 1 ? design.accent : "transparent", color: i === 1 ? "#ffffff" : design.text }}>{label}</div>
                              ))}
                              <div style={{ display: "inline-block", padding: "9px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: design.accent, borderRadius: Math.max(design.radius - 4, 0) }}>Next</div>
                            </div>
                          </div>
                          <Text variant="bodySm" tone="subdued">The thank-you page form uses Shopify's checkout style, so these colors apply to storefront surveys only.</Text>
                        </BlockStack>
                      </InlineGrid>
                    </BlockStack>
                  </Card>
                )}

                {/* ── Visibility & schedule ── */}
                <div className="sv-step" data-step="5"><Card padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" fontWeight="bold">Visibility</Text>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={isSubmitting} />
                      <Text variant="bodyMd">Survey is on (customers can see it)</Text>
                    </label>
                    <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                      <TextField label="Start date (optional)" type="date" value={startsAt} onChange={setStartsAt} autoComplete="off" disabled={isSubmitting} helpText="Leave empty to start right away." />
                      <TextField label="End date (optional)" type="date" value={endsAt} onChange={setEndsAt} autoComplete="off" disabled={isSubmitting} helpText="Leave empty to run until you turn it off." />
                    </InlineGrid>
                  </BlockStack>
                </Card>

                </div>
                {/* ── Who sees this survey ── */}
                <div className="sv-step" data-step="6"><Card padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" fontWeight="bold">Who sees this survey</Text>
                    <Text variant="bodySm" tone="subdued">
                      With several surveys, the most specific match wins. A survey for "Every order" is used when no other survey matches.
                    </Text>
                    {showsOnStorefront && (
                      <Banner tone="info">
                        <Text variant="bodySm">On storefront pages, product and collection rules match the page the visitor is viewing, the country rule uses their country, and the minimum amount uses their cart total.</Text>
                      </Banner>
                    )}
                    <Select label="Show this survey for" options={placement === "storefront" ? STOREFRONT_TARGET_TYPES : TARGET_TYPES} value={targetType} onChange={(v) => { setTargetType(v); setTargetItems([]); clearValidation(); }} disabled={isSubmitting} />

                    {(targetType === "product" || targetType === "collection") && (
                      <BlockStack gap="200">
                        <div><Button onClick={pickResources} disabled={isSubmitting}>{targetItems.length > 0 ? `Change ${targetType}s` : `Select ${targetType}s`}</Button></div>
                        {targetItems.length > 0 && (
                          <InlineStack gap="200" wrap>
                            {targetItems.map((item) => <Badge key={item.id}>{item.title}</Badge>)}
                          </InlineStack>
                        )}
                      </BlockStack>
                    )}

                    {targetType === "country" && (
                      <TextField label="Country codes" value={countriesText} onChange={setCountriesText} autoComplete="off" placeholder="US, IN, GB" helpText="Two-letter country codes, separated by commas." disabled={isSubmitting} />
                    )}

                    {targetType === "min_total" && (
                      <TextField label="Minimum order total" type="number" value={minTotal} onChange={setMinTotal} autoComplete="off" helpText="In your store currency. Orders at or above this amount see the survey." min={0} disabled={isSubmitting} />
                    )}
                  </BlockStack>
                </Card>

                </div>
                {/* Hidden fields — include returnLang so redirect preserves UI language */}
                <input type="hidden" name="questions"       value={JSON.stringify(questions)} />
                <input type="hidden" name="surveyId"        value={isEditing ? editSurvey.id : ""} />
                <input type="hidden" name="language"        value={surveyLanguage} />
                <input type="hidden" name="isFrenchVersion" value={String(surveyLanguage === "french")} />
                <input type="hidden" name="returnLang"      value={uiLanguage} />
                <input type="hidden" name="isActive"        value={String(isActive)} />
                <input type="hidden" name="startsAt"        value={startsAt} />
                <input type="hidden" name="endsAt"          value={endsAt} />
                <input type="hidden" name="targetType"      value={targetType} />
                <input type="hidden" name="targetValue"     value={targetValueJson} />
                <input type="hidden" name="placement"       value={placement} />
                <input type="hidden" name="pageTargets"     value={JSON.stringify(pageTargets)} />
                <input type="hidden" name="design"          value={JSON.stringify(design)} />

                <div className="sv-save"><Box paddingBlockStart="400">
                  <Button submit variant="primary" size="large" fullWidth tone="success" loading={isSubmitting} disabled={isSubmitting}>
                    {isEditing ? t("update_survey") : t("save_survey")}
                  </Button>
                </Box></div>
              </FormLayout>
            </BlockStack>
          </div>
        </Form>
      </BlockStack></div>

      {/* ── AI Modal ── */}
      <Modal
        open={aiSuggestModalOpen}
        onClose={() => { if (!aiLoading) { setAiSuggestModalOpen(false); setSelectedSuggestions([]); } }}
        title={`${t("ai_suggest_title")} — ${aiLanguageFlag} ${aiLanguageLabel}`}
        large
        primaryAction={{ content: selectedSuggestions.length > 0 ? t("add_questions_btn", { n: selectedSuggestions.length }) : t("select_questions_below"), onAction: handleAddSuggestedQuestions, disabled: selectedSuggestions.length === 0 || aiLoading }}
        secondaryActions={[{ content: t("cancel"), onAction: () => { setAiSuggestModalOpen(false); setSelectedSuggestions([]); }, disabled: aiLoading }]}
      >
        <Modal.Section>
          <BlockStack gap="500">
            {aiLoading && (
              <InlineStack gap="300" blockAlign="center">
                <Spinner size="small" />
                <BlockStack gap="100">
                  <Text variant="bodyMd" fontWeight="semibold">{t("ai_generating", { flag: aiLanguageFlag, lang: aiLanguageLabel })}</Text>
                  <Text variant="bodySm" tone="subdued">{t("ai_wait")}</Text>
                </BlockStack>
              </InlineStack>
            )}
            {aiError && !aiLoading && (
              <Banner tone="critical" action={{ content: t("try_again"), onAction: handleAISuggest }}>
                <Text variant="bodyMd">{aiError}</Text>
              </Banner>
            )}
            {!aiLoading && aiSuggestions.length > 0 && (
              <BlockStack gap="400">
                <Banner tone="success">
                  <Text variant="bodyMd" fontWeight="semibold">
                    {t("ai_generated", { flag: aiLanguageFlag, count: aiSuggestions.length, lang: aiLanguageLabel })}
                    {aiStoreName ? ` ${t("ai_for_store", { store: aiStoreName })}` : ` ${t("ai_for_your_store")}`}
                  </Text>
                </Banner>

                <InlineStack gap="300" wrap>
                  <Badge tone="attention">{t("single_choice_desc")}</Badge>
                  <Badge tone="success">{t("multi_choice_desc")}</Badge>
                  <Badge tone="warning">{t("conditional_desc", { yes: condLabels.yes, no: condLabels.no })}</Badge>
                  <Badge tone="info">{t("textbox_desc")}</Badge>
                </InlineStack>

                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="bodySm" fontWeight="bold">{t("selected_of", { sel: selectedSuggestions.length, total: aiSuggestions.length })}</Text>
                  <Button size="slim" variant="tertiary" onClick={handleSelectAll}>
                    {selectedSuggestions.length === aiSuggestions.length ? t("deselect_all") : t("select_all")}
                  </Button>
                </InlineStack>

                <BlockStack gap="300">
                  {aiSuggestions.map((suggestion, idx) => {
                    const isSel = selectedSuggestions.includes(idx);
                    const ti    = getTypeInfo(suggestion.type);
                    return (
                      <div key={idx} className={`ai-card ${isSel ? "selected" : ""}`} onClick={() => handleToggleSuggestion(idx)}>
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <div style={{ width: 20, height: 20, borderRadius: "50%", backgroundColor: isSel ? "#008060" : "#e1e3e5", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: "bold", flexShrink: 0 }}>
                              {idx + 1}
                            </div>
                            <Badge tone={ti.badge}>{ti.emoji} {ti.label}</Badge>
                          </InlineStack>
                          <Text variant="bodyMd" fontWeight={isSel ? "semibold" : "regular"}>{suggestion.text}</Text>
                          {suggestion.type === "conditional" ? (
                            <InlineStack gap="200"><Badge tone="success">{condLabels.yes}</Badge><Badge tone="critical">{condLabels.no}</Badge></InlineStack>
                          ) : suggestion.type !== "textBox" && suggestion.options?.length > 0 ? (
                            <InlineStack gap="200" wrap>{suggestion.options.map((opt, oi) => <Badge key={oi} tone="subdued">{typeof opt === "string" ? opt : opt.text}</Badge>)}</InlineStack>
                          ) : suggestion.type === "textBox" ? (
                            <Text variant="bodySm" tone="subdued">{t("customer_will_type")}</Text>
                          ) : null}
                        </BlockStack>
                      </div>
                    );
                  })}
                </BlockStack>

                {questionLimit !== null && selectedSuggestions.length > (questionLimit - questions.length) && (
                  <Banner tone="warning">
                    <Text variant="bodyMd">{t("can_only_add", { n: Math.max(0, questionLimit - questions.length), plan: PLAN_LABELS[planName] })}</Text>
                  </Banner>
                )}
              </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Validation Modal ── */}
      <Modal open={showValidationModal} onClose={() => setShowValidationModal(false)} title={t("validation_error")}
        primaryAction={{ content: t("got_it"), onAction: () => setShowValidationModal(false) }}>
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="critical">
              <BlockStack gap="200">
                <Text variant="bodyMd" fontWeight="bold">{t("fix_error")}</Text>
                <Text variant="bodyMd">{validationError}</Text>
              </BlockStack>
            </Banner>
            <Text variant="bodySm" tone="subdued">{t("try_again")}</Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
