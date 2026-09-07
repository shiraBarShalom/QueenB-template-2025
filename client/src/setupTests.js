import "@testing-library/jest-dom";

jest.mock("react-router-dom", () => {
  const React = require("react");
  return {
    Link: ({ children, to, ...props }) =>
      React.createElement("a", { href: typeof to === "string" ? to : "/", ...props }, children),
    NavLink: ({ children, to }) =>
      React.createElement("a", { href: typeof to === "string" ? to : "/" }, children),
    MemoryRouter: ({ children }) => React.createElement(React.Fragment, null, children),
    BrowserRouter: ({ children }) => React.createElement(React.Fragment, null, children),
    Routes: ({ children }) => React.createElement(React.Fragment, null, children),
    Route: ({ element }) => element || null,
    Outlet: () => null,
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: "/", search: "", state: null }),
    useParams: () => ({ id: "1" }),
    useSearchParams: () => [new URLSearchParams(""), jest.fn()],
    Navigate: ({ to }) =>
      React.createElement("div", null, `Redirected to ${typeof to === "string" ? to : "/"}`),
  };
});
