const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
    app.use(
        ['/api', '/cam'],
        createProxyMiddleware({
            target: 'http://202.10.40.22:3000',
            changeOrigin: true,
            proxyTimeout: 20000,
            timeout: 20000,
            on: {
                error: (err, req, res) => {
                    console.error('[PROXY ERROR]', err.message);
                    res.status(502).json({ error: err.message });
                },
                proxyReq: (proxyReq, req) => {
                    console.log('[PROXY]', req.method, req.url, '→ 202.10.40.22:3000');
                },
            },
        })
    );
};