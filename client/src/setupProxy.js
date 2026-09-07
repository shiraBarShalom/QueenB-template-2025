const { createProxyMiddleware } = require("http-proxy-middleware");

// Used by react-scripts so browser calls to /api/* reach Express on port 5000.
module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:5000",
      changeOrigin: true,
    })
  );
};
