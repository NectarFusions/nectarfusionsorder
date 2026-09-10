import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const rootElement = document.getElementById("root");
const SubscriptionBonusNotifier = React.lazy(() =>
  import("./SubscriptionBonusNotifier.jsx")
);

function ErrorScreen({ title, error }) {
  const message = error?.message || String(error || "Unknown error");
  const stack = error?.stack || "";

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "40px 20px",
        background: "#F5EFE7",
        color: "#111",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          background: "#fff",
          border: "2px solid #E69B00",
          borderRadius: 10,
          padding: 24,
        }}
      >
        <h1 style={{ marginTop: 0, fontSize: 26 }}>{title}</h1>
        <p style={{ lineHeight: 1.6 }}>
          The website files loaded, but one part of the app produced this error:
        </p>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            background: "#FFF7E2",
            padding: 14,
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          {message}
        </pre>
        {stack && (
          <details style={{ marginTop: 16 }}>
            <summary>Technical details</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontSize: 12,
                marginTop: 10,
              }}
            >
              {stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("NectarFusions render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          title="NectarFusions could not render"
          error={this.state.error}
        />
      );
    }
    return this.props.children;
  }
}

class NonFatalNotifierBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Honey Club reminder unavailable:", error, info);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function isFulfillmentRoute() {
  const path = window.location.pathname.replace(/\/+$/, "");

  return (
    path === "/admin/honey-club" ||
    /^\/club\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/fulfillment$/i.test(
      path
    )
  );
}

if (!rootElement) {
  document.body.innerHTML =
    '<pre style="padding:20px">NectarFusions error: index.html does not contain an element with id="root".</pre>';
} else {
  const root = ReactDOM.createRoot(rootElement);

  if (isFulfillmentRoute()) {
    import("./SubscriptionFulfillmentPortal.jsx")
      .then(({ default: SubscriptionFulfillmentPortal }) => {
        root.render(
          <React.StrictMode>
            <ErrorBoundary>
              <SubscriptionFulfillmentPortal />
            </ErrorBoundary>
          </React.StrictMode>
        );
      })
      .catch((error) => {
        console.error("Honey Club fulfillment startup error:", error);
        root.render(
          <ErrorScreen
            title="Honey Club settings could not start"
            error={error}
          />
        );
      });
  } else {
    Promise.all([
      import("./App.jsx"),
      import("./SubscriptionFulfillmentLauncher.jsx"),
    ])
      .then(([{ default: App }, { default: Launcher }]) => {
        root.render(
          <React.StrictMode>
            <ErrorBoundary>
              <App />
              <Launcher />
            </ErrorBoundary>
            <NonFatalNotifierBoundary>
              <React.Suspense fallback={null}>
                <SubscriptionBonusNotifier />
              </React.Suspense>
            </NonFatalNotifierBoundary>
          </React.StrictMode>
        );
      })
      .catch((error) => {
        console.error("NectarFusions startup error:", error);
        root.render(
          <ErrorScreen
            title="NectarFusions could not start"
            error={error}
          />
        );
      });
  }
}
