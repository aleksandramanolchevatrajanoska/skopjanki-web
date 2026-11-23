# Skopjanki – Active Girls Club

Сајт за Skopjanki: затворен клуб со одобрување, неделни термини кај партнери (плаќање во кеш),
fusion настани (плаќање онлајн преку Stripe) и членарина од 350 ден. месечно.

Правилата се од документот „Skopjanki – Деловни барања, верзија 1“ и се проверуваат на серверот.

## Што има во верзија 1

- Јавна почетна страна и барање за приклучување. Организаторката ја одобрува секоја девојка.
- Најава со линк на email (без лозинка).
- Неделни термини: цената на терминот се дели на девојките, членките плаќаат 20% помалку, капитенката не плаќа.
  Цената се заклучува 48 часа пред терминот и секоја добива email колку да донесе во кеш.
- Откажување помалку од 48 часа пред терминот или ако не дојде: го должи својот дел на клубот, освен ако некоја го земе местото.
  Капитенката означува кој дошол, сајтот ја пресметува новата цена за присутните, а долгот го собира на следниот термин.
- Листа на чекање: првата добива email и има 12 часа да потврди.
- Членките се пријавуваат први (48 часа).
- Капитенка може да биде само членка, со одобрување од организаторката.
- Членките можат да предложат свој план, еден неделно, со одобрување. Базата сама одбива втор план во иста недела.
- Fusion: 1.500 / 1.800 ден. онлајн, местото е сигурно дури по плаќањето (Stripe webhook). Откажување 7+ дена пред: кредит.
- Партнерите добиваат email со листата на девојки.
- Admin: одобрувања, девојки (и рачна членарина платена во кеш), настани, партнери, откажување.
- Англиски и македонски.

## Технологија

Next.js 15, Prisma 6, Postgres, Stripe, Resend (email). Хостинг: Vercel + Supabase (или Neon).

## Локално

```bash
cp .env.example .env      # пополни ги врските со базата и OWNER_EMAILS
npm install
npx prisma migrate deploy
npm run db:seed           # партнери и примерен месец (по избор)
npm run dev
```

Без `RESEND_API_KEY`, email-овите (и линковите за најава) се печатат во терминалот.

Тестови (бараат посебна база `skopjanki_test`, или `TEST_DATABASE_URL`):

```bash
npm test
```

## Хостирање, чекор по чекор

1. **База:** во Vercel → Storage (или Integrations) поврзи **Supabase**. Тоа автоматски ги додава `POSTGRES_PRISMA_URL` и `POSTGRES_URL_NON_POOLING`.
2. **Vercel:** на [vercel.com](https://vercel.com) → Add New Project → избери го ова GitHub repo.
   Во Environment Variables внеси ги сите од `.env.example`:
   - `APP_URL` – адресата на сајтот, на пример `https://skopjanki.vercel.app`
   - `OWNER_EMAILS` – твојот email (може повеќе, одделени со запирка)
   - `CRON_SECRET` – било каков долг случаен текст
   - Build command не треба да се менува: во `vercel.json` е `prisma migrate deploy`, па табелите се прават сами.
3. **Email:** профил на [resend.com](https://resend.com), потврди го доменот, внеси `RESEND_API_KEY` и `EMAIL_FROM`.
4. **Stripe:**
   - Products → нов производ „Членарина“, 350 MKD, месечно → ID на цената во `STRIPE_MEMBERSHIP_PRICE_ID`.
   - Developers → API keys → `STRIPE_SECRET_KEY`.
   - Developers → Webhooks → endpoint `https://<твојот-сајт>/api/stripe/webhook` со настани:
     `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` → signing secret во `STRIPE_WEBHOOK_SECRET`.
   - Settings → Billing → Customer portal: вклучи го, за членките сами да ја откажуваат членарината.
5. Отвори го сајтот, најави се со твојот email: автоматски добиваш admin улога.

Проверките (заклучување на цената 48 часа пред, листа на чекање, потсетници) се извршуваат кога некој го отвора сајтот
(најмногу на секои 5 минути) и еднаш дневно преку Vercel Cron. За почеста проверка, бесплатна услуга како cron-job.org
може да го повикува `GET /api/cron` секој час со header `Authorization: Bearer <CRON_SECRET>`.
