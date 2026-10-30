// app/routes/app.billing.jsx

import { json, redirect }    from "@remix-run/node";
import {
  useLoaderData,
  Form,
  useActionData,
  useNavigate,
  useNavigation,
  useSearchParams,
} from "@remix-run/react";
import { useState, useEffect, useCallback } from "react";
import {
  Button,
  BlockStack,
  Text,
  Box,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import { authenticate }      from "../shopify.server";
import { PLANS, PLAN_KEYS }  from "../config/plans";
import {
  getShopPlanFromDB,
  updateShopPlan,
} from "../utils/planUtils";
import { getT, LANG_KEY_TO_ISO } from "../utils/translations";

const LANGUAGES_DROPDOWN = [
  { label: "Default (English)", value: "default" },
  { label: "French",           value: "french" },
  { label: "Spanish",          value: "spanish" },
  { label: "Italian",          value: "italian" },
  { label: "German",           value: "german" },
];

// ─── UI Plan definitions ───────────────────────────────────────
const PLANS_UI = [
    {
      key: "free", color: "#f6f6f7", popular: false,
      featureKeys: [
        "billing_feat_1_survey",
        "billing_feat_basic_types",
        "billing_feat_email_notif",
        "billing_feat_standard_support",
      ],
    },
    {
      key: "pro", color: "#f0f7ff", popular: true,
      featureKeys: [
        "billing_feat_5_surveys",
        "billing_feat_all_types",
        "billing_feat_priority_support",
        "billing_feat_analytics",
      ],
    },
    {
      key: "advanced", color: "#f3f0ff", popular: false,
      featureKeys: [
        "billing_feat_unlimited",
        "billing_feat_all_types",
        "billing_feat_priority_support",
        "billing_feat_export",
      ],
    },
  ].map((ui) => ({ ...ui, ...PLANS[ui.key] }));

// ─── LOADER ───────────────────────────────────────────────────
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const plan = await getShopPlanFromDB(session.shop);
  return json({ currentPlan: plan.name });
};

// ─── ACTION ───────────────────────────────────────────────────
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop     = session.shop;
  const formData = await request.formData();
  const planKey  = formData.get("plan");
  const returnLang = formData.get("returnLang") || "default";

  if (planKey === "free") {
    await updateShopPlan(shop, "free", null);
    const redirectUrl = returnLang !== "default" ? `/app?lang=${returnLang}` : "/app";
    return redirect(redirectUrl);
  }

  if (!PLAN_KEYS.includes(planKey)) {
    return json({ error: `Invalid plan: "${planKey}"` }, { status: 400 });
  }

  const selectedPlan = PLANS[planKey];

  try {
    const response = await admin.graphql(
      `#graphql
      mutation AppSubscriptionCreate(
        $name:      String!,
        $lineItems: [AppSubscriptionLineItemInput!]!,
        $returnUrl: URL!,
        $trialDays: Int,
        $test:      Boolean
      ) {
        appSubscriptionCreate(
          name:      $name,
          returnUrl: $returnUrl,
          lineItems: $lineItems,
          trialDays: $trialDays,
          test:      $test
        ) {
          userErrors {
            field
            message
          }
          appSubscription {
            id
          }
          confirmationUrl
        }
      }`,
      {
        variables: {
          name: planKey,
          returnUrl: `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/billing-return`,
          trialDays: 0,
          test:      false,
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: {
                    amount:       selectedPlan.price,
                    currencyCode: "USD",
                  },
                  interval: "EVERY_30_DAYS",
                },
              },
            },
          ],
        },
      }
    );

    const responseData = await response.json();
    const { confirmationUrl, userErrors } =
      responseData.data?.appSubscriptionCreate ?? {};

    if (userErrors?.length > 0) {
      console.error("[app.billing] userErrors:", userErrors);
      return json(
        { error: userErrors.map((e) => e.message).join(", ") },
        { status: 400 }
      );
    }

    if (!confirmationUrl) {
      return json(
        { error: "No confirmation URL returned from Shopify." },
        { status: 500 }
      );
    }

    return json({ confirmationUrl });

  } catch (err) {
    console.error("[app.billing] action error:", err);
    return json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
};

const BILLING_CSS = `
.billing-design{position:relative;isolation:isolate;min-height:100vh;padding:35px clamp(15px,5vw,65px) 48px;color:#07144e;font-family:Inter,Arial,sans-serif;overflow:hidden;background:radial-gradient(ellipse at 10% 5%,#d6edff 0,transparent 38%),radial-gradient(ellipse at 95% 75%,#dfe2ff 0,transparent 36%),linear-gradient(125deg,#e8f6ff,#f4fbff 52%,#e2f2ff)}
.billing-design:before{content:"";position:absolute;inset:-120px -100px auto -100px;height:370px;z-index:-1;pointer-events:none;background:radial-gradient(ellipse at 0% 5%,#b9ddff 0,transparent 45%),radial-gradient(ellipse at 95% 0%,#c7e6ff 0,transparent 40%);border-radius:0 0 45% 20%}
.billing-design:after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background-image:radial-gradient(#a5d4ff 2px,transparent 2px);background-size:21px 21px;mask-image:linear-gradient(90deg,#000,transparent 10%,transparent 85%,#000);opacity:.55}
.billing-container{max-width:1200px;margin:auto}.billing-hero{position:relative;min-height:170px;display:flex;align-items:flex-start;justify-content:space-between;gap:25px}.billing-hero-copy{position:relative;z-index:2;padding-top:25px}.billing-title-line{display:flex;align-items:center;gap:24px}.billing-back{display:grid;place-items:center;width:58px;height:58px;flex-shrink:0;border:1px solid #d1e5ff;border-radius:14px;background:#fff;color:#0868f8;cursor:pointer;box-shadow:0 7px 22px #93c5fa35}.billing-title-line h1{margin:0;font-size:clamp(29px,3.1vw,46px);letter-spacing:-1.7px;line-height:1.15;font-weight:800}.billing-title-line h1 span{color:#1672fb}.billing-subtitle{margin:12px 0 0 82px;color:#4c6296;font-size:16px}.billing-rays{position:absolute;left:min(570px,90%);top:8px;color:#ff279e;font-size:38px;transform:rotate(-18deg)}
.billing-art{width:360px;height:190px;position:relative;flex-shrink:0}.billing-art-paper{position:absolute;right:75px;top:8px;width:190px;height:185px;transform:rotate(9deg);background:linear-gradient(130deg,#fff,#e8f2ff);border:7px solid #fff;border-radius:18px;box-shadow:13px 10px 0 #72b8ff,0 14px 28px #86bafa77;padding:40px 25px}.billing-art-paper i{display:block;height:11px;background:linear-gradient(90deg,#61c4ff,#c7dcf7);margin:0 0 15px;border-radius:5px}.billing-art-paper i:nth-child(2){width:80%}.billing-art-paper i:nth-child(3){width:95%}.billing-art-paper i:nth-child(4){width:65%}.billing-art-chat{position:absolute;top:0;left:25px;z-index:2;width:110px;height:80px;border-radius:18px;background:linear-gradient(135deg,#ff6fca,#f30c87);box-shadow:0 12px 20px #f32d9955;transform:rotate(-10deg);display:flex;align-items:center;justify-content:center;color:#fff;font-size:42px;letter-spacing:2px}.billing-art-chat:after{content:"";position:absolute;bottom:-14px;left:22px;border-style:solid;border-width:17px 18px 0 0;border-color:#f30c87 transparent transparent transparent}.billing-art-avatar{position:absolute;right:3px;bottom:0;width:113px;height:113px;border-radius:50%;background:linear-gradient(135deg,#68caff,#0665fa);border:2px solid #2586fa;box-shadow:0 12px 18px #3d92fa66;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:7px}.billing-art-avatar:before{content:"";width:30px;height:30px;background:white;border-radius:50%}.billing-art-avatar:after{content:"";width:58px;height:32px;background:white;border-radius:35px 35px 12px 12px}.billing-art-spark{position:absolute;right:-25px;top:8px;color:#ffce0b;font-size:47px}
.billing-notice{overflow:hidden;border:1px solid #d7e9ff;border-radius:17px;background:#ffffffdc;box-shadow:0 8px 22px #a9cbee30;margin:0 0 28px}.billing-notice-title{background:#b8e1ff;padding:17px 26px;display:flex;align-items:center;gap:17px;font-size:17px;font-weight:750}.billing-info-icon{width:28px;height:28px;border:2px solid #0767f5;border-radius:50%;display:grid;place-items:center;color:#0767f5;font-weight:800;font-size:19px}.billing-notice-desc{padding:17px 26px;color:#41568a;font-size:16px}.billing-alert{margin-bottom:18px}.billing-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.billing-card{display:flex;flex-direction:column;overflow:hidden;background:#fff;border:1px solid #d9e7f9;border-radius:20px;box-shadow:0 12px 28px #a9c8ed30;min-width:0}.billing-card.free{border-color:#8fead2}.billing-card.pro{border-color:#77b7ff}.billing-card.advanced{border-color:#edcaff}.billing-card-top{position:relative;display:flex;align-items:center;gap:20px;min-height:145px;padding:24px 27px;overflow:hidden;border-bottom:1px solid #e4ebf8}.billing-card.free .billing-card-top{background:linear-gradient(125deg,#f1fffb,#effcf8)}.billing-card.pro .billing-card-top{background:linear-gradient(125deg,#eff8ff,#eaf5ff)}.billing-card.advanced .billing-card-top{background:linear-gradient(125deg,#fff3fd,#f8f0ff)}.billing-plan-icon{position:relative;z-index:1;flex-shrink:0;width:82px;height:82px;border-radius:50%;display:grid;place-items:center;background:var(--bubble);color:var(--accent)}.billing-plan-icon svg{width:45px;height:45px}.billing-card.free{--accent:#06c88b;--bubble:#dcfff2}.billing-card.pro{--accent:#1473ff;--bubble:#d8ecff}.billing-card.advanced{--accent:#eb1fb5;--bubble:#ffe1fa}.billing-plan-copy{position:relative;z-index:2}.billing-plan-name{font-size:22px;font-weight:750}.billing-price{font-size:38px;font-weight:850;line-height:1.25;margin-top:6px}.billing-per-month{font-size:14px;color:#506499}.billing-plan-badge{position:absolute;right:20px;top:20px;z-index:3;padding:6px 13px;border-radius:30px;background:var(--bubble);color:var(--accent);font-size:13px;font-weight:700}.billing-wave{position:absolute;right:0;bottom:0;width:42%;height:80px;color:var(--accent);opacity:.38}.billing-card-bottom{padding:23px 26px 22px;display:flex;flex-direction:column;flex:1}.billing-features-title{font-weight:800;font-size:17px;margin-bottom:12px}.billing-features{padding:0;margin:0 0 28px;list-style:none;display:grid;gap:11px}.billing-features li{display:flex;align-items:baseline;gap:15px;color:#293e78;font-size:16px}.billing-features li:before{content:"";width:9px;height:9px;flex-shrink:0;border-radius:50%;background:var(--accent)}.billing-action{margin-top:auto}.billing-action form{margin:0}.billing-btn{display:block;width:100%;min-height:52px;border:0;border-radius:13px;background:linear-gradient(110deg,#246dff,#494cf5);box-shadow:0 7px 14px #4764ef22;color:#fff;font-weight:750;font-size:16px;cursor:pointer}.billing-card.advanced .billing-btn{background:linear-gradient(110deg,#9860fb,#7c42ed)}.billing-btn:disabled{cursor:not-allowed;background:#eef1f5;color:#99a7c2;box-shadow:none}.billing-footer{text-align:center;color:#526a9f;font-size:14px;margin-top:25px}.billing-btn:focus-visible,.billing-back:focus-visible{outline:3px solid #1672fb;outline-offset:3px}
@media(max-width:1050px){.billing-grid{gap:12px}.billing-card-top{padding:20px 15px;gap:10px}.billing-card-bottom{padding:20px 16px}.billing-plan-icon{width:60px;height:60px}.billing-plan-icon svg{width:35px;height:35px}.billing-plan-name{font-size:19px}.billing-price{font-size:32px}.billing-art{opacity:.65}}@media(max-width:750px){.billing-design{padding:20px 13px 35px}.billing-hero{min-height:150px}.billing-hero-copy{padding-top:12px}.billing-title-line{gap:12px}.billing-title-line h1{font-size:28px;letter-spacing:-.7px}.billing-back{width:42px;height:42px}.billing-subtitle{margin-left:54px;font-size:13px;max-width:290px}.billing-rays{display:none}.billing-art{position:absolute;right:-110px;top:0;opacity:.2;pointer-events:none}.billing-notice-title{font-size:14px;padding:13px 16px}.billing-notice-desc{font-size:13px;padding:14px 16px}.billing-grid{grid-template-columns:1fr;gap:17px}.billing-card-top{min-height:135px;padding:20px}.billing-card-bottom{padding:20px}.billing-plan-icon{width:75px;height:75px}.billing-plan-icon svg{width:42px;height:42px}}
`;
// ─── COMPONENT ──────────────────────────────────────────────────
export default function BillingPage() {
  const { currentPlan } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [submittingPlan, setSubmittingPlan] = useState(null);
  const uiLanguage = "default";
  const uiLangIso = LANG_KEY_TO_ISO[uiLanguage] ?? "en";
  const t = getT(uiLangIso);
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.confirmationUrl) {
      window.open(actionData.confirmationUrl, "_top");
    }
  }, [actionData]);

  const icons = {
    free: <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M10 22h28v21H10z" fill="#06c88b"/><path d="M6 18h36v8H6z" fill="#06c88b"/><path d="M24 18c-17 0-17-17-8-14 5 2 8 14 8 14Zm0 0c17 0 17-17 8-14-5 2-8 14-8 14Z" stroke="#06c88b" strokeWidth="4"/><path d="M21 19h6v24h-6z" fill="#b9ffe5"/></svg>,
    pro: <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="m5 16 9 9 10-18 10 18 9-9-4 23H9L5 16Z" fill="#1473ff"/><path d="M10 43h28" stroke="#1473ff" strokeWidth="5" strokeLinecap="round"/><path d="m14 25 10-18 10 18" stroke="#84caff" strokeWidth="2"/></svg>,
    advanced: <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M12 8h24l10 13-22 23L2 21 12 8Z" fill="#ec19b6"/><path d="m12 8 6 13h12l6-13M2 21h44M18 21l6 23 6-23" stroke="#ff9ce6" strokeWidth="2"/></svg>,
  };

  return (
    <div className="billing-design">
      <style dangerouslySetInnerHTML={{ __html: BILLING_CSS }} />
      <div className="billing-container">
        <header className="billing-hero">
          <div className="billing-hero-copy">
            <div className="billing-title-line">
              <button type="button" className="billing-back" aria-label={t("billing_back")} onClick={() => navigate("/app")}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m14 5-7 7 7 7M7 12h14"/></svg>
              </button>
              <h1>Choose Your <span>Plan</span></h1>
            </div>
            <p className="billing-subtitle">{t("billing_subtitle")}</p>
            <span className="billing-rays" aria-hidden="true">✦</span>
          </div>
          <div className="billing-art" aria-hidden="true">
            <div className="billing-art-paper"><i/><i/><i/><i/></div>
            <div className="billing-art-chat">•••</div>
            <div className="billing-art-avatar"/>
            <span className="billing-art-spark">✦</span>
          </div>
        </header>

        {actionData?.error && <div className="billing-alert"><Banner tone="critical" title={t("billing_error")}>{actionData.error}</Banner></div>}
        {actionData?.confirmationUrl && <div className="billing-alert"><Banner tone="info" title={t("billing_redirecting")}>{t("billing_redirect_wait")}</Banner></div>}

        <div className="billing-notice">
          <div className="billing-notice-title"><span className="billing-info-icon">i</span>{t("billing_current_plan", { plan: currentPlan.toUpperCase() })}</div>
          <div className="billing-notice-desc">{t("billing_upgrade_hint")}</div>
        </div>

        <section className="billing-grid" aria-label="Available subscription plans">
          {PLANS_UI.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            return (
              <article className={`billing-card ${plan.key}`} key={plan.key}>
                <div className="billing-card-top">
                  <div className="billing-plan-icon">{icons[plan.key]}</div>
                  <div className="billing-plan-copy">
                    <div className="billing-plan-name">{plan.label}</div>
                    <div className="billing-price">{plan.price === 0 ? t("billing_free") : `$${plan.price}`}</div>
                    {plan.price > 0 && <div className="billing-per-month">{t("billing_per_month")}</div>}
                  </div>
                  {(isCurrent || plan.popular) && <span className="billing-plan-badge">{isCurrent ? t("billing_current") : t("billing_most_popular")}</span>}
                  <svg className="billing-wave" viewBox="0 0 160 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 80 C20 35 35 75 58 45 S88 65 110 30 S142 0 160 15 V80Z" fill="currentColor" opacity=".22"/><path d="M0 80 C20 35 35 75 58 45 S88 65 110 30 S142 0 160 15" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
                </div>
                <div className="billing-card-bottom">
                  <div className="billing-features-title">{t("billing_included")}</div>
                  <ul className="billing-features">{plan.featureKeys.map((key) => <li key={key}>{t(key)}</li>)}</ul>
                  <div className="billing-action">
                    {isCurrent ? (
                      <button type="button" className="billing-btn" disabled>{t("billing_current_btn")}</button>
                    ) : (
                      <Form method="post">
                        <input type="hidden" name="plan" value={plan.key}/>
                        <input type="hidden" name="returnLang" value={uiLanguage}/>
                        <button type="submit" className="billing-btn" disabled={isSubmitting || !!actionData?.confirmationUrl} onClick={() => setSubmittingPlan(plan.key)}>
                          {(isSubmitting && submittingPlan === plan.key) ? "Processing..." : plan.price === 0 ? t("billing_use_free") : t("billing_upgrade_to", { plan: plan.label })}
                        </button>
                      </Form>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
        <footer className="billing-footer">{t("billing_footer")}</footer>
      </div>
    </div>
  );
}
