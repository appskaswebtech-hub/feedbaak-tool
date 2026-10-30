import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// The live app. For local testing, paste your dev tunnel URL into this block's "App URL" setting
// in the checkout editor instead of editing code.
const PRODUCTION_URL = 'https://quiz.kaswebtechsolutions.com';

// Texts shown in the form
const TXT = {
  thanksTitle: 'Thanks for your feedback!',
  thanksText: 'Your response has been submitted',
  loading: 'Loading...',
  question: 'Question {n} of {total}',
  enterSomething: 'Enter something',
  enterResponse: 'Enter your response',
  save: 'SAVE',
  submit: 'SUBMIT',
  ratingLow: '1 = Poor',
  ratingHigh: '5 = Excellent',
  npsLow: '0 = Not likely',
  npsHigh: '10 = Very likely',
};

export default async () => {
  render(<ProductReview />, document.body);
};

/** Where to go after an answer: a question number (1-based), 'end', or null for "next question" */
function nextStep(question, answerText) {
  const rules = Array.isArray(question.branchRules) ? question.branchRules : [];
  const answer = String(answerText ?? '');
  for (const rule of rules) {
    const a = Number(answer);
    const v = Number(rule.value);
    const hit =
      rule.op === 'eq' ? answer.toLowerCase() === String(rule.value).toLowerCase()
      : rule.op === 'lte' ? !Number.isNaN(a) && !Number.isNaN(v) && a <= v
      : rule.op === 'gte' ? !Number.isNaN(a) && !Number.isNaN(v) && a >= v
      : false;
    if (hit) return rule.goTo;
  }
  // Original behaviour for Yes/No questions without custom rules
  if (rules.length === 0 && question.isConditional && ['no', 'non'].includes(answer.toLowerCase())) return 'end';
  return null;
}

function ProductReview() {
  const orderId = String(shopify.orderConfirmation?.value?.order?.id ?? '').match(/\d+/g)?.pop() ?? '';
  const userEmail = shopify.buyerIdentity?.email?.value;
  const shop = String(shopify.shop?.myshopifyDomain || shopify.shop?.storefrontUrl || '').replace(/^https?:\/\//, '');
  const API_BASE_URL = String(shopify.settings?.value?.app_url ?? '').trim().replace(/\/+$/, '') || PRODUCTION_URL;

  const [survey, setSurvey] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState([]); // selected answer ids (strings) for the current question
  const [textInput, setTextInput] = useState('');
  const [done, setDone] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  // Skip the form if this buyer already answered for this order
  useEffect(() => {
    let active = true;
    Promise.resolve(shopify.storage?.read?.('product-reviewed'))
      .then((value) => { if (active && value && String(value) === orderId) setAlreadyReviewed(true); })
      .catch(() => {});
    return () => { active = false; };
  }, [orderId]);

  // Ask the server which survey fits this order (active, scheduled, targeted)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const productIds = (shopify.lines?.value ?? [])
          .map((line) => line?.merchandise?.product?.id)
          .filter(Boolean)
          .join(',');
        const params = new URLSearchParams({
          shop,
          country: String(shopify.localization?.country?.value?.isoCode ?? ''),
          total: String(shopify.cost?.totalAmount?.value?.amount ?? '0'),
          productIds,
        });
        const res = await fetch(`${API_BASE_URL}/app/active-survey?${params}`);
        const data = await res.json();
        if (!active) return;
        if (res.ok && data.survey) setSurvey(data.survey);
        else setLoadError(true); // no survey for this order: show nothing
      } catch (error) {
        console.error('Failed to fetch survey:', error);
        if (active) setLoadError(true);
      }
    })();
    return () => { active = false; };
  }, [shop]);

  async function send(updatedAnswers) {
    const params = new URLSearchParams({
      shop,
      shopDomain: shop,
      email: userEmail ?? '',
      surveyTitle: survey?.title ?? '',
      orderId,
      answers: JSON.stringify(updatedAnswers.filter(Boolean)),
    });
    const res = await fetch(`${API_BASE_URL}/app/proxy?${params}`, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to submit review');
    return res.json();
  }

  async function saveProgress(updatedAnswers) {
    try { await send(updatedAnswers); } catch (error) { console.error('Error saving answer:', error); }
  }

  async function finish(updatedAnswers) {
    setLoading(true);
    try {
      await send(updatedAnswers);
      try { await shopify.storage?.write?.('product-reviewed', orderId); } catch (_) { /* optional */ }
      setDone(true);
    } catch (error) {
      console.error('Error submitting review:', error);
    } finally {
      setLoading(false);
    }
  }

  if (alreadyReviewed) return null;

  if (done) {
    return (
      <s-box border="base" padding="base" borderRadius="base">
        <s-stack direction="block" gap="small">
          <s-heading>{TXT.thanksTitle}</s-heading>
          <s-text>{TXT.thanksText}</s-text>
        </s-stack>
      </s-box>
    );
  }

  if (loadError) return null;

  if (!survey) {
    return (
      <s-box border="base" padding="base" borderRadius="base">
        <s-text>{TXT.loading}</s-text>
      </s-box>
    );
  }

  const questions = survey.questions ?? [];
  const question = questions[currentIndex];
  if (!question) return null;

  const isLast = currentIndex === questions.length - 1;
  const answerOptions = question.answers ?? [];
  const isScale = question.questionType === 'rating' || question.questionType === 'nps';
  const textBoxSelected = answerOptions.some((o) => o.haveTextBox && selected.includes(String(o.id)));

  function record(answerText) {
    const updated = [...answers];
    updated[currentIndex] = {
      questionTitle: question.text,
      questionNumber: currentIndex + 1,
      answer: answerText,
    };
    setAnswers(updated);
    return updated;
  }

  function goTo(step) {
    if (step === 'end' || step === null || step === undefined) {
      if (step === 'end') return false;
      if (isLast) return false;
      setCurrentIndex(currentIndex + 1);
    } else {
      const target = Number(step) - 1;
      if (!(target > currentIndex) || target >= questions.length) return false;
      setCurrentIndex(target);
    }
    setSelected([]);
    setTextInput('');
    return true;
  }

  // Move on after an answer, or finish when the survey ends here
  function advance(updated, step) {
    if (step === 'end') { finish(updated); return; }
    goTo(step);
  }

  function formatMulti(ids, text) {
    const chosen = answerOptions.filter((o) => ids.includes(String(o.id)));
    const parts = chosen.filter((o) => !o.haveTextBox).map((o) => o.text);
    if (chosen.some((o) => o.haveTextBox) && text.trim() !== '') parts.push(`other(${text})`);
    return parts.join(',');
  }

  function onChoiceChange(event) {
    const values = (event.currentTarget.values ?? []).map(String);

    if (question.isMultiChoice) {
      setSelected(values);
      saveProgress(record(formatMulti(values, textInput)));
      return;
    }

    const id = values[values.length - 1];
    if (id === undefined) return;
    const option = answerOptions.find((o) => String(o.id) === id);
    if (!option) return;
    setSelected([id]);
    const updated = record(option.haveTextBox && textInput ? `other(${textInput})` : option.text);
    const step = nextStep(question, option.text);

    if (step === 'end') { finish(updated); return; }
    saveProgress(updated);
    if (!option.haveTextBox) setTimeout(() => goTo(step), 100);
  }

  function onScalePick(value) {
    setSelected([value]);
    const updated = record(value);
    const step = nextStep(question, value);
    if (step === 'end') { finish(updated); return; }
    saveProgress(updated);
    if (!isLast) setTimeout(() => goTo(step), 150);
  }

  function onTextChange(value) {
    setTextInput(value);
    if (question.isMultiChoice) record(formatMulti(selected, value));
    else record(`other(${value})`);
  }

  // SAVE button: go to the next question, honouring any skip rule on the saved answer
  function onSave() {
    const saved = answers[currentIndex]?.answer;
    advance(answers, nextStep(question, saved));
  }

  const scaleValues = question.questionType === 'rating'
    ? ['1', '2', '3', '4', '5']
    : ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const scaleLow = question.questionType === 'rating' ? TXT.ratingLow : TXT.npsLow;
  const scaleHigh = question.questionType === 'rating' ? TXT.ratingHigh : TXT.npsHigh;

  return (
    <s-box border="base" padding="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-text color="subdued">{TXT.question.replace('{n}', currentIndex + 1).replace('{total}', questions.length)}</s-text>
        <s-heading>{question.text}</s-heading>

        {isScale ? (
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" gap="small">
              {scaleValues.map((value) => (
                <s-button
                  key={`${currentIndex}-${value}`}
                  variant={selected.includes(value) ? 'primary' : 'secondary'}
                  onClick={() => onScalePick(value)}
                >
                  {value}
                </s-button>
              ))}
            </s-stack>
            <s-stack direction="inline" gap="base">
              <s-text color="subdued">{scaleLow}</s-text>
              <s-text color="subdued">{scaleHigh}</s-text>
            </s-stack>
          </s-stack>
        ) : question.isTextBox ? (
          <s-text-field
            label={TXT.enterSomething}
            value={textInput}
            onInput={(e) => onTextChange(e.currentTarget.value)}
          />
        ) : (
          <s-choice-list
            name={`quiz-response-${currentIndex}`}
            multiple={question.isMultiChoice}
            onChange={onChoiceChange}
          >
            {answerOptions.map((option) => (
              <s-choice
                key={`${currentIndex}-${option.id}`}
                value={String(option.id)}
                selected={selected.includes(String(option.id))}
              >
                {option.text}
              </s-choice>
            ))}
          </s-choice-list>
        )}

        {textBoxSelected && !question.isTextBox && (
          <s-text-field
            label={TXT.enterResponse}
            value={textInput}
            onInput={(e) => onTextChange(e.currentTarget.value)}
          />
        )}

        {isLast ? (
          <s-button variant="primary" loading={loading} onClick={() => finish(answers)}>
            {TXT.submit}
          </s-button>
        ) : (question.isMultiChoice || question.isTextBox || textBoxSelected) ? (
          <s-button variant="secondary" onClick={onSave}>
            {TXT.save}
          </s-button>
        ) : null}
      </s-stack>
    </s-box>
  );
}
