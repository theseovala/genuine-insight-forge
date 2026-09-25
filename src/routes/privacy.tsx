import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Fact,
  LegalDocument,
  PrivacyContact,
  type LegalSection,
} from "@/components/legal/LegalDocument";
import { BRAND } from "@/lib/domain";
import { LEGAL } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy Policy — ${BRAND.name}` },
      {
        name: "description",
        content: `How ${BRAND.name} collects, uses, protects and deletes personal data, including data received from Google APIs.`,
      },
      { property: "og:title", content: `Privacy Policy — ${BRAND.name}` },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: `${LEGAL.website}/privacy` }],
  }),
  component: PrivacyPage,
});

const Settings = ({ tab, children }: { tab: string; children: React.ReactNode }) => (
  <Link to="/settings" search={{ tab } as never}>
    {children}
  </Link>
);

const retentionNotice = LEGAL.googleBusinessRetentionEnforced ? (
  <p>
    Business Profile content we receive through that API is kept for no longer than the period
    Google's policies allow. When that period ends it is removed or refreshed from Google by a new
    sync.
  </p>
) : (
  <p>
    <strong>Current status, stated plainly:</strong> an automatic process that removes Business
    Profile content once that period ends is not yet in place. Until it is, synced Google review
    content stays in your workspace until you ask us to delete it (see{" "}
    <a href="#deletion">Account and data deletion</a>) or the workspace is deleted. You can make
    that request at any time, whether or not Google is still connected.
  </p>
);

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    content: (
      <>
        <p>
          {BRAND.name} is an online reputation management service available at{" "}
          <a href={LEGAL.website}>{LEGAL.website.replace("https://", "")}</a>. It is operated by{" "}
          <Fact k="companyLegalName" />, registered at <Fact k="registeredAddress" /> under
          registration number <Fact k="registrationNumber" /> (“{BRAND.name}”, “we”, “us”).
        </p>
        <p>
          This policy explains what personal data we handle when you visit our website, create an
          account, connect third-party services such as Google Business Profile, and use the
          product. It also explains the choices and rights you have.
        </p>
        <h3>Two roles, depending on the data</h3>
        <ul>
          <li>
            For your <strong>account, billing and usage data</strong>, we decide how the data is
            used, and act as a <em>controller</em> (or “business” / “data fiduciary”, depending on
            the law that applies).
          </li>
          <li>
            For the <strong>data you bring into your workspace</strong> — reviews, business
            listings, customer feedback, reports — we process it on your behalf and on your
            instructions, acting as a <em>processor</em> (or “service provider”). Your organisation
            remains responsible for having a lawful basis to monitor and respond to that content.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "Information we collect",
    content: (
      <>
        <p>We collect only what is needed to run the features you use. Specifically:</p>
        <h3>Account information</h3>
        <p>
          Your name, work email address, job title (optional) and workspace membership and role.
          Your password is handled by our authentication provider, which stores only a one-way
          cryptographic hash. We never see or store your password in readable form.
        </p>
        <h3>Google OAuth information</h3>
        <p>
          When you connect a Google service, Google asks you to sign in and approve access on
          Google's own page. We never ask for, receive or store your Google password. After you
          approve, Google gives us an access token, a refresh token, the list of permissions
          (scopes) you granted, and the email address of the Google account used, so you can see
          which account is connected.
        </p>
        <h3>Google Business Profile data</h3>
        <p>
          For the Business Profile accounts and locations you are authorized to manage and choose to
          connect, we retrieve: account and location names, location city and country, and the
          reviews for those locations. We do not create, edit or delete Business Profile listings.
        </p>
        <h3>Reviews and review-related information</h3>
        <p>
          For each review: the reviewer's public display name as shown by the platform, the star
          rating, the review text, the date, and any existing owner reply. We do not store
          reviewers' profile photos, email addresses or contact details. We also keep replies you
          write, who in your team sent them and when.
        </p>
        <h3>Business and location information</h3>
        <p>
          Business name, industry, website, locations, reply tone and signature, alert preferences,
          competitor names you add, and the configuration of connected platforms.
        </p>
        <h3>Scan and report information</h3>
        <p>
          When you run a website or reputation scan, we collect publicly available information about
          the domain or business you enter (for example page content, technical signals and public
          listing data), the findings produced, and the evidence behind each finding. Reports you
          generate are stored in your workspace.
        </p>
        <h3>Information used for AI processing</h3>
        <p>
          When you ask for an AI-drafted reply, analysis or report, the relevant review text,
          business settings and scan evidence are sent to an AI model provider to produce the
          result. See <a href="#ai-processing">AI and automated processing</a>.
        </p>
        <h3>Technical, device and log information</h3>
        <p>
          IP address, browser type, device information, pages requested and timestamps, as recorded
          by our hosting and authentication providers for security and reliability. Inside the
          product we keep an activity log (for example, who published a reply or ran a scan) and an
          integration log (which service was called, when, and whether it succeeded). These logs
          record operation names and status codes; they do not record passwords, OAuth tokens or API
          keys.
        </p>
        <h3>Communications</h3>
        <p>Messages you send us, including privacy and support requests, and our replies.</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and similar technologies",
    content: (
      <>
        <p>We use only storage that is strictly necessary for the service to work:</p>
        <table>
          <thead>
            <tr>
              <th scope="col">What</th>
              <th scope="col">Why</th>
              <th scope="col">Kept</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Sign-in session (browser local storage)</td>
              <td>Keeps you signed in securely between pages.</td>
              <td>Until you sign out or the session expires</td>
            </tr>
            <tr>
              <td>Interface preference (browser local storage)</td>
              <td>Remembers whether the sidebar is collapsed.</td>
              <td>Until you clear site data</td>
            </tr>
          </tbody>
        </table>
        <p>
          We do not use advertising cookies, cross-site tracking or third-party analytics. If that
          ever changes, we will update this section and, where the law requires it, ask for your
          consent first.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use information",
    content: (
      <ul>
        <li>To create and secure your account and workspace, and to authenticate you.</li>
        <li>
          To show your reviews, ratings, alerts, reputation score and reports for the businesses you
          manage.
        </li>
        <li>To draft replies, analyses and reports with AI when you ask for them.</li>
        <li>To publish a review reply to a platform — only when you press Publish.</li>
        <li>To prepare review-removal and policy-report cases you choose to pursue.</li>
        <li>To run scans you request and keep the evidence behind each finding.</li>
        <li>To provide support, respond to requests and send service messages.</li>
        <li>To detect, investigate and prevent abuse, fraud and security incidents.</li>
        <li>
          To manage subscriptions and licences, and to meet legal, tax and accounting obligations.
        </li>
      </ul>
    ),
  },
  {
    id: "legal-bases",
    title: "Legal bases for processing",
    content: (
      <>
        <p>Where the GDPR, UK GDPR or a similar law applies, we rely on:</p>
        <ul>
          <li>
            <strong>Contract</strong> — to provide the service you signed up for (account,
            workspace, connected platforms, reports).
          </li>
          <li>
            <strong>Consent</strong> — for connecting Google and other third-party accounts; you
            give it on the provider's consent screen and can withdraw it at any time by
            disconnecting.
          </li>
          <li>
            <strong>Legitimate interests</strong> — to keep the service secure, prevent abuse and
            improve reliability, balanced against your rights. For reviewer data within workspaces,
            our customers rely on their own legitimate interest in monitoring and responding to
            public feedback about their business.
          </li>
          <li>
            <strong>Legal obligation</strong> — to keep records required by law and respond to
            lawful requests.
          </li>
        </ul>
        <p>
          Under India's Digital Personal Data Protection Act, 2023, we process personal data on the
          basis of your consent or for legitimate uses permitted by that Act, as applicable.
        </p>
      </>
    ),
  },
  {
    id: "google-data",
    title: "How we use data from Google",
    content: (
      <>
        <p className="rounded-lg border border-primary/30 bg-accent p-4 text-foreground">
          {BRAND.name}'s use and transfer to any other app of information received from Google APIs
          will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <h3>What that means in practice</h3>
        <ul>
          <li>
            <strong>You choose to connect.</strong> Google access starts only when an owner or admin
            of your workspace clicks Connect and approves it on Google's consent screen. We explain
            what we will access before sending you there.
          </li>
          <li>
            <strong>Only the permissions the feature needs.</strong> For Google Business Profile we
            request the <code>business.manage</code> permission (needed to read reviews and post the
            replies you write), plus your basic sign-in identity and email address. Other Google
            services — Search Console, Analytics, Ads, Gmail, YouTube — are requested separately and
            only if you connect them.
          </li>
          <li>
            <strong>Only your authorized businesses.</strong> We access only the Business Profile
            accounts and locations the connecting Google account is permitted to manage.
          </li>
          <li>
            <strong>Used only to provide the features you see.</strong> Google data is used to show
            your reviews, calculate your scores, raise alerts, draft replies you review, and build
            your reports. It is not used for unrelated purposes.
          </li>
          <li>
            <strong>Never sold, never used for advertising.</strong> We do not sell Google user
            data, transfer it to advertising platforms or data brokers, use it for personalised
            advertising, or use it to determine creditworthiness.
          </li>
          <li>
            <strong>Not used to train generalised AI models.</strong> Google user data is not used
            to develop, improve or train generalised or foundation AI or machine-learning models.
          </li>
          <li>
            <strong>Limited human access.</strong> Our staff do not read your Google data unless you
            ask us to (for example, in a support request), it is necessary for security or to comply
            with the law, or it has been aggregated and anonymised for internal operations.
          </li>
          <li>
            <strong>No action without you.</strong> We do not post review replies, create or edit
            listings, or take any other action on your Business Profile automatically. Every reply
            is published only when a person in your workspace presses Publish.
          </li>
        </ul>
        <h3>How tokens are protected</h3>
        <p>
          OAuth tokens are stored only on our servers, encrypted with AES-256-GCM, and readable only
          by server-side code acting for your workspace. They are never sent to your browser, placed
          in a URL, or written to logs. The sign-in handshake uses a one-time state value and PKCE,
          and expires after 10 minutes if not completed.
        </p>
      </>
    ),
  },
  {
    id: "ai-processing",
    title: "AI and automated processing",
    content: (
      <>
        <p>
          {BRAND.name} uses AI models to draft review replies, summarise feedback, classify reviews
          against platform policies, explain scan findings and write reports. Requests are routed
          through an AI gateway to model providers who process the content to return the result.
        </p>
        <ul>
          <li>
            AI output is <strong>assistive</strong>. A person in your workspace reviews and decides
            what to do with every draft, report or recommendation. Nothing is published to a review
            platform without a person pressing Publish.
          </li>
          <li>AI output can be wrong or incomplete, and is not legal advice.</li>
          <li>
            We do not make decisions based solely on automated processing that produce legal or
            similarly significant effects on you. Priority labels, sentiment and scores are aids for
            your team, not decisions about individuals.
          </li>
          <li>We send only the content needed for the task you requested.</li>
        </ul>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Sharing and service providers",
    content: (
      <>
        <p>We do not sell personal data. We share it only in these cases:</p>
        <h3>Service providers (processors)</h3>
        <table>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Database and authentication (Supabase)</td>
              <td>Stores account and workspace data; handles sign-in.</td>
            </tr>
            <tr>
              <td>Application hosting</td>
              <td>Runs the website and server functions.</td>
            </tr>
            <tr>
              <td>AI gateway and model providers</td>
              <td>Generate drafts, classifications and reports you request.</td>
            </tr>
            <tr>
              <td>Email and payment providers, when enabled</td>
              <td>Send service messages; process subscription payments.</td>
            </tr>
          </tbody>
        </table>
        <p>
          They may use the data only to provide their service to us, under contractual
          confidentiality and security terms.
        </p>
        <h3>Platforms you connect</h3>
        <p>
          When you publish a reply or submit a report, the content you approved is sent to that
          platform (for example Google). Their handling of it is governed by their own privacy
          policies.
        </p>
        <h3>Within your workspace</h3>
        <p>Members of your workspace can see workspace data according to their role.</p>
        <h3>Legal and safety reasons</h3>
        <p>
          When required by law or a valid legal process, or to protect the rights, safety and
          security of our users, the public or {BRAND.name}.
        </p>
        <h3>Business transfers</h3>
        <p>
          If {BRAND.name} is involved in a merger, acquisition or sale of assets, data may transfer
          to the successor, subject to this policy. For Google user data, this happens only with
          your prior consent.
        </p>
      </>
    ),
  },
  {
    id: "international-transfers",
    title: "International data transfers",
    content: (
      <>
        <p>
          {BRAND.name} is a global service. Your data is hosted in <Fact k="hostingRegions" /> and
          our service providers may process it in other countries, including countries whose
          data-protection laws differ from yours.
        </p>
        <p>
          Where we transfer personal data out of the EEA, the UK or another jurisdiction that
          restricts transfers, we rely on an adequacy decision or on appropriate safeguards such as
          the European Commission's Standard Contractual Clauses and the UK International Data
          Transfer Addendum, as applicable. You can ask us for more information about these
          safeguards.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Data security",
    content: (
      <>
        <ul>
          <li>
            Encryption in transit (HTTPS) for all traffic, and encryption of OAuth tokens and
            provider credentials at rest.
          </li>
          <li>
            Row-level access controls that keep each workspace's data separate from every other
            workspace.
          </li>
          <li>
            Role checks on sensitive actions — only owners and admins can connect or disconnect
            Google.
          </li>
          <li>
            Secrets kept only on the server; none are included in the website code sent to browsers.
          </li>
          <li>
            An activity log of sensitive actions such as publishing replies and changing
            connections.
          </li>
        </ul>
        <p>
          No system is completely secure. If we become aware of a personal-data breach that affects
          you, we will notify you and the relevant authorities where the law requires us to.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Data retention",
    content: (
      <>
        <table>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">How long</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Account and workspace data</td>
              <td>
                While your account is active, then deleted on request or when the workspace is
                closed, except records we must keep by law.
              </td>
            </tr>
            <tr>
              <td>Google OAuth tokens</td>
              <td>
                Until you disconnect Google; they are then revoked at Google and deleted from our
                database immediately.
              </td>
            </tr>
            <tr>
              <td>Pending Google sign-in handshakes</td>
              <td>Expire after 10 minutes.</td>
            </tr>
            <tr>
              <td>Google Business Profile content</td>
              <td>
                See <a href="#google-retention">Google data retention restrictions</a>.
              </td>
            </tr>
            <tr>
              <td>Reviews from other platforms, scans, reports</td>
              <td>While the workspace exists, or until you delete them or ask us to.</td>
            </tr>
            <tr>
              <td>Activity and integration logs</td>
              <td>While the workspace exists; removed with it.</td>
            </tr>
            <tr>
              <td>Billing and tax records</td>
              <td>As long as tax and accounting law requires.</td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "google-retention",
    title: "Google data retention restrictions",
    content: (
      <>
        <p>
          Google's{" "}
          <a
            href="https://developers.google.com/my-business/content/policies"
            target="_blank"
            rel="noreferrer"
          >
            Business Profile APIs policies
          </a>{" "}
          restrict how long Business Profile content may be stored. At the time of writing, they
          allow storing limited content, securely, for no more than 30 calendar days.
        </p>
        {retentionNotice}
        <p>
          When you disconnect Google, access stops immediately and no further Business Profile
          content is retrieved. Google's policies require that a business can dissociate its
          Business Profile from services like ours within seven business days; disconnecting in{" "}
          {BRAND.name} does this at once.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights and choices",
    content: (
      <>
        <p>
          Depending on where you live, you may have the right to access, correct, delete, export or
          restrict the use of your personal data, to object to processing, and to withdraw consent
          at any time (without affecting processing already carried out). You can exercise these
          rights from <Settings tab="privacy">Settings → Privacy &amp; data</Settings> when signed
          in, or by contacting <PrivacyContact />.
        </p>
        <p>
          We will verify your identity before acting on a request, respond within the time the
          applicable law requires, and will not discriminate against you for exercising your rights.
          You may use an authorised agent where the law allows.
        </p>

        <h3>EEA and UK (GDPR / UK GDPR)</h3>
        <p>
          Rights of access, rectification, erasure, restriction, data portability and objection,
          including to processing based on legitimate interests. You may lodge a complaint with your
          local supervisory authority. Our Data Protection Officer: <Fact k="dpoContact" />. EU
          representative: <Fact k="euRepresentative" />. UK representative:{" "}
          <Fact k="ukRepresentative" />.
        </p>

        <h3>California (CCPA / CPRA)</h3>
        <p>
          California residents may request to know the categories and specific pieces of personal
          information we collect, use and disclose; request deletion or correction; and opt out of
          the sale or sharing of personal information and limit the use of sensitive personal
          information. The categories we collect are listed in{" "}
          <a href="#information-we-collect">Information we collect</a> and are used for the business
          purposes in <a href="#how-we-use">How we use information</a>. In the preceding 12 months
          we have not sold or shared personal information for cross-context behavioural advertising.
        </p>

        <h3>India (DPDP Act, 2023)</h3>
        <p>
          Data principals may request a summary of personal data being processed and the processing
          activities, correction, completion, updating and erasure, nominate another person to
          exercise these rights in the event of death or incapacity, and use grievance redressal.
          Grievance contact: <Fact k="indiaGrievanceOfficer" />. If you are not satisfied with our
          response, you may approach the Data Protection Board of India.
        </p>

        <h3>Everywhere else</h3>
        <p>We extend the same core rights to all users, subject to applicable law.</p>
      </>
    ),
  },
  {
    id: "do-not-sell",
    title: "Do not sell or share",
    content: (
      <p>
        We do not sell personal information, and we do not share it for cross-context behavioural
        advertising, as those terms are defined under California law. Because we do not, there is
        nothing to opt out of today; if this ever changes we will provide a “Do Not Sell or Share My
        Personal Information” mechanism and honour Global Privacy Control signals where required.
      </p>
    ),
  },
  {
    id: "disconnect-google",
    title: "Disconnecting Google",
    content: (
      <>
        <p>You can remove our access to your Google account at any time, in either of two ways:</p>
        <ol>
          <li>
            In {BRAND.name}: <Settings tab="platforms">Settings → Connected platforms</Settings> →
            Disconnect. We revoke the token at Google and delete the stored tokens from our
            database.
          </li>
          <li>
            In your Google account: visit{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
              myaccount.google.com/permissions
            </a>{" "}
            and remove {BRAND.name}.
          </li>
        </ol>
        <p>
          Disconnecting stops all new data retrieval immediately. Review content already synced is
          handled as described in <a href="#google-retention">Google data retention restrictions</a>
          ; to have it removed as well, submit a deletion request.
        </p>
      </>
    ),
  },
  {
    id: "deletion",
    title: "Account and data deletion",
    content: (
      <>
        <p>
          Signed-in users can request deletion of their account, of Google-derived data, or of the
          whole workspace from <Settings tab="privacy">Settings → Privacy &amp; data</Settings>.
          Each request receives a reference number and is recorded in your workspace's activity log.
          You can also email <PrivacyContact /> — including if you cannot sign in.
        </p>
        <p>
          We confirm the request, verify that it comes from someone entitled to make it (for
          workspace-wide deletion, an owner), and carry it out within the period required by
          applicable law. Deletion from backups happens as those backups expire. We may keep limited
          records where the law requires it — for example billing records, or a note that a deletion
          request was completed.
        </p>
      </>
    ),
  },
  {
    id: "reviewers",
    title: "If your review appears in Seovale",
    content: (
      <p>
        Businesses use {BRAND.name} to monitor and respond to public reviews, so your public display
        name, rating and review text may be processed on the business's behalf. We do not collect
        reviewers' contact details or profile photos. If you want to exercise a privacy right over
        that data, contact the business concerned, or contact us at <PrivacyContact /> and we will
        help route your request.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children's privacy",
    content: (
      <p>
        {BRAND.name} is a business tool and is not directed at children. You must be at least{" "}
        <Fact k="minimumAge" /> (and old enough to enter a binding contract where you live) to use
        it. We do not knowingly collect personal data from children; if you believe a child has
        given us personal data, contact <PrivacyContact /> and we will delete it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    content: (
      <p>
        We will update this policy when our practices or the law change. The “Last updated” date and
        version at the top show the current version. For material changes we will notify account
        holders in the product (and by email once email delivery is enabled) before they take
        effect, and ask for renewed consent where the law requires it.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact us",
    content: (
      <>
        <ul>
          <li>
            Privacy requests: <PrivacyContact />, or{" "}
            <Settings tab="privacy">Settings → Privacy &amp; data</Settings> when signed in
          </li>
          <li>
            General support: <Fact k="supportEmail" />
          </li>
          <li>
            Postal address: <Fact k="companyLegalName" />, <Fact k="registeredAddress" />
          </li>
          <li>
            Data Protection Officer: <Fact k="dpoContact" />
          </li>
        </ul>
        <p>
          Read our <Link to="/terms">Terms &amp; Conditions</Link> for the rules that govern use of
          the service.
        </p>
      </>
    ),
  },
];

function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Privacy Policy"
      summary={
        <p>
          What we collect, why, who processes it, how long we keep it, and how you stay in control —
          including exactly how we treat data you let us access from Google.
        </p>
      }
      highlights={[
        {
          title: "No passwords from you",
          body: "Google sign-in happens on Google's page. We never see your Google password.",
        },
        {
          title: "Minimum access",
          body: "Only the permissions a feature needs, only for businesses you manage.",
        },
        {
          title: "Never sold",
          body: "No selling, no advertising use, no training general AI models on Google data.",
        },
        {
          title: "Disconnect any time",
          body: "One click revokes Google access and deletes the stored tokens.",
        },
      ]}
      sections={sections}
    />
  );
}
