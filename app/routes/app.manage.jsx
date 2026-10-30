// app/routes/app.manage.jsx

import {
  Card, Page, IndexTable, TextField, Select, Text, InlineStack, Box, BlockStack,
  Modal, Button, Badge, DatePicker, Pagination, EmptyState, Banner, Divider,
  Tooltip, Spinner, SkeletonBodyText, SkeletonDisplayText,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { Form, json, useLoaderData, useNavigation, useSubmit, useSearchParams, useNavigate } from "@remix-run/react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { authenticate } from "../shopify.server";
import { getT, LANG_KEY_TO_ISO } from "../utils/translations";

const DASHBOARD_CSS = `
  .app-shell:before {
    content: "";
    position: absolute;
    z-index: -2;
    inset: -100px -60px -80px;
    background: radial-gradient(ellipse 320px 200px at 3% 12%, #b5d7ff 0%, transparent 100%), radial-gradient(ellipse 380px 260px at 96% 10%, #c1e2ff 0%, transparent 100%), radial-gradient(ellipse 350px 320px at 100% 78%, #dce0ff 0%, transparent 100%), linear-gradient(120deg, #e5f4ff, #f0faff 48%, #e3f2ff);
}
.app-shell:after {
        content: "";
    position: absolute;
    z-index: -1;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(#a5d2ff 2px, transparent 2px);
    background-size: 18px 18px;
    mask-image: linear-gradient(90deg, #000 0%, transparent 9%, transparent 88%, #000 100%);
    opacity: .5;
}
.app-shell {
    position: relative;
    isolation: isolate;
    color: #07144f;
    font-family: Inter, Arial, sans-serif;
    padding: 16px 12px 32px;
    min-height: 900px;
}
.fb-dashboard {
  position: relative;
  isolation: isolate;
  color: #07144f;
  font-family: Inter, Arial, sans-serif;
  padding: 16px 12px 32px;
  min-height: 900px;
}

// .fb-dashboard:before {
//   content: "";
//   position: absolute;
//   z-index: -2;
//   inset: -100px -60px -80px;
//   background:
//     radial-gradient(ellipse 320px 200px at 3% 12%, #b5d7ff 0%, transparent 100%),
//     radial-gradient(ellipse 380px 260px at 96% 10%, #c1e2ff 0%, transparent 100%),
//     radial-gradient(ellipse 350px 320px at 100% 78%, #dce0ff 0%, transparent 100%),
//     linear-gradient(120deg, #e5f4ff, #f0faff 48%, #e3f2ff);
// }

// .fb-dashboard:after {
//   content: "";
//   position: absolute;
//   z-index: -1;
//   inset: 0;
//   pointer-events: none;
//   background-image: radial-gradient(#a5d2ff 2px, transparent 2px);
//   background-size: 18px 18px;
//   mask-image: linear-gradient(90deg, #000 0%, transparent 9%, transparent 88%, #000 100%);
//   opacity: .5;
// }

/* HERO SECTION */

.fb-hero {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 250px;
    position: relative;
    overflow: hidden;
    padding: 0 0px 15px;
}

.fb-hero-copy {
  z-index: 2;
  max-width: 74%;
}

.fb-heading-line {
  display: flex;
  align-items: center;
  gap: 22px;
}

.fb-heading-line h1 {
  font-size: clamp(28px, 3vw, 44px);
  line-height: 1.13;
  letter-spacing: -1.6px;
  font-weight: 800;
  color: #06134d;
  margin: 0;
}

.fb-heading-line h1 span {
  color: #1167f7;
}

.fb-back {
  height: 54px;
  width: 54px;
  border-radius: 13px;
  border: 1px solid #c4ddff;
  background: #ffffffb8;
  color: #0866f6;
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: 0 6px 20px #bad8fc55;
  flex-shrink: 0;
}

.fb-back svg {
  width: 25px;
  height: 25px;
}

.fb-pink-rays {
  font-size: 36px;
  color: #ff269b;
  align-self: flex-start;
}

.fb-hero-copy > p {
  font-size: 15px;
  color: #4b6199;
  margin: 8px 0 22px 78px;
}

/* STORE INFORMATION BAR */

.fb-store-bar {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 12px 20px;
  min-height: 62px;
  background: #ffffffc9;
  border: 1px solid #d4e6ff;
  border-radius: 14px;
  box-shadow: 0 5px 18px #bed8f333;
  color: #435c93;
  font-size: 14px;
  flex-wrap: wrap;
}

.fb-store-bar strong {
  color: #09164d;
}

.fb-separator {
  color: #869bc2;
}

// .fb-shopify-mark {
//   display: grid;
//   place-items: center;
//   width: 39px;
//   height: 42px;
//   transform: rotate(-9deg);
//   border-radius: 8px 8px 5px 5px;
//   background: linear-gradient(140deg, #a4cf54, #559c20);
//   font-size: 25px;
//   color: white;
//   font-weight: 900;
//   font-family: Georgia, serif;
//   box-shadow: inset -8px -4px #347e1944;
// }

/* HERO ARTWORK */

.fb-hero-art {
  position: absolute;
  right: 30px;
  top: 5px;
  width: 340px;
  height: 200px;
}

.fb-art-sheet {
  position: absolute;
  right: 80px;
  top: 25px;
  width: 195px;
  height: 175px;
  background: linear-gradient(140deg, #fff, #e8f1ff);
  border: 9px solid #ffffffa8;
  transform: rotate(8deg);
  border-radius: 16px;
  box-shadow: 12px 12px 0 #3c98ff, 0 14px 24px #6c9fea66;
  padding: 35px 30px;
}

.fb-art-sheet i {
  display: block;
  height: 11px;
  margin-bottom: 15px;
  background: linear-gradient(90deg, #77c9ff, #c1d8f8);
  border-radius: 4px;
}

.fb-art-sheet i:nth-child(2) {
  width: 85%;
}

.fb-art-sheet i:nth-child(3) {
  width: 95%;
}

.fb-art-sheet i:nth-child(4) {
  width: 60%;
}

.fb-art-chat {
  position: absolute;
  left: 20px;
  top: 18px;
  width: 105px;
  height: 80px;
  border-radius: 18px;
  background: linear-gradient(140deg, #ff75cb, #f71583);
  box-shadow: 0 9px 12px #f83a9b55;
  color: #fff;
  font-size: 40px;
  letter-spacing: 3px;
  text-align: center;
  line-height: 50px;
  transform: rotate(-10deg);
  z-index: 2;
}

.fb-art-chat:after {
  content: "";
  position: absolute;
  bottom: -15px;
  left: 25px;
  border-width: 20px 20px 0 0;
  border-style: solid;
  border-color: #f71583 transparent transparent transparent;
}

.fb-art-user {
  position: absolute;
  right: 5px;
  bottom: 7px;
  width: 112px;
  height: 112px;
  border-radius: 50%;
  background: linear-gradient(140deg, #5bc5ff, #0961ef);
  border: 2px solid #2780ff;
  box-shadow: 0 9px 17px #5b9eff77;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
}

.fb-user-head {
  height: 30px;
  width: 30px;
  border-radius: 50%;
  background: #fff;
}

.fb-user-body {
  height: 34px;
  width: 55px;
  border-radius: 30px 30px 13px 13px;
  background: #fff;
}

.fb-art-spark {
  position: absolute;
  right: 0;
  top: 0;
  font-size: 40px;
  color: #ffcd00;
}

.fb-art-dots {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(#9cccff 2px, transparent 2px);
  background-size: 18px 18px;
  opacity: .6;
  mask-image: linear-gradient(90deg, #000, transparent 25%, transparent 80%, #000);
}

/* PANELS */

.fb-panel {
  background: #ffffffee;
  border: 1px solid #d8e9ff;
  border-radius: 18px;
  box-shadow: 0 8px 30px #b5d2f122;
  margin-bottom: 20px;
  padding: 20px 25px;
}

.fb-panel h2 {
  font-size: 22px;
  letter-spacing: -.6px;
  font-weight: 800;
  color: #07134c;
  margin: 0 0 16px;
}

/* STATISTICS */

.fb-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.fb-stat {
  min-height: 133px;
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 22px;
  padding: 16px 14px;
  border: 1px solid #e0ebfa;
  border-radius: 17px;
  overflow: hidden;
  background: linear-gradient(145deg, #fff, #f9fcff);
}

.fb-stat-icon {
  height: 70px;
  width: 70px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--bubble);
  color: var(--accent);
}

.fb-stat-icon svg {
  width: 39px;
  height: 39px;
}

.fb-stat-blue {
  --accent: #177bff;
  --bubble: #d7e9ff;
}

.fb-stat-green {
  --accent: #08bb87;
  --bubble: #d5f7ec;
}

.fb-stat-purple {
  --accent: #9a21ee;
  --bubble: #ecddff;
}

.fb-stat-pink {
  --accent: #f20e9d;
  --bubble: #ffe0f3;
}

.fb-stat-text {
  position: relative;
  z-index: 2;
  padding-top: 8px;
}

.fb-stat-label {
  font-size: 15px;
  color: #435a91;
  white-space: nowrap;
}

.fb-stat-number {
  font-size: 39px;
  line-height: 1.2;
  font-weight: 800;
  color: #07134c;
  margin-top: 6px;
}

.fb-stat-percent {
  color: #5066a0;
  font-size: 14px;
}

.fb-stat-wave {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 35%;
  height: 80px;
  color: var(--accent);
}

/* FILTERS AND SEARCH */

.fb-panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e4effc;
  margin-bottom: 14px;
}

.fb-panel-title h2 {
  margin-bottom: 13px;
}

.fb-filter-grid {
  display: grid;
  grid-template-columns: 2.1fr 1fr 1fr;
  gap: 24px;
  align-items: end;
}

.fb-filter-grid .Polaris-Labelled__LabelWrapper {
  margin-bottom: 8px;
}

.fb-filter-grid .Polaris-Label__Text {
  font-size: 14px;
  color: #40578d;
  font-weight: 600;
}

.fb-filter-grid .Polaris-TextField,
.fb-filter-grid .Polaris-Select {
  min-height: 48px;
}

.fb-filter-grid .Polaris-TextField__Backdrop,
.fb-filter-grid .Polaris-Select__Backdrop {
  border-radius: 10px;
  border-color: #b7c9e8;
}

.fb-input-icon {
  font-size: 27px;
  line-height: 20px;
  color: #5068a1;
}

/* RESULTS PANEL */

.fb-results-panel {
  padding: 0;
  overflow: hidden;
  min-height: 320px;
}

/* EMPTY STATE */

.fb-empty {
  min-height: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 30px;
}

.fb-empty-illustration {
  width: 190px;
  height: 155px;
  position: relative;
  margin-bottom: 8px;
}

.fb-empty-halo {
  position: absolute;
  width: 160px;
  height: 150px;
  border-radius: 50%;
  background: #eaf1ff;
  top: 0;
  left: 16px;
}

.fb-empty-paper {
  position: absolute;
  top: 15px;
  left: 52px;
  width: 110px;
  height: 138px;
  background: linear-gradient(145deg, #fff, #f7f9ff);
  border: 1px solid #e4ebf7;
  box-shadow: 8px 7px 0 #d7e5ff, 0 5px 20px #b2c4df88;
  border-radius: 5px;
  padding: 15px;
}

.fb-empty-thumbnail {
  display: block;
  height: 35px;
  width: 35px;
  background: linear-gradient(135deg, #ffcc71 50%, #f6a52e 50%);
  border-radius: 2px;
  margin-bottom: 12px;
}

.fb-empty-paper i {
  display: block;
  height: 5px;
  border-radius: 5px;
  background: #e0e9f8;
  margin-bottom: 7px;
}

.fb-empty-paper i:last-child {
  width: 70%;
}

.fb-empty-rays {
  position: absolute;
  top: 8px;
  left: 4px;
  font-size: 40px;
  color: #0879ff;
}

.fb-empty h3 {
  font-size: 21px;
  font-weight: 800;
  color: #07134c;
  margin: 8px 0 8px;
}

.fb-empty p {
  font-size: 15px;
  color: #53699e;
  max-width: 470px;
  line-height: 1.5;
  margin: 0 0 12px;
}

/* POLARIS TABLE */

.fb-results-panel .Polaris-IndexTable {
  background: white;
}

.fb-results-panel .Polaris-IndexTable__TableHeading {
  background: #f5f9ff;
}

/* TABLET RESPONSIVE */

@media (max-width: 1050px) {
  .fb-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .fb-hero-art {
    opacity: .55;
    right: 0;
  }

  .fb-hero-copy {
    max-width: 85%;
  }

  .fb-filter-grid {
    gap: 12px;
  }
}

/* MOBILE RESPONSIVE */

@media (max-width: 680px) {
  .fb-dashboard {
    padding: 0 0 25px;
  }

  .fb-hero {
    padding: 20px 8px 15px;
    min-height: 210px;
  }

  .fb-heading-line {
    gap: 10px;
  }

  .fb-heading-line h1 {
    font-size: 26px;
    letter-spacing: -.8px;
  }

  .fb-back {
    width: 40px;
    height: 40px;
  }

  .fb-hero-copy {
    max-width: 100%;
  }

  .fb-hero-copy > p {
    margin: 12px 0 18px 50px;
    font-size: 12px;
  }

  .fb-hero-art {
    opacity: .16;
    right: -120px;
  }

  .fb-store-bar {
    font-size: 12px;
    gap: 8px;
    padding: 10px;
  }

  .fb-panel {
    padding: 16px 13px;
    border-radius: 14px;
  }

  .fb-panel h2 {
    font-size: 19px;
  }

  .fb-stat-grid {
    gap: 10px;
  }

  .fb-stat {
    min-height: 116px;
    padding: 12px 9px;
    gap: 9px;
  }

  .fb-stat-icon {
    width: 44px;
    height: 44px;
  }

  .fb-stat-icon svg {
    width: 28px;
    height: 28px;
  }

  .fb-stat-label {
    font-size: 11px;
    white-space: normal;
  }

  .fb-stat-number {
    font-size: 28px;
  }

  .fb-stat-percent {
    font-size: 12px;
  }

  .fb-filter-grid {
    grid-template-columns: 1fr;
    gap: 13px;
  }

  .fb-empty {
    min-height: 310px;
  }

  .fb-pink-rays {
    display: none;
  }
}
`;


const prisma = new PrismaClient();
const ITEMS_PER_PAGE = 10;

const LANGUAGES_DROPDOWN = [
  { label: "Default (English)", value: "default" },
  { label: "French", value: "french" },
  { label: "Spanish", value: "spanish" },
  { label: "Italian", value: "italian" },
  { label: "German", value: "german" },
];
   <style>{`
  

    `}</style>
export const loader = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;
    const response = await admin.graphql(`#graphql
        query { shop { url } }`);
    const data = await response.json();
    if (!data.data?.shop?.url) throw new Error("Unable to fetch shop information");
    const url = data.data.shop.url;
    const shopDomain = url.replace("https://", "");
    const feedbacks = await prisma.apiProxyData.findMany({ where: { shop }, orderBy: { createdAt: "desc" } });
    const surveyData = await prisma.survey.findMany({ where: { shop }, include: { questions: true } });
    return json({ feedbacks, surveyData, shop, shopDomain, success: true });
  } catch (error) {
    console.error("Loader error:", error);
    return json({ feedbacks: [], surveyData: [], shop: null, shopDomain: null, success: false, error: error.message }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const id = formData.get("id");
    const actionType = formData.get("_action");
    if (!id) return json({ success: false, error: "Missing feedback ID" }, { status: 400 });
    if (actionType === "delete") {
      const feedback = await prisma.apiProxyData.findFirst({ where: { id: parseInt(id, 10), shop } });
      if (!feedback) return json({ success: false, error: "Feedback not found or access denied" }, { status: 403 });
      await prisma.apiProxyData.delete({ where: { id: parseInt(id, 10) } });
      return json({ success: true, message: "Feedback deleted successfully" });
    }
    return json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Action error:", error);
    return json({ success: false, error: "Failed to delete feedback" }, { status: 500 });
  }
};

const formatDate = (dateString) =>
  new Date(dateString).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
const formatTime = (dateString) =>
  new Date(dateString).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const safeJSONParse = (jsonString, fallback = []) => {
  try { return JSON.parse(jsonString); } catch { return fallback; }
};

export default function Manage() {
  const { feedbacks = [], surveyData = [], shop, shopDomain, error } = useLoaderData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLoading = navigation.state === "loading" || navigation.state === "submitting";

  // ── Language from URL ──────────────────────────────────────
  const uiLanguage = "default";
  const uiLangIso = LANG_KEY_TO_ISO[uiLanguage] ?? "en";
  const t = getT(uiLangIso);

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
        if (value === "default") prev.delete("lang");
        else prev.set("lang", value);
        return prev;
      });
    },
    [setSearchParams],
  );

  // ── Translated dropdown options ────────────────────────────
  const SORT_OPTIONS = useMemo(() => [
    { label: t("fb_sort_newest"), value: "date-desc" },
    { label: t("fb_sort_oldest"), value: "date-asc" },
    { label: t("fb_sort_email_az"), value: "email-asc" },
    { label: t("fb_sort_email_za"), value: "email-desc" },
  ], [t]);

  const STATUS_FILTER_OPTIONS = useMemo(() => [
    { label: t("fb_status_all"), value: "" },
    { label: t("fb_status_completed"), value: "complete" },
    { label: t("fb_status_not_submitted"), value: "incomplete" },
    { label: t("fb_status_partial"), value: "partially" },
  ], [t]);

  const EXPORT_FORMAT_OPTIONS = useMemo(() => [
    { label: t("fb_export_choose"), value: "", disabled: true },
    { label: t("fb_export_excel"), value: "excel" },
    { label: t("fb_export_csv"), value: "csv" },
    { label: t("fb_export_json"), value: "json" },
  ], [t]);

  const getQuizStatus = useCallback((answers, total) => {
    const count = answers.length;
    if (count === 0) return { label: t("fb_status_not_submitted_label"), tone: "critical", progress: "incomplete" };
    if (total > 0 && count >= total) return { label: t("fb_status_completed_label"), tone: "success", progress: "complete" };
    return { label: t("fb_status_partial_label"), tone: "warning", progress: "partiallyComplete" };
  }, [t]);

  // ── State ──────────────────────────────────────────────────
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("");
  const [selectedDates, setSelectedDates] = useState({
    start: new Date(new Date().setMonth(new Date().getMonth() - 1)), end: new Date(),
  });
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [quizStatusFilter, setQuizStatusFilter] = useState("");
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const processedFeedbacks = useMemo(
    () => feedbacks.map((feedback, index) => ({
      sr: index + 1, id: feedback.id.toString(), email: feedback.email || "N/A",
      date: formatDate(feedback.createdAt), time: formatTime(feedback.createdAt),
      dateObj: new Date(feedback.createdAt), answers: safeJSONParse(feedback.answers), rawFeedback: feedback,
    })),
    [feedbacks],
  );

  const totalQuestions = useMemo(() => surveyData[0]?.questions?.length || 0, [surveyData]);

  const filteredFeedbacks = useMemo(() => {
    let result = [...processedFeedbacks];
    if (searchTerm) {
      const sl = searchTerm.toLowerCase();
      result = result.filter((f) => f.email.toLowerCase().includes(sl));
    }
    if (quizStatusFilter) {
      result = result.filter(({ answers }) => {
        const c = answers.length;
        if (quizStatusFilter === "complete") return totalQuestions > 0 && c >= totalQuestions;
        if (quizStatusFilter === "incomplete") return c === 0;
        if (quizStatusFilter === "partially") return c > 0 && c < totalQuestions;
        return true;
      });
    }
    result.sort((a, b) => {
      if (sortField === "email") { const cmp = a.email.localeCompare(b.email); return sortOrder === "asc" ? cmp : -cmp; }
      const cmp = a.dateObj - b.dateObj; return sortOrder === "asc" ? cmp : -cmp;
    });
    return result;
  }, [processedFeedbacks, searchTerm, sortField, sortOrder, quizStatusFilter, totalQuestions]);

  const statistics = useMemo(() => {
    const total = processedFeedbacks.length;
    const completed = processedFeedbacks.filter((f) => totalQuestions > 0 && f.answers.length >= totalQuestions).length;
    const partial = processedFeedbacks.filter((f) => f.answers.length > 0 && f.answers.length < totalQuestions).length;
    const notSubmitted = processedFeedbacks.filter((f) => f.answers.length === 0).length;
    return { total, completed, partial, notSubmitted };
  }, [processedFeedbacks, totalQuestions]);

  const totalPages = Math.ceil(filteredFeedbacks.length / ITEMS_PER_PAGE);
  const paginatedFeedbacks = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredFeedbacks.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredFeedbacks, currentPage]);

  const handleMonthChange = useCallback((m, y) => { setMonth(m); setYear(y); }, []);
  const handleSearchChange = useCallback((v) => { setSearchTerm(v); setCurrentPage(1); }, []);
  const handleSortChange = useCallback((v) => { const [f, o] = v.split("-"); setSortField(f); setSortOrder(o); setCurrentPage(1); }, []);
  const handleQuizStatusChange = useCallback((v) => { setQuizStatusFilter(v); setCurrentPage(1); }, []);
  const clearAllFilters = useCallback(() => { setSearchTerm(""); setQuizStatusFilter(""); setCurrentPage(1); }, []);
  const handleViewFeedback = useCallback((fb) => { setSelectedFeedback(fb); setIsViewModalOpen(true); }, []);
  const handleCloseViewModal = useCallback(() => { setIsViewModalOpen(false); setSelectedFeedback(null); }, []);
  const handleDeleteClick = useCallback((id) => setDeleteConfirmId(id), []);
  const handleDeleteConfirm = useCallback(() => {
    if (deleteConfirmId) {
      const fd = new FormData(); fd.append("id", deleteConfirmId); fd.append("_action", "delete");
      submit(fd, { method: "post" }); setDeleteConfirmId(null);
    }
  }, [deleteConfirmId, submit]);

  const handleExport = useCallback(() => {
    if (!exportFormat) return;
    const dataToExport = filteredFeedbacks
      .filter((f) => f.dateObj >= selectedDates.start && f.dateObj <= selectedDates.end)
      .map((f) => ({
        ID: f.id, Email: f.email, "Submitted Date": f.date, "Submitted Time": f.time,
        Status: getQuizStatus(f.answers, totalQuestions).label, "Total Answers": f.answers.length,
        "Total Questions": totalQuestions,
        Answers: f.answers.map((a) => `${a.questionTitle}: ${a.answer}`).join("; "),
      }));
    try {
      if (exportFormat === "excel") {
        const ws = XLSX.utils.json_to_sheet(dataToExport); const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Feedbacks");
        ws["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 60 }];
        XLSX.writeFile(wb, `feedbacks_${shop}_${Date.now()}.xlsx`);
      } else {
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const content = exportFormat === "csv" ? XLSX.utils.sheet_to_csv(ws) : JSON.stringify(dataToExport, null, 2);
        const type = exportFormat === "csv" ? "text/csv;charset=utf-8;" : "application/json";
        const blob = new Blob([content], { type }); const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url;
        link.download = `feedbacks_${shop}_${Date.now()}.${exportFormat === "csv" ? "csv" : "json"}`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link); window.URL.revokeObjectURL(url);
      }
      setIsExportModalOpen(false); setExportFormat("");
    } catch (err) { console.error("Export error:", err); alert("Failed to export."); }
  }, [filteredFeedbacks, selectedDates, exportFormat, totalQuestions, shop, getQuizStatus]);

  const activeFilters = useMemo(() => {
    const f = []; if (searchTerm) f.push("search"); if (quizStatusFilter) f.push("status"); return f;
  }, [searchTerm, quizStatusFilter]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, quizStatusFilter]);

  if (error) {
    return (
      <Page title={t("fb_title")}>
        <Banner tone="critical"><p>{t("fb_load_error", { error })}</p></Banner>
      </Page>
    );
  }

  if (isLoading && feedbacks.length === 0) {
    return (
      <Page title={t("fb_title")}>
        <BlockStack gap="500">
          <Card><SkeletonDisplayText size="small" /><Box paddingBlockStart="400"><SkeletonBodyText lines={3} /></Box></Card>
          <Card><SkeletonBodyText lines={5} /></Card>
        </BlockStack>
      </Page>
    );
  }

  const statCards = [
    { key: "total", label: t("fb_total"), count: statistics.total, color: "blue", icon: "message" },
    { key: "completed", label: t("fb_completed"), count: statistics.completed, color: "green", icon: "check" },
    { key: "partial", label: t("fb_partial"), count: statistics.partial, color: "purple", icon: "pie" },
    { key: "notSubmitted", label: t("fb_not_submitted"), count: statistics.notSubmitted, color: "pink", icon: "ban" },
  ];

  return (
    <Page fullWidth>
      <style dangerouslySetInnerHTML={{ __html: DASHBOARD_CSS }} />
      <div className="fb-dashboard">
        <div className="fb-hero">
          <div className="fb-hero-copy">
            <div className="fb-heading-line">
              <button className="fb-back" type="button" onClick={() => navigate(withLang("/app/"))} aria-label={t("fb_back")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m14 5-7 7 7 7M7 12h14" /></svg>
              </button>
              <h1>User Feedback <span>Dashboard</span></h1><span className="fb-pink-rays" aria-hidden="true">✦</span>
            </div>
            <p>{t("fb_subtitle", { shop: shop || "" })}</p>
            <div className="fb-store-bar">
              <span className="fb-shopify-mark" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs><linearGradient id="shopGreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#9AE923"/><stop offset="100%" stop-color="#29B83B"/></linearGradient><linearGradient id="shopSide" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#258D26"/><stop offset="100%" stop-color="#126A27"/></linearGradient></defs><path d="M19 22V15C19 7 25 3 32 3s13 4 13 12v7" fill="none" stroke="#58C923" stroke-width="4.5" stroke-linecap="round"/><path d="M12 19L47 15L57 23L58 54L41 61L8 54Z" fill="url(#shopSide)"/><path d="M12 19L47 15L41 61L8 54Z" fill="url(#shopGreen)"/><path d="M47 15L57 23L58 54L41 61Z" fill="url(#shopSide)"/><text x="28" y="45" fill="#FFFFFF" font-size="29" font-weight="900" text-anchor="middle" font-family="Arial" transform="rotate(-5 28 38)">S</text></svg></span>
              <strong>{t("store_label")}: {shop}</strong>
              {shopDomain && <><span className="fb-separator">|</span><span>{t("fb_domain")}: {shopDomain}</span></>}
            </div>
          </div>
          <div className="fb-hero-art" aria-hidden="true">
            <span className="fb-art-dots" />
            <div className="fb-art-sheet"><i /><i /><i /><i /></div>
            <div className="fb-art-chat">•••</div>
            <div className="fb-art-user"><span className="fb-user-head" /><span className="fb-user-body" /></div>
            <span className="fb-art-spark">✦</span>
          </div>
        </div>
        <div className="fb-panel fb-stats-panel">
          <h2>{t("fb_summary")}</h2>
          <div className="fb-stat-grid">
            {statCards.map((item) => (
              <div key={item.key} className={`fb-stat fb-stat-${item.color}`}>
                <span className="fb-stat-icon" aria-hidden="true">
                  {item.icon === "message" ? <svg viewBox="0 0 40 40"><path d="M8 8h24v20H17l-8 6v-6H8z" fill="currentColor" /><path d="M14 16h12M14 21h8" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg> : item.icon === "check" ? <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="currentColor" /><path d="m12 20 5 5 11-12" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg> : item.icon === "pie" ? <svg viewBox="0 0 40 40"><path d="M18 5a15 15 0 1 0 17 17H18z" fill="currentColor" /><path d="M22 4v14h14A15 15 0 0 0 22 4" fill="currentColor" opacity=".65" /></svg> : <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="4" fill="none" /><path d="M10 10 30 30" stroke="currentColor" strokeWidth="4" /></svg>}
                </span>
                <div className="fb-stat-text"><div className="fb-stat-label">{item.label}</div><div className="fb-stat-number">{item.count}</div><div className="fb-stat-percent">{statistics.total ? Math.round(item.count / statistics.total * 100) : 0}%</div></div>
                <svg className="fb-stat-wave" viewBox="0 0 120 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 76C18 77 22 45 40 53S60 62 76 34 100 13 120 22V80H0Z" fill="currentColor" opacity=".13" /><path d="M0 76C18 77 22 45 40 53S60 62 76 34 100 13 120 22" fill="none" stroke="currentColor" strokeWidth="2" opacity=".6" /></svg>
              </div>
            ))}
          </div>
        </div>
        {/* ── Active Filters ── */}
        {activeFilters.length > 0 && (
          <Banner tone="info" onDismiss={clearAllFilters}>
            <InlineStack gap="200" blockAlign="center" wrap={false}>

              <Text as="p" fontWeight="semibold">{t("fb_filters_applied")}</Text>
              <Text as="p">{t("fb_showing", { filtered: filteredFeedbacks.length, total: processedFeedbacks.length })}</Text>
            </InlineStack>
          </Banner>
        )}

        <div className="fb-panel fb-filters-panel">
          <div className="fb-panel-title"><h2>{t("fb_filters")}</h2>{activeFilters.length > 0 && <Button onClick={clearAllFilters} size="slim" variant="plain">{t("fb_clear_filters")}</Button>}</div>
          <div className="fb-filter-grid">
            <div className="fb-search-field"><TextField label={t("fb_search")} value={searchTerm} onChange={handleSearchChange} placeholder={t("fb_search_placeholder")} autoComplete="off" clearButton onClearButtonClick={() => handleSearchChange("")} prefix={<span className="fb-input-icon">⌕</span>} /></div>
            <div><Select label={t("fb_sort_by")} options={SORT_OPTIONS} onChange={handleSortChange} value={`${sortField}-${sortOrder}`} /></div>
            <div><Select label={t("fb_filter_status")} options={STATUS_FILTER_OPTIONS} value={quizStatusFilter} onChange={handleQuizStatusChange} /></div>
          </div>
        </div>

        {/* ── Feedback Table ── */}
        <div className="fb-panel fb-results-panel">
          {paginatedFeedbacks.length === 0 ? (
            <div className="fb-empty">
              <div className="fb-empty-illustration" aria-hidden="true"><span className="fb-empty-halo" /><div className="fb-empty-paper"><span className="fb-empty-thumbnail" /><i /><i /><i /><i /><i /></div><span className="fb-empty-rays">✦</span></div>
              <h3>{activeFilters.length > 0 ? t("fb_no_match") : t("fb_no_found")}</h3>
              <p>{activeFilters.length > 0 ? t("fb_no_match_desc") : t("fb_no_found_desc")}</p>
              {activeFilters.length > 0 && <Button onClick={clearAllFilters}>{t("fb_clear_filters")}</Button>}
            </div>
          ) : (
            <BlockStack>
              <IndexTable
                resourceName={{ singular: t("fb_feedback_singular"), plural: t("fb_feedback_plural") }}
                itemCount={filteredFeedbacks.length}
                headings={[
                  { title: t("fb_col_hash") }, { title: t("fb_col_email") }, { title: t("fb_col_date") },
                  { title: t("fb_col_time") }, { title: t("fb_col_status") }, { title: t("fb_col_progress") },
                  { title: t("fb_col_actions"), alignment: "center" },
                ]}
                selectable={false} loading={isLoading}
              >
                {paginatedFeedbacks.map(({ sr, id, email, date, time, answers, rawFeedback }, index) => {
                  const status = getQuizStatus(answers, totalQuestions);
                  return (
                    <IndexTable.Row id={id} key={id} position={index}>
                      <IndexTable.Cell><Text as="span" fontWeight="semibold" tone="subdued">{sr}</Text></IndexTable.Cell>
                      <IndexTable.Cell><Text as="span" fontWeight="medium">{email}</Text></IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="100" blockAlign="center">
                          <Text as="span">{date}</Text>
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell><Text as="span" tone="subdued">{time}</Text></IndexTable.Cell>
                      <IndexTable.Cell><Badge progress={status.progress} tone={status.tone}>{status.label}</Badge></IndexTable.Cell>
                      <IndexTable.Cell><Text as="span" variant="bodySm" tone="subdued">{t("fb_answers_count", { count: answers.length, total: totalQuestions })}</Text></IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack align="center" gap="200">
                          <Tooltip content={t("fb_view_details")}>
                            <Button onClick={() => handleViewFeedback(rawFeedback)} variant="primary" size="slim">{t("fb_view")}</Button>
                          </Tooltip>
                          <Tooltip content={t("fb_delete_tooltip")}>
                            <Button onClick={() => handleDeleteClick(id)} tone="critical" variant="plain" size="slim" />
                          </Tooltip>
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>

              {totalPages > 1 && (
                <Box padding="400" borderColor="border-subdued" borderBlockStartWidth="025">
                  <InlineStack align="center" gap="400">
                    <Pagination hasPrevious={currentPage > 1} hasNext={currentPage < totalPages} onPrevious={() => setCurrentPage(currentPage - 1)} onNext={() => setCurrentPage(currentPage + 1)} />
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t("fb_page_info", { current: currentPage, total: totalPages, count: filteredFeedbacks.length, label: filteredFeedbacks.length === 1 ? t("fb_feedback_singular") : t("fb_feedback_plural") })}
                    </Text>
                  </InlineStack>
                </Box>
              )}
            </BlockStack>
          )}
        </div>
      </div>

      {/* ── View Details Modal ── */}
      {selectedFeedback && (
        <Modal open={isViewModalOpen} onClose={handleCloseViewModal} title={t("fb_details_title")} large>
          <Modal.Section>
            <BlockStack gap="500">
              <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                <InlineStack gap="800" wrap={true}>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">{t("fb_email_label")}</Text>
                    <Text as="p" variant="headingMd" fontWeight="bold">{selectedFeedback.email || "N/A"}</Text>
                  </BlockStack>
                  <Divider borderColor="border" />
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">{t("fb_submitted_on")}</Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {formatDate(selectedFeedback.createdAt)} {t("fb_at")} {formatTime(selectedFeedback.createdAt)}
                    </Text>
                  </BlockStack>
                  <Divider borderColor="border" />
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">{t("fb_status_label")}</Text>
                    <Badge
                      progress={getQuizStatus(safeJSONParse(selectedFeedback.answers), totalQuestions).progress}
                      tone={getQuizStatus(safeJSONParse(selectedFeedback.answers), totalQuestions).tone}
                    >
                      {getQuizStatus(safeJSONParse(selectedFeedback.answers), totalQuestions).label}
                    </Badge>
                  </BlockStack>
                  <Divider borderColor="border" />
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">{t("fb_progress_label")}</Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {t("fb_answers_count", { count: safeJSONParse(selectedFeedback.answers).length, total: totalQuestions })}
                    </Text>
                  </BlockStack>
                </InlineStack>
              </Box>
              <Divider />
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">{t("fb_responses_title")}</Text>
                {safeJSONParse(selectedFeedback.answers).length === 0 ? (
                  <Box padding="600" background="bg-surface-secondary" borderRadius="300">
                    <InlineStack align="center"><Text as="p" tone="subdued" alignment="center">{t("fb_no_responses")}</Text></InlineStack>
                  </Box>
                ) : (
                  safeJSONParse(selectedFeedback.answers).map((ans, idx) => {
                    const mq = surveyData[0]?.questions.find((q) => q.text === ans.questionTitle);
                    const isMulti = mq?.isMultiChoice;
                    const hasMulti = ans.answer?.includes(",");
                    return (
                      <Box key={idx} padding="400" background="bg-surface" borderRadius="300" borderColor="border" borderWidth="025">
                        <BlockStack gap="300">
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone="info">Q{idx + 1}</Badge>
                            <Text as="p" variant="headingSm" fontWeight="bold">{ans.questionTitle}</Text>
                          </InlineStack>
                          {isMulti && hasMulti ? (
                            <BlockStack gap="200">
                              <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">{t("fb_selected_answers")}</Text>
                              <Box paddingInlineStart="400" paddingBlockStart="100">
                                <BlockStack gap="200">
                                  {ans.answer.split(",").map((item, i) => {
                                    const trimmed = item.trim();
                                    const isOther = trimmed.startsWith("other(");
                                    const display = isOther ? trimmed.replace(/^other\((.*?)\)$/, "$1") : trimmed;
                                    return (
                                      <Box key={i} padding="200" background="bg-surface-secondary" borderRadius="200">
                                        <InlineStack gap="200" blockAlign="center">
                                          <Text as="span" variant="bodyMd" fontWeight="medium">{display}</Text>
                                          {isOther && <Badge tone="info">{t("fb_custom_response")}</Badge>}
                                        </InlineStack>
                                      </Box>
                                    );
                                  })}
                                </BlockStack>
                              </Box>
                            </BlockStack>
                          ) : (
                            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                              <InlineStack gap="200" blockAlign="center">
                                <Text as="p" variant="bodyMd">
                                  {ans.answer?.startsWith("other(") ? ans.answer.replace(/^other\((.*?)\)$/, "$1") : ans.answer || t("fb_no_answer")}
                                </Text>
                                {ans.answer?.startsWith("other(") && <Badge tone="info">{t("fb_custom_response")}</Badge>}
                              </InlineStack>
                            </Box>
                          )}
                        </BlockStack>
                      </Box>
                    );
                  })
                )}
              </BlockStack>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {/* ── Export Modal ── */}
      <Modal
        open={isExportModalOpen}
        onClose={() => { setIsExportModalOpen(false); setExportFormat(""); }}
        title={t("fb_export_title")}
        primaryAction={{ content: t("fb_export_btn"), onAction: handleExport, disabled: !exportFormat }}
        secondaryActions={[{ content: t("cancel"), onAction: () => { setIsExportModalOpen(false); setExportFormat(""); } }]}
      >
        <Modal.Section>
          <BlockStack gap="500">
            <Banner tone="info">
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">{t("fb_export_info", { shop })}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{t("fb_export_only")}</Text>
              </BlockStack>
            </Banner>
            <Divider />
            <BlockStack gap="300">
              <Text as="p" variant="headingSm" fontWeight="semibold">{t("fb_export_date_range")}</Text>
              <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                <DatePicker month={month} year={year} onChange={setSelectedDates} onMonthChange={handleMonthChange} selected={selectedDates} allowRange />
              </Box>
              <Text as="p" variant="bodySm" tone="subdued">{t("fb_export_selected", { start: formatDate(selectedDates.start), end: formatDate(selectedDates.end) })}</Text>
            </BlockStack>
            <Divider />
            <BlockStack gap="300">
              <Text as="p" variant="headingSm" fontWeight="semibold">{t("fb_export_format")}</Text>
              <Select label="" options={EXPORT_FORMAT_OPTIONS} value={exportFormat} onChange={setExportFormat} />
            </BlockStack>
            <Divider />
            <Banner tone="info">
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">{t("fb_export_summary")}</Text>
                <Text as="p" variant="bodySm">
                  {t("fb_export_records", { count: filteredFeedbacks.filter((f) => f.dateObj >= selectedDates.start && f.dateObj <= selectedDates.end).length })}
                  {exportFormat && ` ${t("fb_export_in_format", { format: exportFormat.toUpperCase() })}`}
                </Text>
              </BlockStack>
            </Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Delete Confirmation ── */}
      <Modal
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={t("fb_delete_title")}
        primaryAction={{ content: t("fb_delete_btn"), onAction: handleDeleteConfirm, destructive: true, loading: isLoading }}
        secondaryActions={[{ content: t("cancel"), onAction: () => setDeleteConfirmId(null) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p">{t("fb_delete_confirm")}</Text>
            <Banner tone="warning"><p>{t("fb_delete_warning")}</p></Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
