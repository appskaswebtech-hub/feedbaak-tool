import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

const lightTheme = `
  :root {
    --ft-primary: #4f46e5;
    --ft-primary-dark: #4338ca;
    --ft-primary-soft: #e0e0fb;
    --ft-bg: #f1f0fe;
    --ft-text: #1b1b3a;
    --ft-muted: #5f6080;
    --ft-border: #e3e3f1;
    --p-color-bg: var(--ft-bg);
    --p-color-bg-surface: #ffffff;
    --p-color-bg-fill-brand: var(--ft-primary);
    --p-color-bg-fill-brand-hover: var(--ft-primary-dark);
    --p-color-bg-fill-brand-active: var(--ft-primary-dark);
    --p-color-text: var(--ft-text);
    --p-color-text-secondary: var(--ft-muted);
    --p-color-border: var(--ft-border);
  }
  html, body { background: #e5eeff !important; color: var(--ft-text); }
  .app-shell {
    min-height: 100vh; padding-bottom: 48px;
    // background:
    //   radial-gradient(900px 480px at 8% -5%, rgba(124,58,237,.20), transparent 60%),
    //   radial-gradient(800px 460px at 95% 0%, rgba(79,70,229,.22), transparent 60%),
    //   radial-gradient(700px 420px at 50% 105%, rgba(167,139,250,.22), transparent 60%),
    //   linear-gradient(180deg, #f6f4ff 0%, #e9e6fc 100%);
    background-attachment: fixed;
    background: linear-gradient(110deg, #ffffff 0%, #f4fbff 42%, #e5f5ff 100%)
  }

  .app-shell .Polaris-Page { max-width: 1200px; padding-top: 24px; }
  .Polaris-Card, .Polaris-LegacyCard { background: #ffffff; border: 1px solid var(--ft-border);
    border-radius: 16px; box-shadow: 0 4px 24px rgba(79,70,229,.10), 0 1px 3px rgba(79,70,229,.08); }
  .Polaris-Button--variantPrimary { background: var(--ft-primary); border-radius: 10px; }
  .Polaris-Button--variantPrimary:hover { background: var(--ft-primary-dark); }
  .Polaris-Button { border-radius: 10px; }
  .Polaris-Badge { border-radius: 999px; }
  .Polaris-DataTable__Cell, .Polaris-DataTable__Cell--header { border-color: var(--ft-border); }

`;

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
      <AppProvider isEmbeddedApp apiKey={apiKey}>
        <style>{lightTheme}</style>
        <NavMenu>
          <Link to="/app" rel="home">
            Home
          </Link>
          <Link to="/app/analytics">Analytics</Link>
          <Link to="/app/manage">Manage Feedbacks</Link>
          <Link to="/app/visualize">Visualization</Link>
          <Link to="/app/billing">Upgrade your plan</Link>
        </NavMenu>
        <div className="app-shell">
          <Outlet />
        </div>
      </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
