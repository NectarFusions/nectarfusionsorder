import { useState } from "react";

const CSS = `
.nf-market-confirmation{
  min-height:100vh;
  padding:0 18px 72px;
  background:
    radial-gradient(circle at 12% 0%,rgba(247,196,28,.13),transparent 28%),
    linear-gradient(180deg,#FBF6EE 0%,#F6EEE3 100%);
  color:#1B1005;
}
.nf-market-main{width:min(820px,100%);margin:0 auto}
.nf-market-header{text-align:center;padding:28px 0 24px}
.nf-market-logo{
  display:inline-flex;
  border:0;
  background:transparent;
  padding:0;
  cursor:pointer;
}
.nf-market-kicker{
  margin-top:12px;
  color:#B97400;
  font-size:11px;
  font-weight:900;
  letter-spacing:.18em;
  text-transform:uppercase;
}
.nf-market-header h1{
  margin:6px 0 0;
  color:#1B1005;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:clamp(58px,10vw,92px);
  line-height:.9;
  letter-spacing:.02em;
}
.nf-market-header p{
  margin:10px auto 0;
  max-width:520px;
  color:#7B5821;
  font-size:17px;
  line-height:1.65;
}
.nf-confirmation-sheet{
  overflow:hidden;
  border:1px solid #E5D8C6;
  border-radius:28px;
  background:rgba(255,253,248,.96);
  box-shadow:0 22px 55px rgba(74,51,19,.10);
}
.nf-status-row{
  display:grid;
  grid-template-columns:auto 1fr;
  align-items:center;
  gap:16px;
  padding:24px 26px;
  background:linear-gradient(135deg,#FFF9DF,#FFF3B7);
  border-bottom:1px solid #EADAA1;
}
.nf-status-icon{
  width:54px;
  height:54px;
  display:grid;
  place-items:center;
  border-radius:50%;
  background:#F7C41C;
  color:#1B1005;
  font-size:28px;
  font-weight:900;
  box-shadow:inset 0 0 0 1px rgba(122,77,0,.16);
}
.nf-status-copy h2{
  margin:3px 0 0;
  color:#4A3313;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:clamp(34px,5vw,48px);
  line-height:.96;
}
.nf-status-copy p{
  margin:8px 0 0;
  color:#7B5821;
  font-size:17px;
  font-weight:700;
  line-height:1.55;
}
.nf-sheet-section{padding:24px 26px;border-bottom:1px solid #E9DFD2}
.nf-sheet-section:last-child{border-bottom:0}
.nf-market-label{
  color:#B97400;
  font-size:14px;
  font-weight:900;
  letter-spacing:.12em;
  text-transform:uppercase;
}
.nf-confirmation-details{
  display:grid;
  grid-template-columns:1fr 1.4fr;
  gap:22px;
  margin-top:12px;
}
.nf-detail-value{
  margin-top:7px;
  color:#4A3313;
  font-size:18px;
  font-weight:750;
  line-height:1.5;
  overflow-wrap:anywhere;
}
.nf-pickup-top{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:start;
  gap:24px;
}
.nf-pickup-top h3{
  margin:6px 0 0;
  color:#1B1005;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:clamp(32px,5vw,44px);
  line-height:1;
}
.nf-market-details{
  margin-top:12px;
  color:#6F6252;
  font-size:17px;
  line-height:1.7;
}
.nf-total-block{text-align:right}
.nf-market-total{
  display:block;
  margin-top:5px;
  color:#B97400;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:42px;
  line-height:1;
}
.nf-market-items{
  margin-top:20px;
  border-top:1px solid #E9DFD2;
}
.nf-market-item{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:14px;
  padding:15px 0;
  border-bottom:1px solid #EFE7DC;
  color:#4A3313;
  font-size:17px;
  line-height:1.5;
}
.nf-market-item:last-child{border-bottom:0}
.nf-market-item strong{font-weight:800}
.nf-market-item span:last-child{color:#8C7A64;text-align:right}
.nf-pay-button{
  width:100%;
  min-height:50px;
  margin-top:18px;
  padding:12px 20px;
  border:1px solid #D69500;
  border-radius:14px;
  background:linear-gradient(145deg,#FFE45A,#F7C41C);
  color:#1B1005;
  font:inherit;
  font-weight:900;
  cursor:pointer;
}
.nf-pay-button:disabled{opacity:.6;cursor:not-allowed}
.nf-change-strip{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:18px;
  padding:22px 26px;
  background:#FFF9EA;
  border-top:1px solid #EAD9A6;
}
.nf-change-strip strong{
  display:block;
  color:#4A3313;
  font-size:18px;
  line-height:1.45;
}
.nf-change-strip p{
  margin:7px 0 0;
  color:#6F6252;
  font-size:16px;
  line-height:1.65;
}
.nf-yellow{
  min-height:46px;
  padding:11px 18px;
  border:1px solid #D69500;
  border-radius:13px;
  background:linear-gradient(145deg,#FFE45A,#F7C41C);
  color:#1B1005;
  font:inherit;
  font-size:16px;
  font-weight:900;
  cursor:pointer;
}
.nf-yellow:disabled{
  border-color:#D8CDBD;
  background:#E9E2D8;
  color:#958A7C;
  box-shadow:none;
  cursor:not-allowed;
  opacity:1;
}
.nf-market-actions{
  display:grid;
  grid-template-columns:auto auto auto auto;
  align-items:center;
  justify-content:center;
  gap:14px 28px;
  margin-top:22px;
}
.nf-market-actions button,.nf-market-actions a{
  min-height:44px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border:0;
  background:transparent;
  color:#6C4C1E;
  font:inherit;
  font-size:16px;
  font-weight:800;
  line-height:1.2;
  text-decoration:none;
  white-space:nowrap;
  cursor:pointer;
}
.nf-market-actions .nf-primary-action{
  min-height:44px;
  padding:10px 18px;
  border:1px solid #D9A519;
  border-radius:999px;
  background:#F7C41C;
  color:#1B1005;
}
.nf-market-club{
  margin-top:24px;
  padding:24px 26px;
  border:1px solid #E4D6C2;
  border-radius:24px;
  background:rgba(255,253,248,.88);
}
.nf-market-club-inner{
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;
  gap:16px;
}
.nf-market-club h2{
  margin:0;
  color:#4A3313;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:30px;
}
.nf-market-club p{
  margin:8px 0 0;
  color:#6F6252;
  font-size:16px;
  line-height:1.65;
}
.nf-club-button{
  min-height:46px;
  padding:11px 18px;
  border:1px solid #4A3313;
  border-radius:13px;
  background:#4A3313;
  color:#fff;
  font:inherit;
  font-size:16px;
  font-weight:900;
  cursor:pointer;
}
.nf-market-note{
  margin-top:18px;
  color:#7C6D5B;
  font-size:15px;
  line-height:1.55;
  text-align:center;
}
.nf-error{
  margin:0 26px 20px;
  padding:13px 15px;
  border-radius:14px;
  background:#FFF0EE;
  color:#8A1F19;
  font-size:13px;
  line-height:1.5;
}
.nf-modal-bg{
  position:fixed;
  inset:0;
  z-index:1000;
  display:grid;
  place-items:center;
  padding:18px;
  background:rgba(49,35,18,.55);
  backdrop-filter:blur(6px);
}
.nf-modal{
  width:min(680px,100%);
  max-height:calc(100vh - 36px);
  overflow:auto;
  padding:26px;
  border:1px solid #E5D8C6;
  border-radius:24px;
  background:#FFFDF8;
  box-shadow:0 28px 80px rgba(49,35,18,.28);
}
.nf-modal h2{
  margin:8px 0 0;
  color:#4A3313;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:42px;
}
.nf-modal p{color:#7B6A55;font-size:14px;line-height:1.65}
.nf-modal-actions{
  display:grid;
  grid-template-columns:1.5fr 1fr;
  gap:9px;
  margin-top:18px;
}
.nf-modal-actions button,.nf-modal-actions a{
  min-height:46px;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:10px;
  border:1px solid #DCCDB9;
  border-radius:12px;
  background:#FBF6EE;
  color:#4A3313;
  font:inherit;
  font-weight:850;
  text-decoration:none;
  cursor:pointer;
}
.nf-option-list{display:grid;gap:10px;margin-top:16px}
.nf-option{
  width:100%;
  display:grid;
  grid-template-columns:1fr auto;
  align-items:center;
  gap:14px;
  padding:14px;
  border:1px solid #E2D6C5;
  border-radius:15px;
  background:#FCF8F1;
  color:#4A3313;
  text-align:left;
  font:inherit;
  cursor:pointer;
}
.nf-option:disabled{opacity:.5;cursor:not-allowed}
.nf-option small{display:block;margin-top:4px;color:#8C7A64}
.nf-back{
  margin-top:14px;
  border:0;
  background:transparent;
  color:#8D6100;
  font:inherit;
  font-weight:800;
  cursor:pointer;
}
.nf-success-modal{text-align:center}
.nf-success-icon{
  width:64px;
  height:64px;
  display:grid;
  place-items:center;
  margin:0 auto 14px;
  border-radius:50%;
  background:#EDF7EA;
  color:#2D7A3E;
  font-size:34px;
  font-weight:900;
}
.nf-success-modal h2{margin:0;color:#4A3313}
.nf-success-modal p{margin:12px 0 0;color:#7B6A55;font-size:16px;line-height:1.65}
.nf-success-modal strong{color:#4A3313}
.nf-success-modal .nf-yellow{width:100%;margin-top:18px}

@media(max-width:700px){
  .nf-confirmation-details,.nf-pickup-top,.nf-change-strip{grid-template-columns:1fr}
  .nf-total-block{text-align:left}
  .nf-market-club-inner{grid-template-columns:auto 1fr}
  .nf-market-club .nf-club-button{grid-column:1/-1}
}
@media(max-width:480px){
  .nf-market-confirmation{padding-left:12px;padding-right:12px}
  .nf-status-row,.nf-sheet-section,.nf-change-strip,.nf-market-club{padding-left:18px;padding-right:18px}
  .nf-status-row{grid-template-columns:1fr;text-align:center}
  .nf-status-icon{margin:0 auto}
  .nf-confirmation-details{gap:16px}
  .nf-market-item{grid-template-columns:1fr}
  .nf-market-item span:last-child{text-align:left}
  .nf-market-actions{grid-template-columns:1fr 1fr;gap:10px 14px}
  .nf-market-actions .nf-primary-action{grid-column:1/-1}
  .nf-modal-actions{grid-template-columns:1fr}
}
`;

const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
const tex = (t) => (t === "spun" ? "Spun" : "Regular");

export default function MarketConfirmationPage({
  receipt,
  cancelled,
  canChange,
  minutesLeft,
  busy,
  error,
  onReplace,
  onPay,
  onStartAnother,
  onHome,
  onStory,
  onJoinClub,
  contactEmail,
  Logo,
  styles,
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("rules");
  const [item, setItem] = useState(null);
  const [localError, setLocalError] = useState("");
  const [changeSuccess, setChangeSuccess] = useState(null);

  const subject = encodeURIComponent(
    `Question about NectarFusions order #${receipt.order_no}`
  );
  const changeUsed = Boolean(
    receipt.change_used || (receipt.changes || []).length
  );

  const replace = async (flavor) => {
    setLocalError("");
    try {
      const from = item.flavor;
      await onReplace(item.id, flavor.id);
      setOpen(false);
      setStep("rules");
      setItem(null);
      setChangeSuccess({ from, to: flavor.name });
    } catch (e) {
      setLocalError(e.message);
    }
  };

  const paymentTitle = cancelled
    ? "This order has been cancelled."
    : receipt.requires_prepay && !receipt.paid
      ? "Complete payment before pickup."
      : "Pay at the market table.";

  const paymentCopy = cancelled
    ? "Nothing is owed."
    : receipt.requires_prepay && !receipt.paid
      ? "Use the secure payment button below to reserve your jars."
      : "Cash, card, or tap.";

  return (
    <div className="nf nf-market-confirmation">
      <style>{styles}</style>
      <style>{CSS}</style>

      <main className="nf-market-main">
        <header className="nf-market-header">
          <button
            className="nf-market-logo"
            onClick={onHome}
            aria-label="NectarFusions home"
          >
            <Logo size={68} />
          </button>
          <div className="nf-market-kicker">
            {cancelled ? "Order cancelled" : "Order confirmed"}
          </div>
          <h1>#{receipt.order_no}</h1>
          <p>
            Keep this confirmation handy for pickup. You can also reopen it
            anytime using the private link in your email.
          </p>
        </header>

        <section className="nf-confirmation-sheet">
          <div className="nf-status-row">
            <div className="nf-status-icon">{cancelled ? "×" : "✓"}</div>
            <div className="nf-status-copy">
              <div className="nf-market-label">
                {cancelled ? "Cancelled" : "Payment"}
              </div>
              <h2>{paymentTitle}</h2>
              <p>{paymentCopy}</p>
            </div>
          </div>

          {(error || localError) && (
            <div className="nf-error">{localError || error}</div>
          )}

          <div className="nf-sheet-section">
            <div className="nf-market-label">Confirmation details</div>
            <div className="nf-confirmation-details">
              <div>
                <div className="nf-market-label">Order number</div>
                <div className="nf-detail-value">#{receipt.order_no}</div>
              </div>
              <div>
                <div className="nf-market-label">Confirmation sent to</div>
                <div className="nf-detail-value">
                  {receipt.email || receipt.customer_email}
                </div>
              </div>
            </div>
          </div>

          <div className="nf-sheet-section">
            <div className="nf-pickup-top">
              <div>
                <div className="nf-market-label">Market pickup</div>
                <h3>{receipt.market_name || "Your selected market"}</h3>
                <div className="nf-market-details">
                  {receipt.market_day && <div>{receipt.market_day}</div>}
                  {receipt.market_hours && <div>{receipt.market_hours}</div>}
                  {receipt.market_address && <div>{receipt.market_address}</div>}
                </div>
              </div>

              <div className="nf-total-block">
                <div className="nf-market-label">Order total</div>
                <span className="nf-market-total">
                  {money(receipt.total_cents)}
                </span>
              </div>
            </div>

            <div className="nf-market-items">
              {(receipt.items || []).map((x) => (
                <div className="nf-market-item" key={x.id}>
                  <strong>
                    {x.qty}× {x.flavor}
                  </strong>
                  <span>
                    {x.size} {tex(x.type)}
                  </span>
                </div>
              ))}
            </div>

            {receipt.requires_prepay && !receipt.paid && (
              <button
                className="nf-pay-button"
                onClick={onPay}
                disabled={busy}
              >
                Pay {money(receipt.total_cents)} securely
              </button>
            )}
          </div>

          {!cancelled && (
            <div className="nf-change-strip">
              <div>
                {changeUsed ? (
                  <>
                    <strong>Your one online change has been used.</strong>
                    <p>
                      Each order may be changed online one time only. Contact
                      NectarFusions for any additional help.
                    </p>
                  </>
                ) : canChange ? (
                  <>
                    <strong>
                      You have {minutesLeft} minute
                      {minutesLeft === 1 ? "" : "s"} remaining.
                    </strong>
                    <p>
                      You may make one online flavor change while the window is
                      open. Size, texture, quantity, and price must stay the same.
                    </p>
                  </>
                ) : (
                  <>
                    <strong>The online change window has closed.</strong>
                    <p>
                      Your confirmation remains available. Contact NectarFusions
                      for additional help.
                    </p>
                  </>
                )}
              </div>

              {changeUsed ? (
                <button
                  className="nf-yellow"
                  type="button"
                  disabled
                  aria-disabled="true"
                >
                  Change Already Used
                </button>
              ) : canChange ? (
                <button
                  className="nf-yellow"
                  onClick={() => {
                    setStep("rules");
                    setOpen(true);
                  }}
                >
                  Make My One Change
                </button>
              ) : null}
            </div>
          )}
        </section>

        <nav className="nf-market-actions">
          <button
            className="nf-primary-action"
            onClick={onStartAnother}
          >
            Start Another Order
          </button>
          <button onClick={onHome}>Home</button>
          <button onClick={onStory}>Our Story</button>
          <a href={`mailto:${contactEmail}?subject=${subject}`}>Contact</a>
        </nav>

        <section className="nf-market-club">
          <div className="nf-market-club-inner">
            <Logo size={48} />
            <div>
              <h2>Bring the discovery home</h2>
              <p>
                Join the Honey Club for shelf-price honey, free local delivery
                with no minimum, and a bonus jar every third box.
              </p>
            </div>
            <button className="nf-club-button" onClick={onJoinClub}>
              View Offers
            </button>
          </div>
        </section>

        <div className="nf-market-note">
          Use the private link in your email to reopen this confirmation.
        </div>
      </main>

      {open && (
        <div
          className="nf-modal-bg"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setOpen(false)
          }
        >
          <section className="nf-modal" role="dialog" aria-modal="true">
            {step === "rules" && (
              <>
                <div className="nf-market-label">
                  One change · 30-minute window
                </div>
                <h2>Use your one order change?</h2>
                <p>
                  You may replace one flavor with another available flavor of
                  the same size, texture, quantity, and price. Once completed,
                  this order cannot be changed online again.
                </p>
                <p>
                  You cannot add jars, change sizes or texture, increase the
                  total, or request a refund here. For anything else, contact
                  NectarFusions directly.
                </p>
                <div className="nf-modal-actions">
                  <button
                    className="nf-yellow"
                    onClick={() => setStep("items")}
                  >
                    Yes, Use My One Change
                  </button>
                  <a href={`mailto:${contactEmail}?subject=${subject}`}>
                    Email Us
                  </a>
                </div>
                <button className="nf-back" onClick={() => setOpen(false)}>
                  Keep My Order
                </button>
              </>
            )}

            {step === "used" && (
              <>
                <div className="nf-market-label">
                  Online change limit reached
                </div>
                <h2>You can only change your order once</h2>
                <p>
                  This order has already used its one online flavor change.
                  Please contact NectarFusions and include order #
                  {receipt.order_no} so we can help.
                </p>
                <div className="nf-modal-actions">
                  <a href={`mailto:${contactEmail}?subject=${subject}`}>
                    Email Us
                  </a>
                  <button
                    className="nf-yellow"
                    onClick={() => setOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </>
            )}

            {step === "items" && (
              <>
                <div className="nf-market-label">Choose a jar</div>
                <h2>Which flavor would you like to replace?</h2>
                <p>
                  Only jars with eligible in-stock replacements can be selected.
                </p>
                <div className="nf-option-list">
                  {(receipt.items || []).map((x) => (
                    <button
                      className="nf-option"
                      key={x.id}
                      disabled={!x.eligible_flavors?.length || busy}
                      onClick={() => {
                        setItem(x);
                        setStep("flavors");
                      }}
                    >
                      <span>
                        <strong>
                          {x.qty}× {x.flavor}
                        </strong>
                        <small>
                          {x.size} {tex(x.type)} · total stays the same
                        </small>
                      </span>
                      <span>
                        {x.eligible_flavors?.length
                          ? `${x.eligible_flavors.length} choices`
                          : "No eligible flavors"}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  className="nf-back"
                  onClick={() => setStep("rules")}
                >
                  Back
                </button>
              </>
            )}

            {step === "flavors" && item && (
              <>
                <div className="nf-market-label">
                  Eligible replacements only
                </div>
                <h2>Replace {item.flavor}</h2>
                <p>
                  Only same-size, same-texture, same-price flavors are shown.
                </p>
                <div className="nf-option-list">
                  {(item.eligible_flavors || []).map((f) => (
                    <button
                      className="nf-option"
                      key={f.id}
                      disabled={busy}
                      onClick={() => replace(f)}
                    >
                      <strong>{f.name}</strong>
                      <span>Same value</span>
                    </button>
                  ))}
                </div>
                <button
                  className="nf-back"
                  onClick={() => setStep("items")}
                >
                  Choose a different jar
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {changeSuccess && (
        <div className="nf-modal-bg" role="presentation">
          <section
            className="nf-modal nf-success-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-success-title"
          >
            <div className="nf-success-icon">✓</div>
            <h2 id="change-success-title">Your order has been updated</h2>
            <p>
              <strong>{changeSuccess.from}</strong> was replaced with{" "}
              <strong>{changeSuccess.to}</strong>.
            </p>
            <p>
              Your order total stayed the same. Your confirmation page now
              shows the updated flavor.
            </p>
            <p>
              This was the one online change allowed for this order. Contact
              NectarFusions for any additional help.
            </p>
            <button
              className="nf-yellow"
              onClick={() => setChangeSuccess(null)}
            >
              Done
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
