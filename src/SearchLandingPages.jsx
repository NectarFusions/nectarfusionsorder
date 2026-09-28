import { useEffect } from "react";

const ORIGIN = "https://nectar-fusions.com";

const PAGES = {
  "/wedding-honey-favors": {
    title: "Wedding Honey Favors | Michigan Honey Favors | NectarFusions",
    description:
      "Create Michigan honey favors for weddings, bridal showers, baby showers, and celebrations with NectarFusions. Choose 2 oz bears or glass hexagons, preset favor bundles, custom quantities, labels, and finishing details.",
    schemaType: "Service",
    eyebrow: "WEDDING & EVENT FAVORS",
    heading: "Michigan Honey Favors Made for Memorable Celebrations",
    lead:
      "Give guests something beautiful, useful, and distinctly Michigan. NectarFusions event favors pair our honey with gift ready 2 oz containers and flexible finishing options for weddings, showers, parties, and celebrations.",
    primary: { href: "/special-events", label: "Plan Your Honey Favors" },
    secondary: { href: "/special-events/order", label: "Build a Custom Favor Order" },
    highlights: [
      ["2 oz Favor Options", "Choose classic plastic bears or glass hexagon jars for your event."],
      ["Preset or Custom Quantities", "Start with 25, 50, or 100 favors, or build the exact quantity you need."],
      ["Personal Finishing", "Add custom labels, honey dippers, thank you tags, bee charms, and event details."],
      ["Michigan Honey", "Built around NectarFusions raw Michigan honey and infused flavor options."],
    ],
    sectionTitle: "A favor your guests can actually enjoy",
    sectionCopy:
      "Honey favors work across rustic, elegant, modern, and outdoor celebrations because they are both a keepsake and something guests can use. Choose your container, quantity, flavors, and finishing details through the NectarFusions Special Event order flow.",
    steps: [
      ["Choose your quantity", "Select a 25, 50, or 100 favor bundle or start a custom event order."],
      ["Choose your container", "Pick 2 oz plastic bears or 2 oz glass hexagon jars."],
      ["Personalize and order", "Select flavors and finishing options, then complete your event order."],
    ],
    faq: [
      ["Can I order an exact quantity instead of a preset bundle?", "Yes. The custom event order lets you build the quantity that fits your guest count."],
      ["What containers are available?", "NectarFusions event favors are available in 2 oz plastic bears and 2 oz glass hexagon jars."],
      ["Can I add custom labels or finishing details?", "Yes. Custom label design and finishing add ons are available within the event ordering flow."],
    ],
  },

  "/corporate-honey-gifts": {
    title: "Corporate Honey Gifts | Michigan Business Gifts | NectarFusions",
    description:
      "Send distinctive Michigan honey gifts to clients, employees, teams, and event guests with NectarFusions business gifting and the Signature Six Michigan Honey Tasting Collection.",
    schemaType: "Service",
    eyebrow: "BUSINESS GIFTING",
    heading: "Michigan Honey Gifts for Clients, Teams, and Business Events",
    lead:
      "Turn a business gift into a memorable tasting experience. NectarFusions offers individual honey gifts and the Signature Six Michigan Honey Tasting Collection for client appreciation, employee gifting, events, and branded business moments.",
    primary: { href: "/partner", label: "Start Business Gifting" },
    secondary: { href: "/about", label: "Meet NectarFusions" },
    highlights: [
      ["Signature Six", "A six honey tasting collection with five NectarFusions favorites and one seasonal discovery."],
      ["Individual Gifts", "Use ready to gift 2 oz honey options for clients, employees, guests, and events."],
      ["Business Presentation", "Customize presentation elements while keeping the honey jars NectarFusions branded."],
      ["Repeat Ordering", "Business partners can return to the partner system for future gifting needs."],
    ],
    sectionTitle: "A Michigan gift that feels intentional",
    sectionCopy:
      "NectarFusions business gifting is designed for companies that want something more distinctive than generic promotional merchandise. The focus stays on a real Michigan food product, thoughtful presentation, and a repeatable ordering relationship.",
    steps: [
      ["Choose Business Gifting", "Start through the NectarFusions Partner page and select the Business Gifting program."],
      ["Choose your gift format", "Select individual honey gifts or the Signature Six tasting collection."],
      ["Plan presentation and fulfillment", "Coordinate quantities, presentation details, and the fulfillment option that fits your order."],
    ],
    faq: [
      ["What is the Signature Six?", "It is a six jar Michigan honey tasting collection featuring five NectarFusions favorites plus one seasonal discovery."],
      ["Can a business customize the gift presentation?", "Yes. Business presentation can be customized while the individual honey jars remain NectarFusions branded."],
      ["Is business gifting separate from personal event favors?", "Yes. Business gifting runs through the NectarFusions Partner program, while personal celebrations use the Special Event ordering flow."],
    ],
  },

  "/wholesale-michigan-honey": {
    title: "Wholesale Michigan Honey | Retail & Foodservice Partners | NectarFusions",
    description:
      "Partner with NectarFusions for wholesale Michigan honey, retail jars, foodservice, hospitality, gifting, and repeat ordering through the NectarFusions Partner program.",
    schemaType: "Service",
    eyebrow: "WHOLESALE & PARTNERS",
    heading: "Wholesale Michigan Honey Built for Repeat Partnership",
    lead:
      "Bring NectarFusions into your store, café, restaurant, venue, hospitality program, or business. Our partner system is designed to make initial ordering and future replenishment easier without rebuilding every order from scratch.",
    primary: { href: "/partner", label: "Apply to Become a Partner" },
    secondary: { href: "/find-us", label: "See Where to Find Us" },
    highlights: [
      ["Retail Ready Sizes", "Partner ordering supports NectarFusions retail jars across core consumer sizes."],
      ["Foodservice & Bulk", "Foodservice and bulk honey needs are handled as a distinct partner channel."],
      ["Multiple Partner Programs", "Retail, foodservice, hospitality, business gifting, and other partnership paths can live under one business relationship."],
      ["Replenishment Focused", "The partner system is structured for repeat ordering after the first order is established."],
    ],
    sectionTitle: "A partner system designed to keep honey moving",
    sectionCopy:
      "NectarFusions is building a repeatable partner model rather than treating every business order as a one off request. Approved partners can choose the program that matches how they serve customers and use a dedicated ordering workflow for future needs.",
    steps: [
      ["Choose your partner program", "Select the program or programs that match your business."],
      ["Create your business account", "Complete the NectarFusions partner application and business information."],
      ["Order and replenish", "Use the partner ordering system for initial purchases and repeat replenishment."],
    ],
    faq: [
      ["Who can apply?", "Retailers, foodservice businesses, hospitality businesses, corporate gifting buyers, and other qualified partners can start through the Partner page."],
      ["Are foodservice and retail the same program?", "No. They are separate partner paths because their product formats and ordering needs are different."],
      ["Can partners reorder later?", "Yes. The partner system is designed around repeat ordering and replenishment after the account is established."],
    ],
  },

  "/michigan-infused-honey": {
    title: "Michigan Infused Honey | Raw Cold Infused Honey | NectarFusions",
    description:
      "Shop NectarFusions Michigan raw unfiltered honey and small batch infused honey. Our proprietary cold infusion process uses no added heat and keeps the honey at the center of every flavor.",
    schemaType: "CollectionPage",
    eyebrow: "MICHIGAN INFUSED HONEY",
    heading: "Raw Michigan Honey, Reimagined Through Cold Infusion",
    lead:
      "NectarFusions starts with Michigan raw unfiltered honey and builds flavor through a proprietary cold infusion process with no added heat. The result is a growing collection of infused honeys made for drizzling, spreading, gifting, cooking, and discovering new favorites.",
    primary: { href: "/", label: "Shop NectarFusions Honey" },
    secondary: { href: "/about", label: "Learn Our Story" },
    highlights: [
      ["Michigan Honey", "We source honey from Michigan beekeepers and keep the origin central to the brand."],
      ["Raw & Unfiltered", "Our honey is strained rather than filtered so naturally occurring pollen is retained."],
      ["Cold Infused", "Our proprietary infusion process uses no added heat and follows specific recipes, timing, and processing methods."],
      ["Real Flavor Variety", "Explore fruit, spice, pepper, coffee, cocoa, seasonal, and classic honey profiles."],
    ],
    sectionTitle: "Honey with a process behind every flavor",
    sectionCopy:
      "Infused honey should still taste and behave like honey. NectarFusions uses controlled measurements, ingredient blends, processing methods, and infusion timing to create repeatable flavor while protecting the character of the Michigan honey underneath.",
    steps: [
      ["Start with Michigan honey", "Raw unfiltered honey forms the base of the NectarFusions collection."],
      ["Cold infuse the flavor", "Ingredients are introduced without added heat through the NectarFusions infusion process."],
      ["Choose how you use it", "Drizzle regular honey, spread spun honey, cook with it, pair it with food, or build a gift."],
    ],
    faq: [
      ["What does cold infused mean?", "For NectarFusions, cold infusion means the flavor is incorporated without adding heat to the honey during the infusion process."],
      ["Is NectarFusions honey filtered?", "It is strained rather than filtered, which allows naturally occurring pollen to remain in the honey."],
      ["Where does the honey come from?", "NectarFusions uses Michigan honey sourced from Michigan beekeepers."],
    ],
  },
};

const RELATED = [
  ["/michigan-infused-honey", "Michigan Infused Honey"],
  ["/wedding-honey-favors", "Wedding Honey Favors"],
  ["/corporate-honey-gifts", "Corporate Honey Gifts"],
  ["/wholesale-michigan-honey", "Wholesale Michigan Honey"],
];

function setMeta(attribute, key, content) {
  let tag = document.head.querySelector("meta[" + attribute + '="' + key + '"]');

  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }

  tag.setAttribute("content", content);
}

function useLandingSeo(page, path) {
  useEffect(() => {
    const url = ORIGIN + path;

    document.title = page.title;
    setMeta("name", "description", page.description);
    setMeta("name", "robots", "index, follow, max-image-preview:large");
    setMeta("property", "og:type", "website");
    setMeta("property", "og:title", page.title);
    setMeta("property", "og:description", page.description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", ORIGIN + "/nectarfusions-honey-hero.webp");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", page.title);
    setMeta("name", "twitter:description", page.description);

    let canonical = document.head.querySelector('link[rel="canonical"]');

    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }

    canonical.setAttribute("href", url);

    const existing = document.getElementById("nf-search-landing-schema");
    if (existing) existing.remove();

    const pageNode = {
      "@type": page.schemaType,
      "@id": url + "#page",
      url,
      name: page.title,
      description: page.description,
      isPartOf: {
        "@type": "WebSite",
        "@id": ORIGIN + "/#website",
        name: "NectarFusions",
        url: ORIGIN + "/",
      },
    };

    if (page.schemaType === "Service") {
      pageNode.provider = {
        "@type": "Organization",
        "@id": ORIGIN + "/#organization",
        name: "NectarFusions",
        url: ORIGIN + "/",
      };
    }

    const schema = document.createElement("script");
    schema.id = "nf-search-landing-schema";
    schema.type = "application/ld+json";
    schema.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        pageNode,
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: ORIGIN + "/",
            },
            {
              "@type": "ListItem",
              position: 2,
              name: page.heading,
              item: url,
            },
          ],
        },
        {
          "@type": "FAQPage",
          mainEntity: page.faq.map(([question, answer]) => ({
            "@type": "Question",
            name: question,
            acceptedAnswer: {
              "@type": "Answer",
              text: answer,
            },
          })),
        },
      ],
    });

    document.head.appendChild(schema);
  }, [page, path]);
}

const css = "\n:root{color-scheme:light}\n*{box-sizing:border-box}\nbody{margin:0;background:#F7F2EA;color:#18394A}\n.seo-page{min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}\n.seo-shell{width:min(1160px,calc(100% - 36px));margin:0 auto}\n.seo-header{background:#FFFDF8;border-bottom:1px solid #E8DDCF;position:sticky;top:0;z-index:20}\n.seo-header-inner{min-height:76px;display:flex;align-items:center;justify-content:space-between;gap:24px}\n.seo-brand{display:inline-flex;align-items:center;gap:10px;color:#18394A;text-decoration:none;font-weight:900;letter-spacing:.02em}\n.seo-brand img{width:54px;height:54px;object-fit:contain}\n.seo-nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:18px}\n.seo-nav a{color:#28566E;text-decoration:none;font-size:14px;font-weight:800}\n.seo-nav a:hover{text-decoration:underline}\n.seo-hero{background:linear-gradient(135deg,#12384D 0%,#185B78 58%,#1B6F91 100%);color:#fff;padding:88px 0 78px}\n.seo-hero-grid{display:grid;grid-template-columns:1.35fr .65fr;gap:54px;align-items:center}\n.seo-kicker{color:#F7C41C;font-size:13px;font-weight:950;letter-spacing:.16em;margin-bottom:16px}\n.seo-hero h1{margin:0;max-width:850px;font-family:Georgia,\"Times New Roman\",serif;font-size:clamp(42px,6vw,72px);line-height:.98;letter-spacing:-.035em}\n.seo-lead{max-width:760px;margin:24px 0 0;font-size:19px;line-height:1.75;color:#F2F6F7}\n.seo-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}\n.seo-button{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:13px 19px;border-radius:999px;text-decoration:none;font-weight:900;border:2px solid #F7C41C}\n.seo-button.primary{color:#17384A;background:#F7C41C}\n.seo-button.secondary{color:#fff;background:transparent}\n.seo-hero-mark{display:grid;place-items:center;min-height:300px;border-radius:30px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18)}\n.seo-hero-mark img{width:min(240px,72%);height:auto;filter:drop-shadow(0 18px 28px rgba(0,0,0,.18))}\n.seo-trust{background:#FFFDF8;border-bottom:1px solid #E8DDCF}\n.seo-trust-grid{display:grid;grid-template-columns:repeat(3,1fr)}\n.seo-trust-item{padding:20px 18px;text-align:center;font-size:13px;font-weight:950;letter-spacing:.08em;color:#28566E;border-right:1px solid #E8DDCF}\n.seo-trust-item:last-child{border-right:0}\n.seo-section{padding:76px 0}\n.seo-section.alt{background:#FFFDF8}\n.seo-section h2{margin:0 0 14px;font-family:Georgia,\"Times New Roman\",serif;font-size:clamp(34px,4vw,48px);line-height:1.05;color:#17384A}\n.seo-section-intro{max-width:780px;margin:0 0 34px;color:#4E7185;font-size:17px;line-height:1.8}\n.seo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}\n.seo-card{padding:25px;border-radius:18px;background:#fff;border:1px solid #E5D8C7;box-shadow:0 9px 25px rgba(39,65,78,.06)}\n.seo-card h3{margin:0 0 10px;font-size:18px;color:#17384A}\n.seo-card p{margin:0;color:#55778A;line-height:1.7;font-size:15px}\n.seo-step-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;counter-reset:step}\n.seo-step{position:relative;padding:62px 25px 25px;border-radius:18px;background:#17384A;color:#fff;counter-increment:step}\n.seo-step:before{content:counter(step);position:absolute;top:20px;left:24px;width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#F7C41C;color:#17384A;font-weight:950}\n.seo-step h3{margin:0 0 10px;font-size:19px}\n.seo-step p{margin:0;color:#DCE8ED;line-height:1.7;font-size:15px}\n.seo-faq{display:grid;gap:12px;max-width:900px}\n.seo-faq details{background:#fff;border:1px solid #E5D8C7;border-radius:14px;padding:18px 20px}\n.seo-faq summary{cursor:pointer;font-weight:900;color:#17384A}\n.seo-faq p{color:#55778A;line-height:1.7;margin:12px 0 0}\n.seo-related{display:flex;flex-wrap:wrap;gap:10px}\n.seo-related a{padding:11px 14px;border-radius:999px;background:#FFF7DF;color:#28566E;border:1px solid #E4C86C;text-decoration:none;font-weight:850;font-size:14px}\n.seo-cta{padding:34px;border-radius:24px;background:#17384A;color:#fff;display:flex;justify-content:space-between;gap:26px;align-items:center}\n.seo-cta h2{color:#fff;margin-bottom:8px}\n.seo-cta p{margin:0;color:#DCE8ED;line-height:1.7}\n.seo-footer{padding:38px 0 48px;background:#102F40;color:#DCE8ED}\n.seo-footer-grid{display:flex;flex-wrap:wrap;justify-content:space-between;gap:18px;align-items:center}\n.seo-footer a{color:#F7C41C}\n@media(max-width:900px){\n  .seo-header{position:static}\n  .seo-header-inner{padding:10px 0;align-items:flex-start}\n  .seo-nav{gap:10px 14px}\n  .seo-hero{padding:64px 0 58px}\n  .seo-hero-grid{grid-template-columns:1fr}\n  .seo-hero-mark{min-height:220px}\n  .seo-grid{grid-template-columns:repeat(2,1fr)}\n}\n@media(max-width:640px){\n  .seo-shell{width:min(100% - 24px,1160px)}\n  .seo-header-inner{display:block}\n  .seo-brand{margin-bottom:10px}\n  .seo-nav{justify-content:flex-start}\n  .seo-hero h1{font-size:43px}\n  .seo-lead{font-size:17px}\n  .seo-trust-grid,.seo-grid,.seo-step-grid{grid-template-columns:1fr}\n  .seo-trust-item{border-right:0;border-bottom:1px solid #E8DDCF}\n  .seo-trust-item:last-child{border-bottom:0}\n  .seo-section{padding:56px 0}\n  .seo-cta{align-items:flex-start;flex-direction:column}\n  .seo-button{width:100%}\n}\n";

export default function SearchLandingPages() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const page = PAGES[path] || PAGES["/michigan-infused-honey"];

  useLandingSeo(page, path);

  return (
    <div className="seo-page">
      <style>{css}</style>

      <header className="seo-header">
        <div className="seo-shell seo-header-inner">
          <a className="seo-brand" href="/" aria-label="NectarFusions home">
            <img src="/logo.png" alt="NectarFusions" width="54" height="54" />
            <span>NectarFusions</span>
          </a>

          <nav className="seo-nav" aria-label="Main navigation">
            <a href="/">Shop</a>
            <a href="/honey-club">Honey Club</a>
            <a href="/special-events">Special Events</a>
            <a href="/partner">Partner</a>
            <a href="/about">About</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="seo-hero">
          <div className="seo-shell seo-hero-grid">
            <div>
              <div className="seo-kicker">{page.eyebrow}</div>
              <h1>{page.heading}</h1>
              <p className="seo-lead">{page.lead}</p>

              <div className="seo-actions">
                <a className="seo-button primary" href={page.primary.href}>
                  {page.primary.label} →
                </a>
                <a className="seo-button secondary" href={page.secondary.href}>
                  {page.secondary.label}
                </a>
              </div>
            </div>

            <div className="seo-hero-mark" aria-hidden="true">
              <img src="/logo.png" alt="" />
            </div>
          </div>
        </section>

        <div className="seo-trust">
          <div className="seo-shell seo-trust-grid">
            <div className="seo-trust-item">MICHIGAN HONEY</div>
            <div className="seo-trust-item">RAW & UNFILTERED</div>
            <div className="seo-trust-item">FAMILY OWNED SMALL BUSINESS</div>
          </div>
        </div>

        <section className="seo-section">
          <div className="seo-shell">
            <h2>{page.sectionTitle}</h2>
            <p className="seo-section-intro">{page.sectionCopy}</p>

            <div className="seo-grid">
              {page.highlights.map(([title, copy]) => (
                <article className="seo-card" key={title}>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="seo-section alt">
          <div className="seo-shell">
            <h2>How it works</h2>
            <p className="seo-section-intro">
              A clear path from discovery to ordering, built around the NectarFusions system already in place.
            </p>

            <div className="seo-step-grid">
              {page.steps.map(([title, copy]) => (
                <article className="seo-step" key={title}>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="seo-section">
          <div className="seo-shell">
            <h2>Common questions</h2>
            <p className="seo-section-intro">
              Quick answers before you move into the ordering or partner flow.
            </p>

            <div className="seo-faq">
              {page.faq.map(([question, answer]) => (
                <details key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="seo-section alt">
          <div className="seo-shell">
            <h2>Explore NectarFusions</h2>
            <p className="seo-section-intro">
              Find the NectarFusions path that matches what you are shopping or planning for.
            </p>

            <div className="seo-related">
              {RELATED.map(([href, label]) => (
                <a href={href} key={href}>{label}</a>
              ))}
              <a href="/honey-club">Honey Club</a>
              <a href="/find-us">Find Us</a>
              <a href="/about">About NectarFusions</a>
            </div>
          </div>
        </section>

        <section className="seo-section">
          <div className="seo-shell">
            <div className="seo-cta">
              <div>
                <h2>Ready to move forward?</h2>
                <p>{page.lead}</p>
              </div>

              <a className="seo-button primary" href={page.primary.href}>
                {page.primary.label} →
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="seo-footer">
        <div className="seo-shell seo-footer-grid">
          <div>
            <strong>NectarFusions</strong><br />
            Michigan raw unfiltered honey and infused honey.
          </div>
          <div>
            <a href="mailto:info@nectar-fusions.com">info@nectar-fusions.com</a>
            {" · "}
            <a href="tel:+19899416385">(989) 941-6385</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
