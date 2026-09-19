REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- Deterministic, realistic 12-month review history -------------------------
SELECT setseed(0.4242);

WITH params AS (
  SELECT
    ARRAY['google','google','google','google','google','facebook','facebook','trustpilot','trustpilot','yelp','instagram','tripadvisor']::text[] AS platforms,
    ARRAY['Mumbai — Bandra Kurla','Dubai — Marina Walk','London — Soho Square','New York — Midtown East','Singapore — Orchard Road','Sydney — CBD George St']::text[] AS locs,
    ARRAY['Priya','Daniel','Meera','Lucas','Aisha','Hannah','Marcus','Sofia','Rahul','Elena','Omar','Grace','Liam','Nadia','Isabelle','Jonas','Fatima','Ethan','Ananya','Yuki','Diego','Amara','Noah','Leila','Victor','Sanjay','Clara','Mateo','Zara','Oliver','Karan','Freya','Hugo','Divya','Samuel','Anika','Ruben','Maya','Felix','Tara','Neha','Alice','Bilal','Camille','Dev','Erin','Rosa','Theo','Nina','Arjun']::text[] AS firsts,
    ARRAY['Sharma','Okafor','Iyer','Moreau','Khan','Weiss','Bell','Almeida','Verma','Petrova','Haddad','Whitfield','Rahman','Laurent','Berg','Aziz','Clarke','Rao','Hughes','Tanaka','Ramos','Obi','Fischer','Novak','Menon','Jensen','Silva','Malik','Grant','Costa','Batra','Dupont','Nair','Adeyemi','Kapoor','Santos','Lopez','Brandt','Singh','Moore','Joshi','Bennett','Yusuf','Girard','Patel','Walsh','Dias','Frost','Osei','Baptiste']::text[] AS lasts
),
pos AS (
  SELECT * FROM (VALUES
    ('Genuinely impressed','Booked at short notice and the team still made it feel effortless. Check-in took two minutes and the follow-up email had everything I needed.',ARRAY['Service','Speed']),
    ('Worth every penny','Third visit this quarter and the standard has not slipped once. The staff remembered my usual order, which is a small thing that goes a long way.',ARRAY['Staff','Consistency']),
    ('Excellent handling of a mistake','My order was wrong, I mentioned it, and it was corrected within ten minutes with an apology that felt sincere. That is how it should be done.',ARRAY['Recovery','Service']),
    ('Best in the area','Clean, calm and well run. I have tried three others nearby and none come close on attention to detail.',ARRAY['Ambience','Cleanliness']),
    ('Smooth from start to finish','Online booking worked, confirmation arrived instantly, and the team was ready when I walked in. No friction anywhere.',ARRAY['Booking','App']),
    ('The team makes it','Whoever is hiring here deserves a raise. Every single person was helpful without being pushy.',ARRAY['Staff']),
    ('Great value','Pricing is fair for the quality. I compared two competitors before booking and this was the better deal.',ARRAY['Pricing','Value']),
    ('Fast and professional','Sorted in under thirty minutes and the invoice reached my inbox before I got back to the car park.',ARRAY['Speed','Billing']),
    ('Lovely experience','Took my parents here for their anniversary and the team quietly arranged a small surprise. They talked about it all week.',ARRAY['Experience','Staff']),
    ('Reliable every time','Two years as a customer and I have never had to chase anyone for anything, which is rarer than it should be.',ARRAY['Consistency','Support'])
  ) AS t(title, body, tags)
),
neu AS (
  SELECT * FROM (VALUES
    ('Good, with one gap','Quality is solid and delivery was quick, but the size guide on the website is confusing. I had to exchange once.',ARRAY['Delivery','Website']),
    ('Fine, nothing special','Everything worked as expected. Nothing went wrong and nothing stood out either. Would return if it is convenient.',ARRAY['Experience']),
    ('Mixed visit','The product itself is very good. The wait to be seen was far longer than the fifteen minutes I was quoted at the desk.',ARRAY['Wait time','Quality']),
    ('Decent but pricey','No complaints about the service. Prices have crept up noticeably over the last year for the same thing.',ARRAY['Pricing']),
    ('Almost great','Staff were friendly and knowledgeable. The app kept logging me out during checkout so I finished the order by phone.',ARRAY['App','Checkout']),
    ('Okay for a quick visit','Convenient location and fast enough. The seating area needs a refresh, it felt tired.',ARRAY['Ambience','Location']),
    ('Helpful but slow to reply','I got the answer I needed eventually. Two days for an email reply is a long time when you are waiting to book.',ARRAY['Support','Response time'])
  ) AS t(title, body, tags)
),
neg AS (
  SELECT * FROM (VALUES
    ('Booking not honoured','We waited forty-five minutes for a table reserved a week in advance. Staff were apologetic but nobody followed up, and it was meant to be an anniversary dinner.',ARRAY['Wait time','Booking']),
    ('Charged twice','A billing error charged my card twice. Support promised forty-eight hours to fix it; it has now been a week with no update.',ARRAY['Billing','Support']),
    ('Nobody answers the phone','Called four times over two days about a damaged item. Voicemail every time and no callback. I had to come in person.',ARRAY['Support','Response time']),
    ('Not what was described','The listing promised same-day service. It took four days and I only found out by chasing it myself.',ARRAY['Expectations','Delivery']),
    ('Poor condition on arrival','Packaging was crushed and the item inside was scratched. The returns process worked but it cost me a whole afternoon.',ARRAY['Delivery','Returns']),
    ('Rude at the counter','I asked a simple question about a price difference and was talked over twice. I left and bought elsewhere.',ARRAY['Staff','Service']),
    ('Long waits every time','Third visit in a row with a queue out the door and one person on the desk. Staffing is clearly the problem.',ARRAY['Wait time','Staffing']),
    ('Refund still pending','Returned the order on the 3rd, confirmed as received on the 5th, still no refund. I am chasing weekly now.',ARRAY['Refund','Billing'])
  ) AS t(title, body, tags)
),
base AS (
  SELECT
    g AS n,
    round(power(random(), 1.6) * 364)::int AS days_ago,
    (SELECT locs[1 + floor(random() * 6)::int] FROM params) AS location_name,
    (SELECT platforms[1 + floor(random() * 12)::int] FROM params) AS platform,
    (SELECT firsts[1 + floor(random() * 50)::int] FROM params) AS first_name,
    (SELECT lasts[1 + floor(random() * 50)::int] FROM params) AS last_name,
    random() AS roll,
    random() AS roll2,
    random() AS roll3,
    random() AS roll4,
    8 + floor(random() * 13)::int AS hh,
    floor(random() * 60)::int AS mm
  FROM generate_series(1, 260) AS g
),
typed AS (
  SELECT
    b.*,
    CASE b.location_name
      WHEN 'Mumbai — Bandra Kurla' THEN 0.86
      WHEN 'Dubai — Marina Walk' THEN 0.82
      WHEN 'Sydney — CBD George St' THEN 0.80
      WHEN 'New York — Midtown East' THEN 0.74
      WHEN 'London — Soho Square' THEN 0.68
      ELSE 0.58
    END AS pos_bias
  FROM base b
),
classified AS (
  SELECT
    t.*,
    CASE
      WHEN t.roll < t.pos_bias THEN 'positive'
      WHEN t.roll < t.pos_bias + (1 - t.pos_bias) * 0.35 THEN 'neutral'
      ELSE 'negative'
    END AS sentiment
  FROM typed t
),
withtext AS (
  SELECT
    c.*,
    CASE c.sentiment
      WHEN 'positive' THEN (SELECT p.title FROM pos p OFFSET floor(c.roll2 * 10)::int LIMIT 1)
      WHEN 'neutral' THEN (SELECT p.title FROM neu p OFFSET floor(c.roll2 * 7)::int LIMIT 1)
      ELSE (SELECT p.title FROM neg p OFFSET floor(c.roll2 * 8)::int LIMIT 1)
    END AS title,
    CASE c.sentiment
      WHEN 'positive' THEN (SELECT p.body FROM pos p OFFSET floor(c.roll2 * 10)::int LIMIT 1)
      WHEN 'neutral' THEN (SELECT p.body FROM neu p OFFSET floor(c.roll2 * 7)::int LIMIT 1)
      ELSE (SELECT p.body FROM neg p OFFSET floor(c.roll2 * 8)::int LIMIT 1)
    END AS body,
    CASE c.sentiment
      WHEN 'positive' THEN (SELECT p.tags FROM pos p OFFSET floor(c.roll2 * 10)::int LIMIT 1)
      WHEN 'neutral' THEN (SELECT p.tags FROM neu p OFFSET floor(c.roll2 * 7)::int LIMIT 1)
      ELSE (SELECT p.tags FROM neg p OFFSET floor(c.roll2 * 8)::int LIMIT 1)
    END AS tags
  FROM classified c
)
INSERT INTO public.reviews
  (platform, source, author, rating, sentiment, status, priority, location_name, title, body, tags, unread, reply, replied_at, external_created_at)
SELECT
  w.platform,
  'seed',
  CASE WHEN w.platform = 'instagram'
       THEN '@' || lower(w.first_name) || (10 + floor(w.roll3 * 89)::int)::text
       ELSE w.first_name || ' ' || w.last_name END,
  CASE w.sentiment
    WHEN 'positive' THEN CASE WHEN w.roll3 < 0.62 THEN 5 ELSE 4 END
    WHEN 'neutral' THEN 3
    ELSE CASE WHEN w.roll3 < 0.55 THEN 1 ELSE 2 END
  END,
  w.sentiment,
  CASE
    WHEN (w.days_ago > 3 AND w.roll4 < 0.9) OR (w.days_ago <= 3 AND w.roll4 < 0.25) THEN 'replied'
    WHEN w.sentiment = 'negative' AND w.days_ago > 2 THEN 'escalated'
    ELSE 'pending'
  END,
  CASE w.sentiment
    WHEN 'negative' THEN CASE WHEN w.roll3 < 0.55 THEN 'high' ELSE 'medium' END
    WHEN 'neutral' THEN 'medium'
    ELSE 'low'
  END,
  w.location_name,
  CASE WHEN w.roll3 < 0.55 THEN w.title ELSE NULL END,
  w.body,
  w.tags,
  (NOT ((w.days_ago > 3 AND w.roll4 < 0.9) OR (w.days_ago <= 3 AND w.roll4 < 0.25))) AND w.days_ago < 2,
  CASE
    WHEN (w.days_ago > 3 AND w.roll4 < 0.9) OR (w.days_ago <= 3 AND w.roll4 < 0.25) THEN
      CASE
        WHEN w.sentiment = 'positive' THEN
          (ARRAY[
            'Thank you for taking the time to write this — I shared it with the team and it genuinely made their day. We hope to see you again soon.',
            'This is lovely to read. The team works hard on turnaround times, so thank you for noticing.',
            'Really appreciate you saying so. Your feedback goes straight to the people who served you.'
          ])[1 + floor(w.roll3 * 3)::int]
        ELSE
          (ARRAY[
            'I am sorry this was your experience. Your details are with our operations lead and someone will contact you within 24 hours to put it right.',
            'Thank you for flagging this. The charge has been reversed and you should see it back within three working days. Apologies for the delay.',
            'That is not the standard we hold ourselves to. We are reviewing the handover process at this location and would like to follow up with you directly.',
            'Apologies for the wait you ran into. We have added cover at the desk during peak hours, and feedback like yours is what triggered it.'
          ])[1 + floor(w.roll3 * 4)::int]
      END
    ELSE NULL
  END,
  CASE WHEN (w.days_ago > 3 AND w.roll4 < 0.9) OR (w.days_ago <= 3 AND w.roll4 < 0.25)
       THEN now() - (w.days_ago || ' days')::interval + interval '7 hours'
       ELSE NULL END,
  now() - (w.days_ago || ' days')::interval + (w.hh || ' hours ' || w.mm || ' minutes')::interval
FROM withtext w;

-- Alerts derived from the seeded history -----------------------------------
INSERT INTO public.alerts (kind, severity, title, detail, location_name, review_id, resolved, created_at)
SELECT
  'negative_review',
  CASE WHEN r.rating = 1 THEN 'critical' ELSE 'high' END,
  'New ' || r.rating || '-star review on ' || initcap(r.platform),
  r.author || ' — ' || left(r.body, 120) || '…',
  r.location_name,
  r.id,
  r.status = 'replied',
  r.external_created_at
FROM public.reviews r
WHERE r.rating <= 2 AND r.external_created_at > now() - interval '21 days';

INSERT INTO public.alerts (kind, severity, title, detail, location_name, resolved, created_at)
SELECT
  'unresolved',
  'medium',
  'Escalated review unanswered for over 72 hours',
  r.author || ' on ' || initcap(r.platform) || ' at ' || r.location_name || ' is still waiting for a reply. Response SLA breached.',
  r.location_name,
  false,
  r.external_created_at + interval '3 days'
FROM public.reviews r
WHERE r.status = 'escalated' AND r.external_created_at < now() - interval '3 days'
ORDER BY r.external_created_at DESC
LIMIT 4;

INSERT INTO public.alerts (kind, severity, title, detail, location_name, resolved, created_at)
SELECT
  'rating_drop',
  'critical',
  'Rating fell at ' || s.location_name,
  'Average rating over the last 30 days is ' || round(s.recent, 2) || ' against ' || round(s.older, 2) || ' for the previous period, driven by ' || s.low_count || ' reviews of 2 stars or fewer.',
  s.location_name,
  false,
  now() - interval '9 hours'
FROM (
  SELECT
    location_name,
    avg(rating) FILTER (WHERE external_created_at > now() - interval '30 days') AS recent,
    avg(rating) FILTER (WHERE external_created_at BETWEEN now() - interval '90 days' AND now() - interval '30 days') AS older,
    count(*) FILTER (WHERE rating <= 2 AND external_created_at > now() - interval '30 days') AS low_count
  FROM public.reviews
  GROUP BY location_name
) s
WHERE s.recent IS NOT NULL AND s.older IS NOT NULL AND s.recent < s.older - 0.2;

INSERT INTO public.alerts (kind, severity, title, detail, location_name, resolved, created_at)
SELECT
  'volume_spike',
  'info',
  'Positive review spike at ' || s.location_name,
  s.cnt || ' reviews in the last 14 days, ' || s.pos_pct || '% of them positive. Worth amplifying while momentum lasts.',
  s.location_name,
  false,
  now() - interval '30 hours'
FROM (
  SELECT
    location_name,
    count(*) AS cnt,
    round(100.0 * count(*) FILTER (WHERE sentiment = 'positive') / greatest(count(*), 1)) AS pos_pct
  FROM public.reviews
  WHERE external_created_at > now() - interval '14 days'
  GROUP BY location_name
) s
WHERE s.cnt >= 6 AND s.pos_pct >= 75;

-- Keep the "your brand" competitor row in step with real review data
UPDATE public.competitors c
SET rating = s.avg_rating,
    review_count = s.total,
    sentiment_score = s.pos_pct,
    response_rate = s.reply_pct
FROM (
  SELECT
    round(avg(rating)::numeric, 1) AS avg_rating,
    count(*)::int AS total,
    round(100.0 * count(*) FILTER (WHERE sentiment = 'positive') / greatest(count(*), 1))::int AS pos_pct,
    round(100.0 * count(*) FILTER (WHERE status = 'replied') / greatest(count(*), 1))::int AS reply_pct
  FROM public.reviews
) s
WHERE c.is_you;

INSERT INTO public.reports (title, period, scope, summary, status)
SELECT
  'Reputation summary — ' || to_char(now() - interval '1 month', 'Mon YYYY'),
  to_char(now() - interval '1 month', 'Mon YYYY'),
  'All locations',
  'Monthly roll-up of rating, sentiment, response rate and platform mix across all six locations.',
  'ready';