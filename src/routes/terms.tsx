import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Fact,
  LegalDocument,
  PrivacyContact,
  type LegalSection,
} from "@/components/legal/LegalDocument";
import { BRAND } from "@/lib/domain";
import { LEGAL } from "@/lib/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: `Terms & Conditions — ${BRAND.name}` },
      {
        name: "description",
        content: `The terms that govern use of ${BRAND.name}, including review monitoring, AI assistance and Google Business Profile connections.`,
      },
      { property: "og:title", content: `Terms & Conditions — ${BRAND.name}` },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: `${LEGAL.website}/terms` }],
  }),
  component: TermsPage,
});

const sections: LegalSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of these Terms",
    content: (
      <>
        <p>
          These Terms &amp; Conditions (“Terms”) are an agreement between you and{" "}
          <Fact k="companyLegalName" /> (“{BRAND.name}”, “we”, “us”) for use of the {BRAND.name}{" "}
          website and software-as-a-service platform (the “Service”).
        </p>
        <p>
          By creating an account, signing in or using the Service, you agree to these Terms and
          acknowledge our <Link to="/privacy">Privacy Policy</Link>. If you use the Service for an
          organisation, you confirm that you are authorised to bind it, and “you” includes that
          organisation. If you do not agree, do not use the Service.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "Eligibility",
    content: (
      <p>
        The Service is for businesses and professionals. You must be at least{" "}
        <Fact k="minimumAge" />, able to form a binding contract, and not barred from using the
        Service under any applicable law, including sanctions laws.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Account registration and security",
    content: (
      <>
        <p>
          Give accurate, current information when you register and keep it up to date. You are
          responsible for all activity under your account and for the actions of people you invite
          to your workspace.
        </p>
        <ul>
          <li>Keep your password confidential and use one you do not use elsewhere.</li>
          <li>
            Give workspace roles only to people who need them; owners and admins can connect and
            disconnect platforms.
          </li>
          <li>
            Tell us promptly at <PrivacyContact /> if you suspect unauthorised access.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "subscriptions",
    title: "Subscriptions and payment",
    content: (
      <>
        <p>
          Some features require a paid plan or licence. The price, billing period, included usage
          and renewal terms are those shown when you purchase or set out in your order or licence.
          Unless stated otherwise, fees are payable in advance, exclusive of taxes, and plans renew
          automatically until cancelled.
        </p>
        <p>
          We may change prices for future billing periods with reasonable advance notice. Unpaid
          fees may lead to suspension of paid features after notice.
        </p>
      </>
    ),
  },
  {
    id: "cancellation",
    title: "Cancellation and refunds",
    content: (
      <>
        <p>
          You can cancel at any time; cancellation takes effect at the end of the current billing
          period unless stated otherwise.
        </p>
        <p>
          Refund policy: <Fact k="refundPolicy" />
        </p>
        <p>
          Nothing in these Terms limits any refund or cancellation right you have under mandatory
          consumer law.
        </p>
      </>
    ),
  },
  {
    id: "use-of-service",
    title: "Using the Service",
    content: (
      <p>
        Subject to these Terms and any applicable plan limits, we grant you a limited,
        non-exclusive, non-transferable, revocable right to use the Service for your internal
        business purposes during your subscription. Features may differ between plans, and some
        features depend on third-party services that you choose to connect.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use and prohibited activities",
    content: (
      <>
        <p>
          You must use the Service lawfully and honestly. You must not, and must not help anyone
          else to:
        </p>
        <ul>
          <li>
            Create, buy, sell, solicit or post fake, incentivised, misleading or
            conflict-of-interest reviews.
          </li>
          <li>
            Create fake business listings, impersonate a business or person, or manage a business
            profile you are not authorised to manage.
          </li>
          <li>
            Harass, threaten, intimidate or retaliate against reviewers, or try to identify
            anonymous reviewers to do so.
          </li>
          <li>
            File policy reports, removal requests or legal notices you know to be false, or that are
            intended to suppress genuine, lawful feedback.
          </li>
          <li>Use the Service to break any platform's terms or policies, including Google's.</li>
          <li>
            Scrape, reverse engineer, overload, probe or bypass the security or usage limits of the
            Service or of connected platforms.
          </li>
          <li>
            Upload malware, or content that is unlawful, infringing or violates anyone's privacy.
          </li>
          <li>
            Resell, sublicense or provide the Service to third parties except as your plan allows.
          </li>
          <li>
            Use the Service to build a competing product, or to train AI models on the Service's
            output or data.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "google-authorization",
    title: "Google Business Profile authorization",
    content: (
      <>
        <p>
          You can connect Google Business Profile and other Google services through Google's OAuth
          consent screen. By connecting, you confirm that:
        </p>
        <ul>
          <li>
            You are authorised by the business to manage its Business Profile and to let the Service
            access it.
          </li>
          <li>You have the right to grant the permissions shown on Google's consent screen.</li>
          <li>You will keep that authority current, and disconnect if it ends.</li>
          <li>
            You remain responsible for your Google account, its security, and every action taken
            through it.
          </li>
        </ul>
        <p>
          The Service does not post replies or take other actions on your Business Profile
          automatically. A reply is published only when a person in your workspace presses Publish,
          and that person and your organisation are responsible for its content. You can disconnect
          at any time from Settings or from your Google account permissions page.
        </p>
      </>
    ),
  },
  {
    id: "review-scanning",
    title: "Review monitoring and scanning",
    content: (
      <p>
        The Service collects reviews from platforms you connect, and scans public information about
        domains and businesses you choose. Coverage depends on what each platform makes available,
        on your plan, and on API limits. Some reviews may be missing, delayed or later changed or
        removed by the platform. Scores, sentiment and alerts are calculated from the data we
        actually received and should be treated as indicators, not certainties.
      </p>
    ),
  },
  {
    id: "ai",
    title: "AI-generated analysis and recommendations",
    content: (
      <>
        <p>
          The Service uses AI to draft replies, classify reviews, suggest removal routes and write
          reports. AI output is informational and assistive only:
        </p>
        <ul>
          <li>
            It may be inaccurate, incomplete or out of date, and must be reviewed by a person before
            use.
          </li>
          <li>
            It is <strong>not legal advice</strong>, and no lawyer–client relationship is created.
            For legal questions, consult a qualified lawyer in the relevant jurisdiction.
          </li>
          <li>
            You are responsible for your decisions, and for anything you publish, submit or send
            using the Service.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "no-guarantee",
    title: "No guarantee of removal, ranking or reputation outcomes",
    content: (
      <>
        <p>
          {BRAND.name} works to identify every legitimate route open to you — platform policy
          reports, appeals, business support escalation and legal routes — and helps you prepare and
          track them. We do not control the platforms, and so we do not and cannot guarantee:
        </p>
        <ul>
          <li>that any review will be removed, hidden or edited;</li>
          <li>any improvement in Google search results, rankings or visibility;</li>
          <li>any improvement in ratings, reputation, customer numbers or revenue;</li>
          <li>that Google or any platform will approve an application, appeal or request;</li>
          <li>continued access to any Business Profile or platform account.</li>
        </ul>
        <p>
          Whether a review is removed depends on the platform's policies, whether the review
          breaches them, its content and context, the platform's automated systems and reviewers,
          and the platform's final decision. A review that is lawful and within policy will
          generally stay up, and it should.
        </p>
      </>
    ),
  },
  {
    id: "your-data",
    title: "Your content and data",
    content: (
      <>
        <p>
          You keep all rights in the content and data you bring into the Service (“Customer Data”).
          You grant us a limited licence to host, process and transmit Customer Data only to
          provide, secure and support the Service for you, as described in our{" "}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          You are responsible for the accuracy of information you submit, and for having the rights
          and any required legal basis to process it — including personal data of reviewers and
          customers. We do not sell Customer Data.
        </p>
      </>
    ),
  },
  {
    id: "ip",
    title: "Intellectual property",
    content: (
      <p>
        The Service, including its software, design, text and branding, belongs to {BRAND.name} and
        its licensors and is protected by intellectual-property law. These Terms do not transfer any
        of those rights to you. If you send us feedback, we may use it without obligation to you.
      </p>
    ),
  },
  {
    id: "third-party",
    title: "Third-party services",
    content: (
      <p>
        The Service connects to services we do not control, such as Google, Meta, YouTube,
        Trustpilot and AI model providers. Your use of them is governed by their own terms and
        privacy policies, and we are not responsible for their availability, content, decisions or
        changes.
      </p>
    ),
  },
  {
    id: "google-disclaimer",
    title: "Google disclaimer",
    content: (
      <p>
        {BRAND.name} is an independent service. It is not affiliated with, sponsored by or endorsed
        by Google LLC. Google, Google Business Profile, YouTube and related marks are trademarks of
        Google LLC and are used only to describe the services our product connects to. Google data
        is handled in line with the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>{" "}
        and Google's{" "}
        <a
          href="https://developers.google.com/my-business/content/policies"
          target="_blank"
          rel="noreferrer"
        >
          Business Profile APIs policies
        </a>
        , as described in our{" "}
        <Link to="/privacy" hash="google-data">
          Privacy Policy
        </Link>
        .
      </p>
    ),
  },
  {
    id: "availability",
    title: "API limitations and service availability",
    content: (
      <>
        <p>
          We aim to keep the Service available and reliable, but we do not guarantee uninterrupted
          or error-free operation, or any particular uptime unless a separate written agreement says
          so. The Service may be unavailable during maintenance or for reasons beyond our control.
        </p>
        <p>
          Third-party APIs impose quotas and rate limits, require approvals, and can change, degrade
          or be withdrawn without notice. When that happens, related features may stop working or
          change, and we will tell you in the product what is affected.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security responsibilities",
    content: (
      <p>
        We protect the Service with measures appropriate to the risk, described in our{" "}
        <Link to="/privacy" hash="security">
          Privacy Policy
        </Link>
        . You are responsible for securing your devices, your credentials and your connected
        third-party accounts, for managing workspace access, and for any API keys you add to the
        Service. Report suspected vulnerabilities to <PrivacyContact />.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    content: (
      <>
        <p>
          You can stop using the Service and close your account at any time. We may suspend or end
          your access, with notice where reasonable, if you materially breach these Terms, fail to
          pay, create security or legal risk, or if a connected platform requires it. Where
          possible, we will give you a chance to fix the problem first.
        </p>
        <h3>Your data after termination</h3>
        <p>
          On termination, we revoke and delete stored OAuth tokens for connected services. You may
          request an export of your Customer Data before or within a reasonable period after
          termination. Customer Data is then deleted as described in the{" "}
          <Link to="/privacy" hash="deletion">
            Privacy Policy
          </Link>
          , except records we must keep by law.
        </p>
      </>
    ),
  },
  {
    id: "warranties",
    title: "Disclaimer of warranties",
    content: (
      <p>
        To the maximum extent permitted by law, the Service is provided “as is” and “as available”,
        without warranties of any kind, whether express, implied or statutory, including warranties
        of merchantability, fitness for a particular purpose, accuracy and non-infringement. Some
        jurisdictions do not allow these exclusions, so some of them may not apply to you.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    content: (
      <>
        <p>To the maximum extent permitted by law:</p>
        <ul>
          <li>
            neither party is liable for indirect, incidental, special, consequential or punitive
            damages, or for lost profits, revenue, goodwill or data, even if advised of the
            possibility;
          </li>
          <li>
            our total liability arising out of or relating to the Service is limited to the fees you
            paid us for the Service in the 12 months before the event giving rise to the claim.
          </li>
        </ul>
        <p>
          Nothing in these Terms limits liability that cannot be limited by law, such as liability
          for fraud, or for death or personal injury caused by negligence.
        </p>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnification",
    content: (
      <p>
        You will defend and indemnify {BRAND.name} against third-party claims, and related losses
        and reasonable costs, arising from your Customer Data, your breach of these Terms, content
        you publish or submit through the Service, or your violation of law or of a third party's
        rights or platform policies.
      </p>
    ),
  },
  {
    id: "force-majeure",
    title: "Force majeure",
    content: (
      <p>
        Neither party is liable for delay or failure caused by events beyond its reasonable control,
        such as natural disasters, war, terrorism, civil unrest, labour disputes, government action,
        internet or utility failures, or failures or changes of third-party platforms and APIs. This
        does not excuse payment obligations.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    content: (
      <>
        <p>
          These Terms are governed by the laws of <Fact k="governingLaw" />, without regard to
          conflict-of-law rules.
        </p>
        <p>
          Before starting formal proceedings, each party agrees to try to resolve a dispute
          informally by contacting the other and negotiating in good faith for 30 days. Disputes
          that are not resolved will be decided by <Fact k="disputeResolution" />.
        </p>
        <p>
          If you are a consumer, you keep the protection of the mandatory laws of the country where
          you live, and may bring proceedings in its courts.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    content: (
      <p>
        We may update these Terms. For material changes we will give reasonable advance notice in
        the product. The version and date at the top show which Terms apply. Continuing to use the
        Service after changes take effect means you accept them; if you do not, you may cancel
        before they do.
      </p>
    ),
  },
  {
    id: "general",
    title: "General",
    content: (
      <p>
        These Terms, together with the Privacy Policy and any order or licence, are the entire
        agreement between you and us about the Service. If any provision is unenforceable, the rest
        remains in effect. Failure to enforce a provision is not a waiver. You may not assign these
        Terms without our consent; we may assign them to a successor of our business.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <ul>
        <li>
          Legal and privacy: <PrivacyContact />
        </li>
        <li>
          Support: <Fact k="supportEmail" />
        </li>
        <li>
          Post: <Fact k="companyLegalName" />, <Fact k="registeredAddress" />
        </li>
      </ul>
    ),
  },
];

function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Terms & Conditions"
      summary={
        <p>
          The rules for using {BRAND.name}: what we provide, what we ask of you, and — just as
          important — what no reputation service can honestly promise.
        </p>
      }
      highlights={[
        {
          title: "Every legitimate route",
          body: "We prepare every valid option. The platform makes the final decision.",
        },
        {
          title: "You stay in control",
          body: "Nothing is posted to Google or any platform unless a person presses Publish.",
        },
        {
          title: "AI assists, you decide",
          body: "AI drafts and suggestions are not legal advice and need your review.",
        },
        {
          title: "Independent of Google",
          body: "Not affiliated with, sponsored or endorsed by Google.",
        },
      ]}
      sections={sections}
    />
  );
}
