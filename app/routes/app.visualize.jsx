import React, { useCallback, useState } from 'react';
import {
    Box,
    Button,
    ButtonGroup,
    Card,
    InlineStack,
    Page,
    Text,
    Icon,
    DatePicker,
    Modal,
    BlockStack,
    Badge,
    Divider,
    Banner,
} from '@shopify/polaris';
import SurveyChart from './component/SurveyBarChart';
import { json, useLoaderData } from '@remix-run/react';
import { PrismaClient } from '@prisma/client';
import SurveyLineChart from './component/SurveyLineChart';
import SurveyBarChart from './component/SurveyBarChart';
import SurveyPaiChart from './component/SurveyPaiChart';
import {
    ChartDonutIcon,
    ChartLineIcon,
    ChartVerticalIcon,
    CalendarIcon,
    LanguageIcon,
    FilterIcon,
} from '@shopify/polaris-icons';
import { authenticate } from '../shopify.server';

const prisma = new PrismaClient();

/**
 * Loader function with multi-tenancy support
 */
export const loader = async ({ request }) => {
    try {
        // Get shop from session for multi-tenancy
        const { session, admin } = await authenticate.admin(request);
        const shop = session.shop;

        // Fetch shop domain from GraphQL
        const response = await admin.graphql(
            `#graphql
            query {
                shop {
                    url
                }
            }`,
        );

        const data = await response.json();
        
        if (!data.data?.shop?.url) {
            throw new Error("Unable to fetch shop information");
        }

        const url = data.data.shop.url;
        const shopDomain = url.replace("https://", "");

        // Fetch feedbacks filtered by shop (multi-tenancy)
        const feedbacks = await prisma.apiProxyData.findMany({
            where: {
                shop: shop, // Filter by shop for multi-tenancy
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        // Fetch survey data filtered by shop (multi-tenancy)
        const surveyData = await prisma.survey.findMany({
            where: {
                shop: shop, // Filter by shop for multi-tenancy
            },
            include: {
                questions: true,
            },
        });

        return json({ 
            feedbacks, 
            surveyData,
            shop, // Pass shop to frontend
            shopDomain, // Pass shop domain for display
            success: true 
        });
    } catch (error) {
        console.error("Loader error:", error);
        return json({ 
            feedbacks: [], 
            surveyData: [],
            shop: null,
            shopDomain: null,
            success: false,
            error: error.message 
        }, { status: 500 });
    }
};

const DASHBOARD_CSS = `
.sv-dashboard{position:relative;isolation:isolate;min-height:100vh;padding:24px 28px 55px;color:#07134d;font-family:Inter,Arial,sans-serif;overflow:hidden;background:radial-gradient(ellipse at 0% 12%,#c7e4ff 0%,transparent 30%),radial-gradient(ellipse at 100% 0%,#c5e2ff 0%,transparent 34%),radial-gradient(ellipse at 100% 82%,#dedfff 0%,transparent 24%),linear-gradient(120deg,#e7f5ff,#f2faff 55%,#e5f3ff)}
.sv-dashboard:before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(circle,#9bcfff 2px,transparent 2.5px) 98% 12%/19px 19px no-repeat;opacity:.5}
.sv-inner{max-width:1200px;margin:0 auto}.sv-hero{min-height:265px;position:relative;padding:28px 16px 22px}.sv-heading{display:flex;align-items:center;gap:24px;position:relative;z-index:2}.sv-back{width:58px;height:58px;flex-shrink:0;display:grid;place-items:center;border:1px solid #d8e9ff;border-radius:14px;background:#ffffffdc;text-decoration:none;color:#0b54ed;font-size:35px;box-shadow:0 8px 20px #bedaff55}.sv-heading h1{margin:0;font-size:clamp(28px,3.1vw,48px);font-weight:800;letter-spacing:-1.8px;line-height:1.14;color:#081451}.sv-heading h1 span{color:#1769ff}.sv-subtitle{font-size:16px;color:#4b6197;margin:10px 0 32px 82px}.sv-rays{color:#f523a1;font-size:36px;vertical-align:top;margin-left:6px}.sv-store{display:flex;align-items:center;gap:14px;position:relative;z-index:2;width:max-content;max-width:75%;flex-wrap:wrap;padding:12px 17px;background:#ffffffd9;border:1px solid #d5e7ff;border-radius:15px;box-shadow:0 7px 18px #c3dfff55;color:#4a6198;font-size:14px}.sv-store strong{color:#0b1853}display:grid;place-items:center;font-family:Georgia,serif;font-size:27px;font-weight:900;color:white;transform:rotate(-8deg)}.sv-divider{color:#9bb3d7}.sv-art{position:absolute;right:35px;top:0;width:340px;height:225px;pointer-events:none}.sv-art-sheet{position:absolute;right:70px;top:25px;width:210px;height:170px;border-radius:17px;background:linear-gradient(145deg,#fff,#e9f3ff);border:8px solid #fff;box-shadow:12px 12px 0 #4da3ff,0 15px 24px #6da6e466;transform:rotate(8deg);padding:35px 25px}.sv-art-sheet i{display:inline-block;width:25px;margin-right:12px;vertical-align:bottom;background:linear-gradient(#52bbff,#1168ef);border-radius:4px}.sv-art-sheet i:nth-child(1){height:44px}.sv-art-sheet i:nth-child(2){height:68px}.sv-art-sheet i:nth-child(3){height:91px}.sv-art-pie{position:absolute;right:3px;bottom:5px;width:100px;height:100px;border-radius:50%;background:conic-gradient(#f72bc1 0 28%,#a8e0ff 28% 30%,#2979f8 30% 100%);border:8px solid #ffffffbb;box-shadow:0 10px 20px #6e9ee877}.sv-art-chat{position:absolute;top:13px;left:0;width:86px;height:73px;border-radius:16px;background:linear-gradient(145deg,#ff7bc9,#fa128b);box-shadow:0 8px 15px #ed75b455;transform:rotate(-10deg);display:grid;place-items:center;color:white;font-size:36px;z-index:2}.sv-art-chat:after{content:"";position:absolute;bottom:-13px;left:15px;border:16px solid transparent;border-top-color:#fa128b;border-bottom:0}.sv-panel{background:#ffffffed;border:1px solid #d9e9ff;border-radius:23px;box-shadow:0 10px 28px #a7caed33;padding:28px;margin:0 0 20px}.sv-empty-card{background:#ffffffef;border:1px solid #d5e6ff;border-radius:24px;box-shadow:0 10px 28px #a7caed44;min-height:460px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:36px 40px;text-align:center}.sv-empty-art{height:175px;width:205px;position:relative;margin:0 auto 10px}.sv-empty-halo{position:absolute;inset:8px 20px;border-radius:50%;background:linear-gradient(135deg,#e9efff,#d4e9ff)}.sv-empty-paper{position:absolute;top:21px;left:63px;width:110px;height:145px;border-radius:8px;background:linear-gradient(140deg,#fff,#f4f7ff);box-shadow:9px 6px 0 #dce8ff,0 7px 22px #a7c4e866;padding:20px}.sv-empty-pie{height:36px;width:36px;border-radius:50%;background:conic-gradient(#4aaaff 0 36%,#fff 36% 39%,#ffc73e 39% 100%);margin-bottom:16px}.sv-empty-paper i{display:block;height:6px;background:#e0e9f8;border-radius:4px;margin:9px 0}.sv-empty-paper i:last-child{width:60%}.sv-empty-spark{position:absolute;left:15px;top:24px;color:#1776ff;font-size:47px;transform:rotate(-25deg)}.sv-empty-card h2{font-size:27px;font-weight:800;letter-spacing:-.6px;margin:10px 0;color:#081451}.sv-empty-card p{font-size:16px;color:#536ba2;margin:0 0 35px}.sv-go-button{display:flex;justify-content:center;align-items:center;gap:18px;width:100%;min-height:57px;border-radius:14px;border:1.5px solid #83baff;background:linear-gradient(180deg,#f3f8ff,#e9f3ff);font-size:18px;font-weight:700;color:#0969f5;text-decoration:none}.sv-go-button:hover{background:#dceeff}.sv-dashboard .Polaris-Card{border-radius:16px}.sv-dashboard .Polaris-Button--variantPrimary{background:#236bfa}.sv-dashboard .Polaris-Text--headingMd{color:#081451}
@media(max-width:950px){.sv-art{opacity:.35;right:-35px}.sv-store{max-width:100%}.sv-hero{min-height:240px}}
@media(max-width:650px){.sv-dashboard{padding:12px 12px 32px}.sv-hero{padding:18px 0 24px;min-height:230px}.sv-heading{gap:12px}.sv-heading h1{font-size:28px;letter-spacing:-.7px}.sv-back{width:43px;height:43px;font-size:27px}.sv-rays{display:none}.sv-subtitle{margin:12px 0 22px 55px;font-size:13px}.sv-art{opacity:.12;right:-170px}.sv-store{font-size:12px;padding:10px;gap:8px}.sv-empty-card{min-height:410px;padding:25px 15px}.sv-empty-card h2{font-size:22px}.sv-empty-card p{font-size:14px}.sv-go-button{font-size:16px}}
`;

function DashboardShell({ shop, shopDomain, children }) {
    return <div className="sv-dashboard">
        <style>{DASHBOARD_CSS}</style>
        <div className="sv-inner">
            <header className="sv-hero">
                <div className="sv-heading">
                    <a href="/app/" className="sv-back" aria-label="Back to app"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m14 5-7 7 7 7M7 12h14"></path></svg></a>
                    <h1>Survey Data <span>Visualization</span><span className="sv-rays" aria-hidden="true">✦</span></h1>
                </div>
                <p className="sv-subtitle">View insights and analytics from your customer survey responses</p>
                <div className="sv-store">
                    <span className="sv-store-logo" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs><linearGradient id="shopGreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#9AE923"></stop><stop offset="100%" stop-color="#29B83B"></stop></linearGradient><linearGradient id="shopSide" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#258D26"></stop><stop offset="100%" stop-color="#126A27"></stop></linearGradient></defs><path d="M19 22V15C19 7 25 3 32 3s13 4 13 12v7" fill="none" stroke="#58C923" stroke-width="4.5" stroke-linecap="round"></path><path d="M12 19L47 15L57 23L58 54L41 61L8 54Z" fill="url(#shopSide)"></path><path d="M12 19L47 15L41 61L8 54Z" fill="url(#shopGreen)"></path><path d="M47 15L57 23L58 54L41 61Z" fill="url(#shopSide)"></path><text x="28" y="45" fill="#FFFFFF" font-size="29" font-weight="900" text-anchor="middle" font-family="Arial" transform="rotate(-5 28 38)">S</text></svg></span>
                    <span>Store: <strong>{shop || 'Your store'}</strong></span>
                    {shopDomain && <><span className="sv-divider">|</span><span>Domain: {shopDomain}</span></>}
                </div>
                <div className="sv-art" aria-hidden="true"><div className="sv-art-sheet"><i/><i/><i/></div><div className="sv-art-chat">•••</div><div className="sv-art-pie"/></div>
            </header>
            {children}
        </div>
    </div>;
}

function EmptyReportIllustration() {
    return <div className="sv-empty-art" aria-hidden="true">
        <div className="sv-empty-halo"/><span className="sv-empty-spark">✦</span>
        <div className="sv-empty-paper"><div className="sv-empty-pie"/><i/><i/><i/></div>
    </div>;
}

const TestCharts = () => {
    const { feedbacks, surveyData, shop, shopDomain, error } = useLoaderData();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeButtonIndex, setActiveButtonIndex] = useState('bar');
    const [language, setLanguage] = useState('en');
    const [{ month, year }, setDate] = useState({ month: 1, year: 2025 });
    const [selectedDates, setSelectedDates] = useState({
        start: new Date('Wed Jan 01 2025 00:00:00 GMT-0500 (EST)'),
        end: new Date(),
    });

    const [initialFeedbacks] = useState(feedbacks);
    const [filteredData, setFilteredData] = useState(formatSurveyData(feedbacks, surveyData, selectedDates));
    const [isFilterActive, setIsFilterActive] = useState(false);

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const handleButtonClick = useCallback(
        (index) => {
            if (activeButtonIndex === index) return;
            setActiveButtonIndex(index);
        },
        [activeButtonIndex]
    );

    const toggleLanguage = () => {
        setLanguage((prevLanguage) => (prevLanguage === 'en' ? 'fr' : 'en'));
    };

    const handleMonthChange = useCallback((month, year) => setDate({ month, year }), []);

    const handleDateChange = (dates) => {
        setSelectedDates(dates);

        const normalizedStartDate = new Date(dates.start.setHours(0, 0, 0, 0));
        const normalizedEndDate = new Date(dates.end.setHours(0, 0, 0, 0));

        const isSameDate = normalizedStartDate.getTime() === normalizedEndDate.getTime();

        const filteredFeedbacks = isSameDate
            ? feedbacks.filter(feedback => {
                const feedbackDate = new Date(feedback.createdAt).setHours(0, 0, 0, 0);
                return feedbackDate === normalizedStartDate.getTime();
            })
            : feedbacks.filter(feedback => {
                const feedbackDate = new Date(feedback.createdAt).setHours(0, 0, 0, 0);
                const startDate = new Date(dates.start).setHours(0, 0, 0, 0);
                const endDate = new Date(dates.end).setHours(0, 0, 0, 0);
                return feedbackDate >= startDate && feedbackDate <= endDate;
            });

        const newFilteredData = formatSurveyData(filteredFeedbacks, surveyData, dates);
        setFilteredData(newFilteredData);
    };

    const handleApplyFilter = () => {
        setIsFilterActive(true);
        setIsModalOpen(false);
    };

    const handleCancel = () => {
        setIsModalOpen(false);
        setSelectedDates({
            start: new Date('Wed Jan 01 2025 00:00:00 GMT-0500 (EST)'),
            end: new Date(),
        });
        setFilteredData(formatSurveyData(initialFeedbacks, surveyData, {
            start: new Date('Wed Jan 01 2025 00:00:00 GMT-0500 (EST)'),
            end: new Date()
        }));
        setIsFilterActive(false);
    };

    const chartConfig = {
        bar: {
            icon: ChartVerticalIcon,
            label: { en: 'Bar Chart', fr: 'Graphique à barres' },
            component: SurveyBarChart
        },
        line: {
            icon: ChartLineIcon,
            label: { en: 'Line Chart', fr: 'Graphique linéaire' },
            component: SurveyLineChart
        },
        pai: {
            icon: ChartDonutIcon,
            label: { en: 'Pie Chart', fr: 'Graphique circulaire' },
            component: SurveyPaiChart
        }
    };

    const ActiveChart = chartConfig[activeButtonIndex].component;
    const totalResponses = filteredData[0]?.totalUsers || 0;

    // Show error state
    if (error) {
        return (
            <Page title="Survey Data Visualization">
                <Banner tone="critical">
                    <p className="Polaris-Text--bodyMdsssss">Failed to load analytics data: {error}</p>
                </Banner>
            </Page>
        );
    }

    // Preserve the existing empty-state behaviour with the redesigned layout.
    if (feedbacks.length === 0 && surveyData.length === 0) {
        return (
            <DashboardShell shop={shop} shopDomain={shopDomain}>
                <div className="sv-empty-card">
                    <EmptyReportIllustration />
                    <h2>{language === 'en' ? 'No Survey Data Available' : "Aucune donnée d’enquête disponible"}</h2>
                    <p>{language === 'en' ? 'Create a survey and collect responses to see analytics here.' : 'Créez une enquête et collectez des réponses pour voir les analyses ici.'}</p>
                    <a className="sv-go-button" href="/app/">{language === 'en' ? 'Go to Surveys' : 'Aller aux enquêtes'} <span aria-hidden="true">→</span></a>
                </div>
            </DashboardShell>
        );
    }

    return (
        <DashboardShell shop={shop} shopDomain={shopDomain}>
            <BlockStack gap="400">
                {/* Stats & Controls Card */}
                <Card>
                    <BlockStack gap="400">
                        <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                                <Text as="h2" variant="headingMd">
                                    {language === 'en' ? 'Analytics Overview' : 'Aperçu analytique'}
                                </Text>
                                <InlineStack gap="200">
                                    <Badge tone="info">
                                        {totalResponses} {language === 'en' ? 'Responses' : 'Réponses'}
                                    </Badge>
                                    {isFilterActive && (
                                        <Badge tone="attention">
                                            {language === 'en' ? 'Filtered' : 'Filtré'}
                                        </Badge>
                                    )}
                                </InlineStack>
                            </BlockStack>

                            <InlineStack gap="200">
                                <Button
                                    onClick={toggleLanguage}
                                    icon={LanguageIcon}
                                    accessibilityLabel={language === 'en' ? 'Switch to French' : 'Passer à l\'anglais'}
                                >
                                    {language === 'en' ? 'EN' : 'FR'}
                                </Button>
                                <Button
                                    variant="primary"
                                    icon={CalendarIcon}
                                    onClick={() => setIsModalOpen(true)}
                                >
                                    {language === 'en' ? 'Date Range' : 'Plage de dates'}
                                </Button>
                            </InlineStack>
                        </InlineStack>

                        {isFilterActive && (
                            <>
                                <Divider />
                                <Banner
                                    tone="info"
                                    onDismiss={handleCancel}
                                >
                                    <InlineStack gap="200" blockAlign="center">
                                        <Icon source={FilterIcon} />
                                        <Text as="p">
                                            {language === 'en' ? 'Showing data from' : 'Affichage des données du'} {formatDate(selectedDates.start)} {language === 'en' ? 'to' : 'au'} {formatDate(selectedDates.end)}
                                        </Text>
                                    </InlineStack>
                                </Banner>
                            </>
                        )}
                    </BlockStack>
                </Card>

                {/* Chart Type Selector */}
                <Card>
                    <BlockStack gap="300">
                        <Text as="h3" variant="headingSm">
                            {language === 'en' ? 'Chart Type' : 'Type de graphique'}
                        </Text>
                        <InlineStack align="center">
                            <ButtonGroup variant="segmented">
                                {Object.entries(chartConfig).map(([key, config]) => (
                                    <Button
                                        key={key}
                                        pressed={activeButtonIndex === key}
                                        onClick={() => handleButtonClick(key)}
                                        icon={config.icon}
                                    >
                                        {config.label[language]}
                                    </Button>
                                ))}
                            </ButtonGroup>
                        </InlineStack>
                    </BlockStack>
                </Card>

                {/* Chart Display Card */}
                <Card>
                    <BlockStack gap="400">
                        <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingMd">
                                {chartConfig[activeButtonIndex].label[language]}
                            </Text>
                            <Badge tone="success">
                                {language === 'en' ? 'Live Data' : 'Données en direct'}
                            </Badge>
                        </InlineStack>
                        <Divider />
                        {filteredData.length > 0 ? (
                            <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                                <ActiveChart surveyData={filteredData} language={language} />
                            </Box>
                        ) : (
                            <Box padding="600">
                                <BlockStack gap="200" align="center">
                                    <Text variant="bodyMd" tone="subdued" alignment="center">
                                        {language === 'en' 
                                            ? 'No data available for the selected date range.'
                                            : 'Aucune donnée disponible pour la plage de dates sélectionnée.'}
                                    </Text>
                                    <Button onClick={handleCancel}>
                                        {language === 'en' ? 'Reset Filter' : 'Réinitialiser le filtre'}
                                    </Button>
                                </BlockStack>
                            </Box>
                        )}
                    </BlockStack>
                </Card>
            </BlockStack>

            {/* Date Filter Modal */}
            {isModalOpen && (
                <Modal
                    open={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title={language === 'en' ? 'Select Date Range' : 'Sélectionner la plage de dates'}
                    primaryAction={{
                        content: language === 'en' ? 'Apply Filter' : 'Appliquer le filtre',
                        onAction: handleApplyFilter,
                    }}
                    secondaryActions={[{
                        content: language === 'en' ? 'Clear & Reset' : 'Effacer et réinitialiser',
                        onAction: handleCancel,
                        destructive: true,
                    }]}
                >
                    <Modal.Section>
                        <BlockStack gap="400">
                            {/* Store Context */}
                            <Banner tone="info">
                                <Text as="p" variant="bodySm">
                                    {language === 'en' 
                                        ? `Filtering analytics for ${shop}`
                                        : `Filtrage des analyses pour ${shop}`}
                                </Text>
                            </Banner>

                            <Box
                                padding="300"
                                background="bg-surface-secondary"
                                borderRadius="200"
                            >
                                <InlineStack gap="200" blockAlign="center">
                                    <Icon source={CalendarIcon} tone="base" />
                                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                                        {formatDate(selectedDates.start)} — {formatDate(selectedDates.end)}
                                    </Text>
                                </InlineStack>
                            </Box>

                            <Card>
                                <InlineStack align="center">
                                    <DatePicker
                                        month={month}
                                        year={year}
                                        onChange={handleDateChange}
                                        onMonthChange={handleMonthChange}
                                        selected={selectedDates}
                                        allowRange
                                    />
                                </InlineStack>
                            </Card>

                            <Banner tone="info">
                                <Text as="p" variant="bodySm">
                                    {language === 'en'
                                        ? 'Select a date range to filter survey responses. Click "Apply Filter" to update the charts.'
                                        : 'Sélectionnez une plage de dates pour filtrer les réponses. Cliquez sur "Appliquer le filtre" pour mettre à jour les graphiques.'}
                                </Text>
                            </Banner>
                        </BlockStack>
                    </Modal.Section>
                </Modal>
            )}
        </DashboardShell>
    );
};

/**
 * Format survey data helper function
 */
const formatSurveyData = (feedbacks, surveyData) => {
    const totalUsers = feedbacks.length;

    const formattedData = surveyData.map(survey => {
        const questionsWithAnswers = survey.questions.map(question => {
            const answersCount = {};
            feedbacks.forEach(feedback => {
                const answers = JSON.parse(feedback.answers);
                const answer = answers.find(a => a.questionTitle === question.text)?.answer;
                if (answer) {
                    if (question.isMultiChoice) {
                        answer.split(',').forEach(a => {
                            answersCount[a] = (answersCount[a] || 0) + 1;
                        });
                    } else {
                        answersCount[answer] = (answersCount[answer] || 0) + 1;
                    }
                }
            });

            return {
                ...question,
                answersCount: Object.entries(answersCount).map(([answer, count]) => ({ answer, count }))
            };
        });

        return {
            ...survey,
            questions: questionsWithAnswers,
            totalUsers: feedbacks.length
        };
    });

    return formattedData;
};

export default TestCharts;