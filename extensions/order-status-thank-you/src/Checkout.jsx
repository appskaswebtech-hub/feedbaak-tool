import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// TEMP: local dev tunnel for testing; switch back to https://quiz.kaswebtechsolutions.com before deploy
const API_BASE_URL = 'https://propecia-century-thee-fraction.trycloudflare.com';

const SUPPORTED_LANGS = ['en', 'fr', 'es', 'it', 'de'];

// Texts shown in the form, per checkout language
const FORM_TEXT = {
  en: { thanksTitle: 'Thanks for your feedback!', thanksText: 'Your response has been submitted', loading: 'Loading...', question: 'Question {n} of {total}', enterSomething: 'Enter something', enterResponse: 'Enter your response', save: 'SAVE', submit: 'SUBMIT' },
  fr: { thanksTitle: 'Merci pour votre avis !', thanksText: 'Votre réponse a bien été envoyée', loading: 'Chargement...', question: 'Question {n} sur {total}', enterSomething: 'Saisissez votre réponse', enterResponse: 'Saisissez votre réponse', save: 'ENREGISTRER', submit: 'ENVOYER' },
  es: { thanksTitle: '¡Gracias por sus comentarios!', thanksText: 'Su respuesta ha sido enviada', loading: 'Cargando...', question: 'Pregunta {n} de {total}', enterSomething: 'Escriba su respuesta', enterResponse: 'Escriba su respuesta', save: 'GUARDAR', submit: 'ENVIAR' },
  it: { thanksTitle: 'Grazie per il tuo feedback!', thanksText: 'La tua risposta è stata inviata', loading: 'Caricamento...', question: 'Domanda {n} di {total}', enterSomething: 'Scrivi la tua risposta', enterResponse: 'Scrivi la tua risposta', save: 'SALVA', submit: 'INVIA' },
  de: { thanksTitle: 'Danke für Ihr Feedback!', thanksText: 'Ihre Antwort wurde gesendet', loading: 'Wird geladen...', question: 'Frage {n} von {total}', enterSomething: 'Antwort eingeben', enterResponse: 'Antwort eingeben', save: 'SPEICHERN', submit: 'ABSENDEN' },
};

export default async () => {
  render(<ProductReview />, document.body);
};

function ProductReview() {
  const orderId = String(shopify.orderConfirmation?.value?.order?.id ?? '').match(/\d+/g)?.pop() ?? '';
  const userEmail = shopify.buyerIdentity?.email?.value;
  const shop = String(shopify.shop?.myshopifyDomain || shopify.shop?.storefrontUrl || '').replace(/^https?:\/\//, '');
  const rawLang = String(shopify.localization?.language?.value?.isoCode || 'en').slice(0, 2).toLowerCase();
  const lang = SUPPORTED_LANGS.includes(rawLang) ? rawLang : 'en';
  const txt = FORM_TEXT[lang];

  const [surveyTitle, setSurveyTitle] = useState(null);
  const [quizData, setQuizData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState([]); // selected answer ids (strings) for the current question
  const [textInput, setTextInput] = useState('');
  const [done, setDone] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  // Skip the form if this buyer already answered
  useEffect(() => {
    let active = true;
    Promise.resolve(shopify.storage?.read?.('product-reviewed'))
      .then((value) => { if (active && value) setAlreadyReviewed(true); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // 1) survey title for this shop + language
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/app/survey?shop=${encodeURIComponent(shop)}&lang=${lang}`);
        const data = await res.json();
        if (!active) return;
        if (res.ok) setSurveyTitle(data.surveyTitle);
        else setLoadError(true);
      } catch (error) {
        console.error('Error fetching survey title:', error);
        if (active) setLoadError(true);
      }
    })();
    return () => { active = false; };
  }, [shop, lang]);

  // 2) survey questions
  useEffect(() => {
    if (!surveyTitle) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/app/questions?shop=${encodeURIComponent(shop)}`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok) { setLoadError(true); return; }
        const quiz = lang === 'fr'
          ? (data.surveys.find((s) => s.isFrenchVersion === true) ?? data.surveys.find((s) => s.title === surveyTitle))
          : data.surveys.find((s) => s.title === surveyTitle);
        if (quiz) setQuizData(quiz);
        else { console.error('No quiz found for the given title or language.'); setLoadError(true); }
      } catch (error) {
        console.error('Failed to fetch quiz data:', error);
        if (active) setLoadError(true);
      }
    })();
    return () => { active = false; };
  }, [surveyTitle, shop, lang]);

  async function send(updatedAnswers) {
    const params = new URLSearchParams({
      shop,
      shopDomain: shop,
      email: userEmail ?? '',
      surveyTitle: surveyTitle ?? '',
      orderId,
      answers: JSON.stringify(updatedAnswers),
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
      try { await shopify.storage?.write?.('product-reviewed', true); } catch (_) { /* optional */ }
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
          <s-heading>{txt.thanksTitle}</s-heading>
          <s-text>{txt.thanksText}</s-text>
        </s-stack>
      </s-box>
    );
  }

  if (loadError) return null;

  if (!quizData) {
    return (
      <s-box border="base" padding="base" borderRadius="base">
        <s-text>{txt.loading}</s-text>
      </s-box>
    );
  }

  const questions = quizData.questions ?? [];
  const question = questions[currentIndex];
  if (!question) return null;

  const isLast = currentIndex === questions.length - 1;
  const answerOptions = question.answers ?? [];
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

  function goNext() {
    if (!isLast) {
      setCurrentIndex(currentIndex + 1);
      setSelected([]);
      setTextInput('');
    }
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

    const isNo = ['no', 'non'].includes(option.text.toLowerCase());
    if (question.isConditional && isNo) {
      finish(updated);
      return;
    }
    saveProgress(updated);
    if (!option.haveTextBox) setTimeout(goNext, 100);
  }

  function onTextChange(value) {
    setTextInput(value);
    if (question.isTextBox) {
      record(`other(${value})`);
    } else if (question.isMultiChoice) {
      record(formatMulti(selected, value));
    } else {
      record(`other(${value})`);
    }
  }

  return (
    <s-box border="base" padding="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-text color="subdued">{txt.question.replace('{n}', currentIndex + 1).replace('{total}', questions.length)}</s-text>
        <s-heading>{question.text}</s-heading>

        {question.isTextBox ? (
          <s-text-field
            label={txt.enterSomething}
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
            label={txt.enterResponse}
            value={textInput}
            onInput={(e) => onTextChange(e.currentTarget.value)}
          />
        )}

        {isLast ? (
          <s-button variant="primary" loading={loading} onClick={() => finish(answers)}>
            {txt.submit}
          </s-button>
        ) : (question.isMultiChoice || question.isTextBox || textBoxSelected) ? (
          <s-button variant="secondary" onClick={goNext}>
            {txt.save}
          </s-button>
        ) : null}
      </s-stack>
    </s-box>
  );
}
